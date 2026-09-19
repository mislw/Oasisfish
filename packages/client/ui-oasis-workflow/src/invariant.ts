/** Package-owned invariant companion for the Oasis UI workflow launcher. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-oasis-workflow'

export const name = 'client-ui-oasis-workflow-invariant'
export const inject = ['invariants']

// No runtime invariant: prompt and slot registrations are fiber-owned, and launcher state is browser-local and disposable.
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
