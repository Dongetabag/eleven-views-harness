/**
 * Cursor Agent CLI adapter. It exposes the models available to the locally
 * authenticated Cursor account and lets Cursor own each inner coding run.
 * @module @deepseek-ai/dsh-llm-cursor-agent
 */

import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { CursorAgentAdapter } from './adapter.ts'
import type { CursorCommandResult } from './adapter.ts'

export { CursorAgentAdapter, cursorPrompt, parseCursorModels } from './adapter.ts'
export type { CursorAgentAdapterOptions, CursorAgentResult, CursorCommandResult, CursorCommandRunner } from './adapter.ts'

export const name = 'llm-cursor-agent'
export const inject = ['attachments', 'llm', 'subprocess']

/** Cursor CLI process configuration. */
export interface Config {
  /** Provider id shown by the Harness model selector. */
  providerName: string
  /** Cursor Agent executable or PATH name. */
  command: string
  /** Workspace used by primary Cursor runs. */
  cwd?: string
  /** Let the non-interactive Cursor run execute its own tools without prompts. */
  force: boolean
}

export const Config: z<Config> = z.object({
  providerName: z.string().default('cursor-agent'),
  command: z.string().default('agent'),
  cwd: z.string(),
  force: z.boolean().default(true),
})

export function apply(ctx: Context, config: Config): void {
  const cwd = resolve(config.cwd ?? process.cwd())
  const subprocess: SubprocessRuntime = ctx.subprocess
  const run = async (
    args: readonly string[],
    stdin: string | undefined,
    signal: AbortSignal | undefined,
  ): Promise<CursorCommandResult> => {
    const handle = subprocess.spawn({
      argv: [config.command, ...args],
      cwd,
      stdio: {
        stdin: stdin === undefined ? 'ignore' : { data: stdin },
        stdout: { maxBytes: 4 * 1024 * 1024 },
        stderr: { maxBytes: 1024 * 1024 },
      },
      graceMs: 3_000,
      signal,
      env: {},
    })
    const outcome = await handle.done
    const stdout = handle.collected.stdout?.readFrom(0)
    const stderr = handle.collected.stderr?.readFrom(0)
    return {
      exitCode: outcome.exitCode,
      stdout: stdout?.text ?? '',
      stderr: stderr?.text ?? '',
      truncated: stdout?.lossy === true || stderr?.lossy === true,
    }
  }
  ctx.llm.registerAdapter([config.providerName], new CursorAgentAdapter({
    provider: config.providerName,
    command: config.command,
    cwd,
    force: config.force,
    attachments: ctx.attachments,
    run,
  }))
}
