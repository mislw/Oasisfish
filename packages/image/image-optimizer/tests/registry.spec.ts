import { Context } from '@deepseek-ai/cordis'
import { ImageOptimizer } from '@deepseek-ai/dsh-image-optimizer'
import type {
  ImageOptimizationCandidate,
  ImageOptimizationProvider,
} from '@deepseek-ai/dsh-image-optimizer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { candidate, ids, optimizeBase, provider, requestFixture, resolved } from './fixtures.ts'

describe('image optimization Provider registry', () => {
  let ctx: Context

  beforeEach(async () => {
    ctx = new Context()
    await ctx.plugin(ImageOptimizer)
  })

  afterEach(async () => {
    await ctx.fiber.dispose()
  })

  it('sorts scored candidates and removes a disposed Provider', async () => {
    const alpha = provider('alpha', 10, [candidate('case', 'b', 0.7)])
    const beta = provider('beta', 20, [candidate('case', 'a', 0.7)])
    const disposeAlpha = ctx.imageOptimizer.registerProvider(alpha)
    ctx.imageOptimizer.registerProvider(beta)

    expect(ids(await optimizeBase(ctx))).toEqual(['beta:a', 'alpha:b'])

    disposeAlpha()
    expect(ids(await optimizeBase(ctx))).toEqual(['beta:a'])
  })

  it('uses ordinal Provider-name and candidate-id ordering for non-ASCII ties', async () => {
    const disposeZ = ctx.imageOptimizer.registerProvider(provider('z', 1, [candidate('case', 'same', 0.7)]))
    const disposeUmlaut = ctx.imageOptimizer.registerProvider(provider('ä', 1, [candidate('case', 'same', 0.7)]))

    expect(ids(await optimizeBase(ctx))).toEqual(['z:same', 'ä:same'])

    disposeZ()
    disposeUmlaut()
    ctx.imageOptimizer.registerProvider(provider('library', 1, [
      candidate('case', 'ä', 0.7),
      candidate('case', 'z', 0.7),
    ]))

    expect(ids(await optimizeBase(ctx))).toEqual(['library:z', 'library:ä'])
  })

  it('keeps explicit candidates before automatic candidates', async () => {
    const explicit = candidate('case', 'chosen', 0)
    const automatic = candidate('case', 'matched', 1)
    const source: ImageOptimizationProvider = {
      name: 'library',
      rank: 1,
      async resolve() {
        return [explicit]
      },
      async match() {
        return [automatic]
      },
    }
    ctx.imageOptimizer.registerProvider(source)

    const result = await ctx.imageOptimizer.optimize(
      requestFixture({ caseIds: ['chosen'] }),
      resolved(),
    )

    expect(ids(result)).toEqual(['library:chosen', 'library:matched'])
  })

  it('rejects duplicate Provider names in one Context', () => {
    ctx.imageOptimizer.registerProvider(provider('library', 1, []))

    expect(() => ctx.imageOptimizer.registerProvider(provider('library', 2, [])))
      .toThrow('duplicate image optimization Provider: library')
  })

  it('rejects invalid Provider names and ranks before registration', () => {
    expect(() => ctx.imageOptimizer.registerProvider(provider(' library ', 1, [])))
      .toThrow('non-empty trimmed string')
    expect(() => ctx.imageOptimizer.registerProvider(provider('library', Number.NaN, [])))
      .toThrow('rank must be finite')
  })

  it('removes a Provider when its contributing fiber is disposed', async () => {
    const fiber = await ctx.plugin(Object.assign((inner: Context) => {
      inner.imageOptimizer.registerProvider(provider('library', 1, [candidate('case', 'owned', 1)]))
    }, { inject: ['imageOptimizer'] }))
    expect(ids(await optimizeBase(ctx))).toEqual(['library:owned'])

    await fiber.dispose()

    expect(ids(await optimizeBase(ctx))).toEqual([])
  })

  it('forwards one cancellation signal to Provider resolution and matching', async () => {
    const signal = new AbortController().signal
    const resolve = vi.fn(async (): Promise<readonly ImageOptimizationCandidate[]> => [
      candidate('case', 'chosen', 0.5),
    ])
    const match = vi.fn(async (): Promise<readonly ImageOptimizationCandidate[]> => [])
    ctx.imageOptimizer.registerProvider({ name: 'library', rank: 1, resolve, match })

    await ctx.imageOptimizer.optimize(
      requestFixture({ caseIds: ['chosen'] }),
      { signal, resolvedReferences: [] },
    )

    expect(resolve).toHaveBeenCalledWith({ caseIds: ['chosen'] }, signal)
    expect(match).toHaveBeenCalledWith({
      intent: 'Create a square launch graphic.',
      locale: 'en',
      category: 'general',
      styleHints: ['editorial'],
      sceneHints: ['studio'],
    }, signal)
  })
})
