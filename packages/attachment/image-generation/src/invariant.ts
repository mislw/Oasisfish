/** Package-owned invariant companion for `@deepseek-ai/dsh-image-generation`. */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-image-generation'
export const name = 'image-generation-invariant'
export const inject = ['invariants']
/** No runtime invariant: settings resolution, HTTP validation, and attachment persistence are enforced by the operation. */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
