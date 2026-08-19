import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { describe, expect, it, vi } from 'vitest'
import { CursorAgentAdapter, cursorPrompt, parseCursorModels } from '../src/adapter.ts'

describe('CursorAgentAdapter', () => {
  it('parses the authenticated account catalog and always offers auto', () => {
    expect(parseCursorModels('cursor-agent', [
      'Available models',
      '',
      'auto - Auto (default)',
      'composer-2.5 - Composer 2.5',
      'Tip: use --model <id>',
    ].join('\n'))).toEqual([
      { provider: 'cursor-agent', id: 'auto', name: 'Auto (default)', inputModalities: ['text'] },
      { provider: 'cursor-agent', id: 'composer-2.5', name: 'Composer 2.5', inputModalities: ['text'] },
    ])
  })

  it('renders the complete Harness conversation as a standalone Cursor task', () => {
    const prompt = cursorPrompt({
      provider: 'cursor-agent',
      model: 'auto',
      system: 'Stay concise.',
      messages: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Build it.' }] })],
    })
    expect(prompt).toContain('SYSTEM INSTRUCTIONS\nStay concise.')
    expect(prompt).toContain('USER\nBuild it.')
  })

  it('runs Cursor non-interactively and maps its final result to the LLM stream', async () => {
    const run = vi.fn().mockResolvedValue({
      exitCode: 0,
      stderr: '',
      truncated: false,
      stdout: JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'CURSOR_PRIMARY_READY',
        usage: { inputTokens: 12, outputTokens: 3, cacheReadTokens: 4, cacheWriteTokens: 0 },
      }),
    })
    const adapter = new CursorAgentAdapter({
      provider: 'cursor-agent',
      command: 'agent',
      cwd: '/workspace',
      force: true,
      run,
    })
    const chunks = await Array.fromAsync(adapter.stream({
      provider: 'cursor-agent',
      model: 'auto',
      messages: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Ready?' }] })],
    }))

    expect(run).toHaveBeenCalledOnce()
    expect(run.mock.calls[0]?.[0]).toEqual([
      '--print', '--trust', '--workspace', '/workspace',
      '--model', 'auto', '--output-format', 'json', '--force',
    ])
    expect(run.mock.calls[0]?.[1]).toContain('USER\nReady?')
    expect(chunks).toContainEqual({ type: 'text-delta', index: 0, text: 'CURSOR_PRIMARY_READY' })
    expect(chunks).toContainEqual({
      type: 'usage',
      usage: { inputTokens: 12, outputTokens: 3, cacheReadTokens: 4, cacheWriteTokens: 0 },
    })
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
    expect(adapter.providerRetryPolicy('cursor-agent').mode).toBe('normal')
    expect(adapter.providerRetryPolicy('cursor-agent')).toMatchObject({ maxRetries: 0 })
  })

  it('falls back to Auto when model discovery cannot complete', async () => {
    const adapter = new CursorAgentAdapter({
      provider: 'cursor-agent',
      command: 'agent',
      cwd: '/workspace',
      force: false,
      run: vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'login required', truncated: false }),
    })
    await expect(adapter.listModels('cursor-agent')).resolves.toEqual([
      { provider: 'cursor-agent', id: 'auto', name: 'Auto', inputModalities: ['text'] },
    ])
  })
})
