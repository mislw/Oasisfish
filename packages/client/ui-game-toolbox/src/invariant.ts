import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-game-toolbox'
export const name = 'client-ui-game-toolbox-invariant'
export const inject = ['invariants']
/** No runtime invariant: this browser-only package contributes effect-owned slots and reads existing client stores. */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
