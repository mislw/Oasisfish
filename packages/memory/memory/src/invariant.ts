/** Package invariant companion for the durable memory Service Definition. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-memory'
export const name = 'memory-invariant'
export const inject = ['invariants']

/** No runtime invariant: provider presence is checked by every operation and registration is effect-owned. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
