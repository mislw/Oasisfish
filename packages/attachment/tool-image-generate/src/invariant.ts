/** Package-owned invariant companion for `@deepseek-ai/dsh-tool-image-generate`. */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
const PACKAGE_NAME = '@deepseek-ai/dsh-tool-image-generate'
export const name = 'tool-image-generate-invariant'
export const inject = ['invariants']
/** No runtime invariant: the image-generation capability owns execution relations. */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
