import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as invariant from '../src/invariant.ts'

describe('memory invariant companion', () => {
  it('registers its package-owned invariant', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    const register = vi.spyOn(ctx.invariants, 'register')
    await ctx.plugin(invariant)
    expect(register).toHaveBeenCalledWith('@deepseek-ai/dsh-memory', expect.any(Function))
    await ctx.fiber.dispose()
  })
})
