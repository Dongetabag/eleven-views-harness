import { access, readFile, stat } from 'node:fs/promises'
import { AttachmentError, AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { AttachmentStore, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { CallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { describe, expect, it, vi } from 'vitest'
import { CursorAgentAdapter, cursorPrompt, parseCursorModels } from '../src/adapter.ts'

const imageRef: ImageAttachmentRef = {
  attachmentId: AttachmentId(`sha256:${'a'.repeat(64)}`),
  mediaType: 'image/png',
  bytes: 4,
  width: 1,
  height: 1,
}

const attachments = {
  readImage: vi.fn((ref: ImageAttachmentRef) => Promise.resolve({ ref, data: Uint8Array.of(1, 2, 3, 4) })),
} as unknown as AttachmentStore

function cursorResult(result = 'ok', usage?: object): string {
  return JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result, ...usage === undefined ? {} : { usage } })
}

function adapter(
  run: ConstructorParameters<typeof CursorAgentAdapter>[0]['run'],
  store: AttachmentStore = attachments,
  force = true,
): CursorAgentAdapter {
  return new CursorAgentAdapter({
    provider: 'cursor-agent',
    command: 'agent',
    cwd: '/workspace',
    force,
    attachments: store,
    run,
  })
}

async function drain(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _chunk of stream) { /* drain */ }
}

describe('CursorAgentAdapter', () => {
  it('parses the authenticated account catalog and always offers auto', () => {
    expect(parseCursorModels('cursor-agent', [
      'Available models',
      '',
      'auto - Auto (default)',
      'composer-2.5 - Composer 2.5',
      'Tip: use --model <id>',
    ].join('\n'))).toEqual([
      { provider: 'cursor-agent', id: 'auto', name: 'Auto (default)', inputModalities: ['text', 'image'] },
      { provider: 'cursor-agent', id: 'composer-2.5', name: 'Composer 2.5', inputModalities: ['text', 'image'] },
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

  it('renders structured, nested, missing, and merge-extensible conversation blocks', () => {
    const unsupported = { type: 'future-block' } as unknown as ContentBlock
    const call1 = CallId('call-1')
    const call2 = CallId('call-2')
    const prompt = cursorPrompt({
      provider: 'cursor-agent',
      model: 'auto',
      messages: [createUserMessage({
        source: { kind: 'user' },
        content: [
          { type: 'image', attachment: imageRef },
          { type: 'tool-call', id: call1, name: 'inspect', arguments: '{}' },
          { type: 'tool-result', toolCallId: call1, isError: false, content: [{ type: 'text', text: 'done' }] },
          { type: 'tool-result', toolCallId: call2, isError: true, content: [{ type: 'reasoning', text: 'failed' }] },
          unsupported,
        ],
      })],
    })

    expect(prompt).toContain('[Image attachment]')
    expect(prompt).toContain('[Tool call inspect: {}]')
    expect(prompt).toContain('[Tool result success: done]')
    expect(prompt).toContain('[Tool result error: failed]')
    expect(prompt).toContain('[Unsupported conversation block]')
  })

  it('deduplicates catalog models and inserts Auto when discovery omits it', () => {
    expect(parseCursorModels('cursor-agent', 'composer - Composer\ncomposer - Duplicate')).toEqual([
      { provider: 'cursor-agent', id: 'auto', name: 'Auto', inputModalities: ['text', 'image'] },
      { provider: 'cursor-agent', id: 'composer', name: 'Composer', inputModalities: ['text', 'image'] },
    ])
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
    const cursor = adapter(run)
    const chunks = await Array.fromAsync(cursor.stream({
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
    expect(cursor.providerInfo('cursor-agent')).toEqual({ id: 'cursor-agent', name: 'Cursor Agent' })
    expect(cursor.providerRetryPolicy('cursor-agent').mode).toBe('normal')
    expect(cursor.providerRetryPolicy('cursor-agent')).toMatchObject({ maxRetries: 0 })
    await expect(cursor.resolveModel('cursor-agent', 'auto')).resolves.toEqual({
      provider: 'cursor-agent', id: 'auto', name: 'auto', inputModalities: ['text', 'image'],
    })
  })

  it('materializes images for Cursor and removes the private directory after the run', async () => {
    let imageDirectory: string | undefined
    const run = vi.fn(async (args: readonly string[], stdin: string | undefined) => {
      const addDirIndex = args.indexOf('--add-dir')
      imageDirectory = args[addDirIndex + 1]
      expect(imageDirectory).toBeDefined()
      const match = /\[Image attachment: (.+)\]/u.exec(stdin ?? '')
      expect(match?.[1]).toBeDefined()
      const imagePath = match?.[1] as string
      expect(await readFile(imagePath)).toEqual(Buffer.from([1, 2, 3, 4]))
      expect((await stat(imagePath)).mode & 0o777).toBe(0o600)
      return {
        exitCode: 0,
        stderr: '',
        truncated: false,
        stdout: cursorResult('I can see it.'),
      }
    })
    const cursor = adapter(run)

    const chunks = await Array.fromAsync(cursor.stream({
      provider: 'cursor-agent',
      model: 'auto',
      messages: [createUserMessage({
        source: { kind: 'user' },
        content: [
          { type: 'text', text: 'What is shown?' },
          { type: 'image', attachment: imageRef },
        ],
      })],
    }))

    expect(run.mock.calls[0]?.[0]).toContain('--add-dir')
    expect(run.mock.calls[0]?.[1]).toContain('Inspect every referenced file')
    expect(chunks).toContainEqual({ type: 'text-delta', index: 0, text: 'I can see it.' })
    expect(imageDirectory).toBeDefined()
    await expect(access(imageDirectory as string)).rejects.toThrow()
  })

  it('materializes images nested in tool results only once per durable reference', async () => {
    const readImage = vi.fn((ref: ImageAttachmentRef) => Promise.resolve({ ref, data: Uint8Array.of(1) }))
    const store = { readImage } as unknown as AttachmentStore
    const run = vi.fn().mockResolvedValue({ exitCode: 0, stdout: cursorResult(), stderr: '', truncated: false })
    const cursor = adapter(run, store)

    await drain(cursor.stream({
      provider: 'cursor-agent',
      model: 'auto',
      messages: [createUserMessage({
        source: { kind: 'user' },
        content: [{
          type: 'tool-result',
          toolCallId: CallId('call-1'),
          isError: false,
          content: [
            { type: 'image', attachment: imageRef },
            { type: 'image', attachment: imageRef },
          ],
        }],
      })],
    }))

    expect(readImage).toHaveBeenCalledOnce()
    const prompt = run.mock.calls[0]?.[1] as string | undefined
    expect(prompt?.match(/\[Image attachment: /gu)).toHaveLength(2)
  })

  it.each([
    new AttachmentError('missing image', 'ATTACHMENT_NOT_FOUND'),
    new Error('unexpected read failure'),
  ])('cleans up when attachment materialization fails: %s', async (failure) => {
    const store = { readImage: vi.fn().mockRejectedValue(failure) } as unknown as AttachmentStore
    const run = vi.fn()
    const cursor = adapter(run, store)
    const operation = drain(cursor.stream({
      provider: 'cursor-agent',
      model: 'auto',
      messages: [createUserMessage({
        source: { kind: 'user' },
        content: [{ type: 'image', attachment: imageRef }],
      })],
    }))

    if (failure instanceof AttachmentError) {
      await expect(operation).rejects.toMatchObject({ message: 'missing image', code: 'ATTACHMENT_NOT_FOUND', cause: failure })
    } else {
      await expect(operation).rejects.toBe(failure)
    }
    expect(run).not.toHaveBeenCalled()
  })

  it('lists discovered models through the configured command runner', async () => {
    const run = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'auto - Auto\ncomposer - Composer',
      stderr: '',
      truncated: false,
    })
    await expect(adapter(run).listModels('cursor-agent')).resolves.toHaveLength(2)
  })

  it('falls back to Auto when model discovery cannot complete', async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'login required', truncated: false })
    await expect(adapter(run, attachments, false).listModels('cursor-agent')).resolves.toEqual([
      { provider: 'cursor-agent', id: 'auto', name: 'Auto', inputModalities: ['text', 'image'] },
    ])
  })

  it('falls back to Auto when model discovery output is truncated', async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', truncated: true })
    await expect(adapter(run).listModels('cursor-agent')).resolves.toHaveLength(1)
  })

  it.each([
    { result: { exitCode: 0, stdout: cursorResult(), stderr: '', truncated: true }, message: 'Cursor Agent output exceeded its configured limit' },
    { result: { exitCode: 7, stdout: '', stderr: 'cursor failed', truncated: false }, message: 'cursor failed' },
    { result: { exitCode: 9, stdout: '', stderr: '   ', truncated: false }, message: 'Cursor Agent exited with code 9' },
  ])('surfaces Cursor execution failures: $message', async ({ result, message }) => {
    const cursor = adapter(vi.fn().mockResolvedValue(result), attachments, false)
    await expect(drain(cursor.stream({
      provider: 'cursor-agent',
      model: 'auto',
      messages: [],
    }))).rejects.toThrow(message)
  })

  it.each([
    ['not-json', 'Cursor Agent returned invalid JSON output'],
    ['null', 'Cursor Agent returned an invalid result'],
    [JSON.stringify({ type: 'other', subtype: 'success', is_error: false, result: 'x' }), 'Cursor Agent did not return a successful result'],
    [JSON.stringify({ type: 'result', subtype: 'other', is_error: false, result: 'x' }), 'Cursor Agent did not return a successful result'],
    [JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'x' }), 'Cursor Agent did not return a successful result'],
    [JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 1 }), 'Cursor Agent did not return a successful result'],
  ])('rejects invalid Cursor result %s', async (stdout, message) => {
    const cursor = adapter(vi.fn().mockResolvedValue({ exitCode: 0, stdout, stderr: '', truncated: false }))
    await expect(drain(cursor.stream({ provider: 'cursor-agent', model: 'auto', messages: [] }))).rejects.toThrow(message)
  })

  it('maps an empty result and absent usage without forcing Cursor tools', async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 0, stdout: cursorResult(''), stderr: '', truncated: false })
    const chunks = await Array.fromAsync(adapter(run, attachments, false).stream({
      provider: 'cursor-agent',
      model: 'auto',
      messages: [],
    }))

    expect(run.mock.calls[0]?.[0]).not.toContain('--force')
    expect(chunks).not.toContainEqual(expect.objectContaining({ type: 'text-delta' }))
    expect(chunks).toContainEqual({ type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } })
  })
})
