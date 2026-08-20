import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AttachmentError } from '@deepseek-ai/dsh-attachment'
import type { AttachmentStore, ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import type { ContentBlock, GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, Message, ResolvedRetryPolicy, StreamChunk } from '@deepseek-ai/dsh-llm'
import { LlmAdapter, LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'

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
  attachments: AttachmentStore
  run: CursorCommandRunner
}

const NO_RETRY = resolveRetryPolicy({ mode: 'normal', maxRetries: 0 }, 'llm-cursor-agent.retryPolicy')
const IMAGE_EXTENSIONS: Record<ImageMediaType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

interface MaterializedImages {
  directory?: string
  paths: ReadonlyMap<string, string>
}

function collectImageRefs(blocks: readonly ContentBlock[], refs: Map<string, ImageAttachmentRef>): void {
  for (const block of blocks) {
    if (block.type === 'image') {
      refs.set(String(block.attachment.attachmentId), block.attachment)
    } else if (block.type === 'tool-result') {
      collectImageRefs(block.content, refs)
    }
  }
}

async function materializeImages(options: GenerateOptions, attachments: AttachmentStore): Promise<MaterializedImages> {
  const refs = new Map<string, ImageAttachmentRef>()
  for (const message of options.messages) collectImageRefs(message.content, refs)
  if (refs.size === 0) return { paths: new Map() }

  const directory = await mkdtemp(join(tmpdir(), 'dsh-cursor-images-'))
  const paths = new Map<string, string>()
  try {
    let index = 0
    for (const [attachmentId, ref] of refs) {
      const stored = await attachments.readImage(ref, options.signal)
      const path = join(directory, `image-${String(++index).padStart(3, '0')}.${IMAGE_EXTENSIONS[stored.ref.mediaType]}`)
      await writeFile(path, stored.data, { flag: 'wx', mode: 0o600 })
      paths.set(attachmentId, path)
    }
    return { directory, paths }
  } catch (error: unknown) {
    await rm(directory, { recursive: true, force: true })
    if (error instanceof AttachmentError) throw new LlmError(error.message, error.code, { cause: error })
    throw error
  }
}

function textOfBlock(block: ContentBlock, imagePaths: ReadonlyMap<string, string>): string {
  switch (block.type) {
    case 'text':
    case 'reasoning':
      return block.text
    case 'image': {
      const path = imagePaths.get(String(block.attachment.attachmentId))
      return path === undefined ? '[Image attachment]' : `[Image attachment: ${path}]`
    }
    case 'tool-call':
      return `[Tool call ${block.name}: ${block.arguments}]`
    case 'tool-result':
      return `[Tool result ${block.isError ? 'error' : 'success'}: ${block.content.map(child => textOfBlock(child, imagePaths)).join('\n')}]`
    default:
      return '[Unsupported conversation block]'
  }
}

function messageText(message: Message, imagePaths: ReadonlyMap<string, string>): string {
  return message.content.map(block => textOfBlock(block, imagePaths)).join('\n')
}

/**
 * Render the complete Harness request into one standalone Cursor Agent task.
 * @param options - Provider-neutral request assembled by the Harness loop.
 * @param imagePaths - temporary absolute paths keyed by durable attachment id.
 * @returns one role-labelled task suitable for Cursor CLI stdin.
 */
export function cursorPrompt(options: GenerateOptions, imagePaths: ReadonlyMap<string, string> = new Map()): string {
  const parts = [
    'You are the primary Cursor Agent runtime for this conversation.',
    'Use your own workspace tools when needed. Return only the final user-facing response.',
  ]
  if (imagePaths.size > 0) {
    parts.push('Image attachment markers contain absolute file paths. Inspect every referenced file with your image-reading capability before answering.')
  }
  if (options.system !== undefined && options.system.trim() !== '') {
    parts.push(`SYSTEM INSTRUCTIONS\n${options.system}`)
  }
  parts.push('CONVERSATION')
  for (const message of options.messages) {
    parts.push(`${message.role.toUpperCase()}\n${messageText(message, imagePaths)}`)
  }
  return parts.join('\n\n')
}

/**
 * Parse the human-readable `agent models` catalog.
 * @param provider - Harness provider id attached to every discovered model.
 * @param output - Complete stdout emitted by `agent models`.
 * @returns the text-and-image-capable model catalog, always including `auto`.
 */
export function parseCursorModels(provider: string, output: string): LlmModelInfo[] {
  const models: LlmModelInfo[] = []
  const seen = new Set<string>()
  for (const line of output.split(/\r?\n/u)) {
    const match = /^(\S+)\s+-\s+(.+)$/u.exec(line.trim())
    if (match === null) continue
    const id = match[1] as string
    const name = match[2] as string
    if (seen.has(id)) continue
    seen.add(id)
    models.push({ provider, id, name, inputModalities: ['text', 'image'] })
  }
  if (!seen.has('auto')) models.unshift({ provider, id: 'auto', name: 'Auto', inputModalities: ['text', 'image'] })
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
      return [{ provider, id: 'auto', name: 'Auto', inputModalities: ['text', 'image'] }]
    }
    return parseCursorModels(provider, execution.stdout)
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model, inputModalities: ['text', 'image'] })
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const images = await materializeImages(options, this.options.attachments)
    const args = [
      '--print', '--trust', '--workspace', this.options.cwd,
      ...images.directory === undefined ? [] : ['--add-dir', images.directory],
      '--model', options.model, '--output-format', 'json',
      ...this.options.force ? ['--force'] : [],
    ]
    let execution: CursorCommandResult
    try {
      execution = await this.options.run(args, cursorPrompt(options, images.paths), options.signal)
    } finally {
      if (images.directory !== undefined) await rm(images.directory, { recursive: true, force: true })
    }
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
