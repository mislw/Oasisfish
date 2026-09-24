import { Context } from '@deepseek-ai/cordis'
import { ImageOptimizer, parseCandidate } from '@deepseek-ai/dsh-image-optimizer'
import { describe, expect, it } from 'vitest'
import { candidateFixture } from './fixtures.ts'

describe('image optimizer service definition', () => {
  it('publishes exact defaults and rejects invalid bounds', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(ImageOptimizer)
    expect(ctx.imageOptimizer.config).toEqual({
      maxCases: 3,
      maxPromptBytes: 16384,
      maxExactTextEntries: 64,
    })
    await fiber.dispose()

    for (const config of [
      { maxCases: 0 },
      { maxPromptBytes: 0 },
      { maxExactTextEntries: 0 },
    ]) {
      await expect(ctx.plugin(ImageOptimizer, config)).rejects.toThrow(Object.keys(config)[0])
    }
    await ctx.fiber.dispose()
  })

  it('rejects provider candidates with unknown fields', () => {
    expect(() => parseCandidate({ ...candidateFixture(), executable: true })).toThrow('unrecognized')
  })
})
