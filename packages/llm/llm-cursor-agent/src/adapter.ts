import type { ContentBlock, GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, Message, ResolvedRetryPolicy, StreamChunk } from '@deepseek-ai/dsh-llm'
import { LlmAdapter, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'

/** Successful machine-readable result emitted by `agent --print`. */
export interface CursorAgentResult {
  type: 'result'
  subtype: 'success'
  is_error: false
  result: string
  usage?: {
    inputTokens?: number
    outputTokens?: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
  }
}

/** One bounded Cursor CLI execution supplied by the plugin process boundary. */
export interface CursorCommandResult {
  exitCode: number | null
  stdout: string
  stderr: string
  truncated: boolean
}

/** Injectable command runner used by the adapter and its tests. */
export type CursorCommandRunner = (
  args: readonly string[],
  stdin: string | undefined,
  signal: AbortSignal | undefined,
) => Promise<CursorCommandResult>

/** Runtime facts fixed for one adapter registration. */
export interface CursorAgentAdapterOptions {
  provider: string
  command: string
  cwd: string
  force: boolean
  run: CursorCommandRunner
}

const NO_RETRY = resolveRetryPolicy({ mode: 'normal', maxRetries: 0 }, 'llm-cursor-agent.retryPolicy')

function textOfBlock(block: ContentBlock): string {
  switch (block.type) {
    case 'text':
    case 'reasoning':
      return block.text
    case 'image':
      return '[Image attachment is not available to the Cursor CLI adapter.]'
    case 'tool-call':
      return `[Tool call ${block.name}: ${block.arguments}]`
    case 'tool-result':
      return `[Tool result ${block.isError ? 'error' : 'success'}: ${block.content.map(textOfBlock).join('\n')}]`
    default:
      return '[Unsupported conversation block]'
  }
}

function messageText(message: Message): string {
  return message.content.map(textOfBlock).join('\n')
}

/**
 * Render the complete Harness request into one standalone Cursor Agent task.
 * @param options - Provider-neutral request assembled by the Harness loop.
 * @returns one role-labelled task suitable for Cursor CLI stdin.
 */
export function cursorPrompt(options: GenerateOptions): string {
  const parts = [
    'You are the primary Cursor Agent runtime for this conversation.',
    'Use your own workspace tools when needed. Return only the final user-facing response.',
  ]
  if (options.system !== undefined && options.system.trim() !== '') {
    parts.push(`SYSTEM INSTRUCTIONS\n${options.system}`)
  }
  parts.push('CONVERSATION')
  for (const message of options.messages) {
    parts.push(`${message.role.toUpperCase()}\n${messageText(message)}`)
  }
  return parts.join('\n\n')
}

/**
 * Parse the human-readable `agent models` catalog.
 * @param provider - Harness provider id attached to every discovered model.
 * @param output - Complete stdout emitted by `agent models`.
 * @returns the text-capable model catalog, always including `auto`.
 */
export function parseCursorModels(provider: string, output: string): LlmModelInfo[] {
  const models: LlmModelInfo[] = []
  const seen = new Set<string>()
  for (const line of output.split(/\r?\n/u)) {
    const match = /^(\S+)\s+-\s+(.+)$/u.exec(line.trim())
    if (match === null) continue
    const [, id, name] = match
    if (id === undefined || name === undefined || seen.has(id)) continue
    seen.add(id)
    models.push({ provider, id, name, inputModalities: ['text'] })
  }
  if (!seen.has('auto')) models.unshift({ provider, id: 'auto', name: 'Auto', inputModalities: ['text'] })
  return models
}

function parseResult(output: string): CursorAgentResult {
  let value: unknown
  try {
    value = JSON.parse(output)
  } catch {
    throw new Error('Cursor Agent returned invalid JSON output')
  }
  if (typeof value !== 'object' || value === null) throw new Error('Cursor Agent returned an invalid result')
  const result = value as Partial<CursorAgentResult>
  if (result.type !== 'result' || result.subtype !== 'success' || result.is_error !== false || typeof result.result !== 'string') {
    throw new Error('Cursor Agent did not return a successful result')
  }
  return result as CursorAgentResult
}

/** LLM-seam adapter that lets Cursor Agent own the complete inner coding loop. */
export class CursorAgentAdapter extends LlmAdapter {
  constructor(private readonly options: CursorAgentAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'Cursor Agent' }
  }

  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy {
    return NO_RETRY
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const execution = await this.options.run(['models'], undefined, undefined)
    if (execution.exitCode !== 0 || execution.truncated) {
      return [{ provider, id: 'auto', name: 'Auto', inputModalities: ['text'] }]
    }
    return parseCursorModels(provider, execution.stdout)
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model, inputModalities: ['text'] })
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const args = [
      '--print', '--trust', '--workspace', this.options.cwd,
      '--model', options.model, '--output-format', 'json',
      ...this.options.force ? ['--force'] : [],
    ]
    const execution = await this.options.run(args, cursorPrompt(options), options.signal)
    if (execution.truncated) throw new Error('Cursor Agent output exceeded its configured limit')
    if (execution.exitCode !== 0) {
      const diagnostic = execution.stderr.trim()
      throw new Error(diagnostic === '' ? `Cursor Agent exited with code ${execution.exitCode}` : diagnostic)
    }
    const response = parseResult(execution.stdout)
    const text = response.result
    yield { type: 'block-start', index: 0, blockType: 'text' }
    if (text !== '') yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield {
      type: 'usage',
      usage: {
        inputTokens: response.usage?.inputTokens ?? 0,
        outputTokens: response.usage?.outputTokens ?? 0,
        ...response.usage?.cacheReadTokens === undefined ? {} : { cacheReadTokens: response.usage.cacheReadTokens },
        ...response.usage?.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: response.usage.cacheWriteTokens },
      },
    }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
