/** Package invariant companion for the local memory Provider. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
const PACKAGE_NAME = '@deepseek-ai/dsh-memory-local'
export const name = 'memory-local-invariant'
export const inject = ['invariants']
/** No runtime invariant: storage-domain validates durable state and the Service owns Provider registration. */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
