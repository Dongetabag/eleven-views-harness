/** Package-owned invariant companion for `@deepseek-ai/dsh-llm-cursor-agent`. */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-llm-cursor-agent'
export const name = 'llm-cursor-agent-invariant'
export const inject = ['invariants']
const install: InvariantInstaller = () => {
  // No runtime invariant: dependency injection validates the adapter's required services.
}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
