import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as invariant from '../src/invariant.ts'

describe('image-generation invariant companion', () => {
  it('registers its package-owned no-op invariant', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    const register = vi.spyOn(ctx.invariants, 'register')
    await ctx.plugin(invariant)
    expect(register).toHaveBeenCalledWith('@deepseek-ai/dsh-image-generation', expect.any(Function))
    expect(register.mock.calls[0]?.[1](new Context(), (message) => { throw new Error(message) })).toBeUndefined()
    await ctx.fiber.dispose()
  })
})
