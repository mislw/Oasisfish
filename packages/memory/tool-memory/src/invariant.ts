/** Package invariant companion for the memory tool Consumer. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
const PACKAGE_NAME = '@deepseek-ai/dsh-tool-memory'
export const name = 'tool-memory-invariant'
export const inject = ['invariants']
/** No runtime invariant: tool registration and context listeners are effect-owned by Cordis. */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
