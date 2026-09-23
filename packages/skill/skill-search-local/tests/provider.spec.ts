import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as SkillFileSystem from '@deepseek-ai/dsh-skill-filesystem'
import SkillSearchRegistry, { SkillSearchError, SkillSearchProviderName } from '@deepseek-ai/dsh-skill-search'
import { DeterministicFixtureEmbedder, type SkillSearchEmbedder } from '../src/embedder.ts'
import { TransformersJsEmbedder } from '../src/embedder.ts'
import * as SkillSearchLocal from '../src/index.ts'
import { LocalSkillSearchProvider, type LocalSkillSearchProviderOptions } from '../src/provider.ts'
import { openSkillSearchStore } from '../src/store.ts'

const roots: string[] = []
const disposals: Array<() => Promise<void>> = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(disposals.splice(0).map(dispose => dispose()))
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

const options: LocalSkillSearchProviderOptions = {
  providerName: 'local',
  chunkTargetCodePoints: 800,
  chunkMaxCodePoints: 1200,
  chunkOverlapCodePoints: 120,
  lexicalCandidates: 20,
  vectorCandidates: 20,
  rrfK: 60,
  headingBoost: 0.1,
  pathBoost: 0.05,
  mmrLambda: 0.6,
  defaultResultCount: 5,
  maxResultCount: 10,
}

async function setup(customEmbedder?: SkillSearchEmbedder, maxChunks = 100, providerOptions = options) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-search-provider-'))
  roots.push(root)
  const skillsRoot = join(root, 'skills')
  const skillRoot = join(skillsRoot, 'fixture-skill')
  await mkdir(join(skillRoot, 'references'), { recursive: true })
  await writeFile(join(skillRoot, 'SKILL.md'), '---\nname: fixture-skill\ndescription: Fixture skill\n---\n\nUse the references.\n')
  await writeFile(join(skillRoot, 'references', 'respawn.md'), '# 角色复活\n\n角色可以在复活点重新进入战斗。\n')

  const ctx = new Context()
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(SkillFileSystem, { includeDefaultRoots: false, customSkillDirs: [skillsRoot], watch: false })
  await ctx.plugin(SkillSearchRegistry, { corpora: [{
    skill: 'fixture-skill',
    roots: ['references'],
    extensions: ['.md', '.txt'],
    maxFileBytes: 4096,
    maxCorpusBytes: 16_384,
    maxChunks,
  }] })
  const store = await openSkillSearchStore(join(root, 'cache', 'skill-search.sqlite'))
  const fixture = new DeterministicFixtureEmbedder(16)
  let embeddedDocuments = 0
  const countingEmbedder: SkillSearchEmbedder = {
    identity: fixture.identity,
    embedDocuments(texts, signal) {
      embeddedDocuments += texts.length
      return fixture.embedDocuments(texts, signal)
    },
    embedQuery: (text, signal) => fixture.embedQuery(text, signal),
    dispose: () => fixture.dispose(),
  }
  const embedder = customEmbedder ?? countingEmbedder
  const provider = new LocalSkillSearchProvider(store, embedder, providerOptions)
  disposals.push(() => provider.dispose())
  ctx.skillSearch.registerProvider(SkillSearchProviderName('local'), provider)
  return { ctx, provider, skillRoot, store, embeddedDocuments: () => embeddedDocuments }
}

describe('LocalSkillSearchProvider', () => {
  it('disposes opened resources when named provider registration fails', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    await ctx.plugin(SkillSearchRegistry)
    ctx.skillSearch.registerProvider(SkillSearchProviderName('local'), {
      supports: () => false,
      async search() {
        throw new Error('unused')
      },
    })
    const fixture = new DeterministicFixtureEmbedder(2)
    const dispose = vi.fn(() => Promise.resolve())
    const embedder: SkillSearchEmbedder = {
      identity: fixture.identity,
      embedDocuments: (texts, signal) => fixture.embedDocuments(texts, signal),
      embedQuery: (text, signal) => fixture.embedQuery(text, signal),
      dispose,
    }
    vi.spyOn(TransformersJsEmbedder, 'create').mockResolvedValue(embedder as TransformersJsEmbedder)

    await expect(SkillSearchLocal.apply(ctx, { databasePath: ':memory:', modelRoot: 'unused' }))
      .rejects.toThrow('already registered')
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('indexes a filesystem Skill, reuses its revision, and refreshes changed source', async () => {
    const { ctx, skillRoot, embeddedDocuments } = await setup()
    const first = await ctx.skillSearch.search({ name: 'fixture-skill', query: '复活' })
    const firstEmbedded = embeddedDocuments()
    const second = await ctx.skillSearch.search({ name: 'fixture-skill', query: '复活' })

    expect(first.hits[0]).toMatchObject({ path: 'references/respawn.md', startLine: 3 })
    expect(second.hits).toEqual(first.hits)
    expect(embeddedDocuments()).toBe(firstEmbedded)

    await writeFile(join(skillRoot, 'references', 'respawn.md'), '# 角色复活\n\n阵亡玩家可以重新加入对局。\n')
    const changed = await ctx.skillSearch.search({ name: 'fixture-skill', query: '重新加入' })
    expect(changed.hits[0]?.excerpt).toContain('重新加入')
    expect(embeddedDocuments()).toBeGreaterThan(firstEmbedded)
  })

  it('preserves the committed revision after a corpus limit failure and honors cancellation', async () => {
    const { ctx, skillRoot, embeddedDocuments } = await setup()
    await ctx.skillSearch.search({ name: 'fixture-skill', query: '复活' })
    const firstEmbedded = embeddedDocuments()
    await writeFile(join(skillRoot, 'references', 'oversized.md'), 'x'.repeat(5000))

    await expect(ctx.skillSearch.search({ name: 'fixture-skill', query: '复活' }))
      .rejects.toEqual(expect.objectContaining<Partial<SkillSearchError>>({ code: 'CORPUS_LIMIT' }))
    expect(embeddedDocuments()).toBe(firstEmbedded)

    const controller = new AbortController()
    controller.abort(new Error('test cancellation'))
    await expect(ctx.skillSearch.search({ name: 'fixture-skill', query: '复活' }, { signal: controller.signal }))
      .rejects.toEqual(expect.objectContaining<Partial<SkillSearchError>>({ code: 'ABORTED' }))
  })

  it('aborts an active refresh and reaches quiescence before disposal completes', async () => {
    let markStarted!: () => void
    const started = new Promise<void>((resolve) => { markStarted = resolve })
    let observedAbort = false
    let modelDisposed = false
    const embedder: SkillSearchEmbedder = {
      identity: { id: 'blocking-fixture', revision: '1', dimensions: 2 },
      embedDocuments: (_texts, signal) => new Promise((_, reject) => {
        markStarted()
        signal.addEventListener('abort', () => {
          observedAbort = true
          reject(signal.reason instanceof Error ? signal.reason : new Error('fixture provider was aborted'))
        }, { once: true })
      }),
      embedQuery: () => Promise.resolve(Float32Array.of(1, 0)),
      dispose: () => {
        modelDisposed = true
        return Promise.resolve()
      },
    }
    const { ctx, provider } = await setup(embedder)
    const caller = new AbortController()
    const search = ctx.skillSearch.search({ name: 'fixture-skill', query: '复活' }, { signal: caller.signal })
    const searchOutcome = search.then(value => ({ value }), (error: unknown) => ({ error }))
    await started
    const disposal = provider.dispose()
    await new Promise(resolve => setTimeout(resolve, 20))
    const abortedByDisposal = observedAbort
    caller.abort(new Error('test cleanup'))
    await Promise.all([searchOutcome, disposal])

    expect(abortedByDisposal).toBe(true)
    expect(modelDisposed).toBe(true)
  })

  it('aborts and awaits active query inference before disposing the model', async () => {
    const fixture = new DeterministicFixtureEmbedder(2)
    const started = Promise.withResolvers<undefined>()
    const aborted = Promise.withResolvers<undefined>()
    const release = Promise.withResolvers<undefined>()
    let blockQuery = false
    const order: string[] = []
    const embedder: SkillSearchEmbedder = {
      identity: fixture.identity,
      embedDocuments: (texts, signal) => fixture.embedDocuments(texts, signal),
      async embedQuery(text, signal) {
        if (!blockQuery) return await fixture.embedQuery(text, signal)
        started.resolve(undefined)
        signal.addEventListener('abort', () => {
          order.push('query-aborted')
          aborted.resolve(undefined)
        }, { once: true })
        await release.promise
        order.push('query-settled')
        signal.throwIfAborted()
        return Float32Array.of(1, 0)
      },
      dispose: () => {
        order.push('model-dispose')
        return Promise.resolve()
      },
    }
    const { ctx, provider, store } = await setup(embedder)
    await ctx.skillSearch.search({ name: 'fixture-skill', query: '复活' })
    blockQuery = true
    const close = store.close.bind(store)
    vi.spyOn(store, 'close').mockImplementation(async () => {
      order.push('store-close')
      await close()
    })

    const search = ctx.skillSearch.search({ name: 'fixture-skill', query: '复活' })
    const searchOutcome = search.then(value => ({ value }), (error: unknown) => ({ error }))
    await started.promise
    const disposal = provider.dispose()
    await aborted.promise

    release.resolve(undefined)
    await expect(searchOutcome).resolves.toMatchObject({ error: { code: 'ABORTED' } })
    await disposal
    expect(order).toEqual(['query-aborted', 'query-settled', 'store-close', 'model-dispose'])
  })

  it('disposes the model when closing the store fails', async () => {
    const closeFailure = new Error('store close failed')
    const close = vi.fn(() => Promise.reject(closeFailure))
    const dispose = vi.fn(() => Promise.resolve())
    const provider = new LocalSkillSearchProvider({ close } as never, {
      identity: { id: 'fixture', revision: '1', dimensions: 2 },
      embedDocuments: () => Promise.resolve([]),
      embedQuery: () => Promise.resolve(Float32Array.of(1, 0)),
      dispose,
    }, options)

    await expect(provider.dispose()).rejects.toBe(closeFailure)
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('enforces a provider result cap below the service maximum', async () => {
    const { ctx } = await setup(undefined, 100, { ...options, maxResultCount: 1 })

    await expect(ctx.skillSearch.search({ name: 'fixture-skill', query: '复活', limit: 2 }))
      .rejects.toThrow('between 1 and 1')
  })

  it('attempts both resource teardowns when they throw synchronously', async () => {
    const closeFailure = new Error('store close threw')
    const disposeFailure = new Error('model dispose threw')
    const close = vi.fn(() => { throw closeFailure })
    const dispose = vi.fn(() => { throw disposeFailure })
    const provider = new LocalSkillSearchProvider({ close } as never, {
      identity: { id: 'fixture', revision: '1', dimensions: 2 },
      embedDocuments: () => Promise.resolve([]),
      embedQuery: () => Promise.resolve(Float32Array.of(1, 0)),
      dispose,
    }, options)

    await expect(provider.dispose()).rejects.toMatchObject({
      errors: [closeFailure, disposeFailure],
      message: 'Local Skill search provider disposal failed',
    })
    expect(close).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('reports support accurately and rejects unsupported resources', async () => {
    const { provider } = await setup()
    const unsupported = {
      id: 'fixture',
      skill: { name: 'fixture-skill' },
      resourceBase: { kind: 'url', url: 'https://example.test' },
      spec: { maxChunks: 100 },
    } as never
    expect(provider.supports(unsupported)).toBe(false)
    await expect(provider.search(unsupported, { name: 'fixture-skill', query: 'x' }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_RESOURCE_BASE' })
  })

  it.each([0, 11, 1.5])('rejects invalid requested limit %s', async (limit) => {
    const { ctx } = await setup()
    await expect(ctx.skillSearch.search({ name: 'fixture-skill', query: '复活', limit }))
      .rejects.toThrow('between 1 and 10')
  })

  it('rejects a corpus whose chunk count exceeds its declared maximum', async () => {
    const { ctx, skillRoot } = await setup(undefined, 1)
    await writeFile(join(skillRoot, 'references', 'respawn.md'), `# Large\n\n${'x'.repeat(2500)}\n`)

    await expect(ctx.skillSearch.search({ name: 'fixture-skill', query: 'large' }))
      .rejects.toMatchObject({ code: 'CORPUS_LIMIT' })
  })

  it.each([
    [new Error('embedding unavailable'), 'MODEL_UNAVAILABLE'],
    [new SkillSearchError('CORPUS_LIMIT', 'declared model failure'), 'CORPUS_LIMIT'],
  ])('maps document embedding failure %s', async (failure, code) => {
    const fixture = new DeterministicFixtureEmbedder(2)
    const embedder: SkillSearchEmbedder = {
      identity: fixture.identity,
      embedDocuments: () => Promise.reject(failure),
      embedQuery: (text, signal) => fixture.embedQuery(text, signal),
      dispose: () => fixture.dispose(),
    }
    const { ctx } = await setup(embedder)

    await expect(ctx.skillSearch.search({ name: 'fixture-skill', query: '复活' })).rejects.toMatchObject({ code })
  })

  it('maps query embedding failures after a committed refresh', async () => {
    const fixture = new DeterministicFixtureEmbedder(2)
    const embedder: SkillSearchEmbedder = {
      identity: fixture.identity,
      embedDocuments: (texts, signal) => fixture.embedDocuments(texts, signal),
      embedQuery: () => Promise.reject(new Error('query model unavailable')),
      dispose: () => fixture.dispose(),
    }
    const { ctx } = await setup(embedder)

    await expect(ctx.skillSearch.search({ name: 'fixture-skill', query: '复活' }))
      .rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' })
  })

  it('rejects new searches after provider disposal starts', async () => {
    const { ctx, provider } = await setup()
    await provider.dispose()

    await expect(ctx.skillSearch.search({ name: 'fixture-skill', query: '复活' })).rejects.toThrow('disposed')
  })
})

describe('skill-search-local plugin', () => {
  async function context(): Promise<Context> {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    await ctx.plugin(SkillSearchRegistry)
    return ctx
  }

  const config = { databasePath: ':memory:', modelRoot: 'unused' }

  it.each([
    [{ chunkTargetCodePoints: 0 }, 'chunkTargetCodePoints'],
    [{ chunkTargetCodePoints: 1.5 }, 'chunkTargetCodePoints'],
    [{ chunkMaxCodePoints: 0 }, 'chunkMaxCodePoints'],
    [{ chunkTargetCodePoints: 10, chunkOverlapCodePoints: -1 }, 'chunkOverlapCodePoints'],
    [{ chunkTargetCodePoints: 10, chunkOverlapCodePoints: 10 }, 'chunkOverlapCodePoints'],
    [{ chunkTargetCodePoints: 10, chunkMaxCodePoints: 9, chunkOverlapCodePoints: 0 }, 'cannot be smaller'],
    [{ maxResultCount: 11 }, 'cannot exceed 10'],
    [{ maxResultCount: 2, defaultResultCount: 3 }, 'defaultResultCount'],
    [{ rrfK: 0 }, 'rrfK'],
    [{ rrfK: Number.NaN }, 'rrfK'],
    [{ headingBoost: -1 }, 'headingBoost'],
    [{ headingBoost: Number.NaN }, 'headingBoost'],
    [{ pathBoost: -1 }, 'pathBoost'],
    [{ pathBoost: Number.NaN }, 'pathBoost'],
    [{ mmrLambda: -0.1 }, 'mmrLambda'],
    [{ mmrLambda: 1.1 }, 'mmrLambda'],
    [{ mmrLambda: Number.NaN }, 'mmrLambda'],
    [{ lexicalCandidates: 0 }, 'lexicalCandidates'],
    [{ vectorCandidates: 0 }, 'vectorCandidates'],
  ])('rejects invalid configuration %o', async (change, message) => {
    await expect(SkillSearchLocal.apply(await context(), { ...config, ...change })).rejects.toThrow(message)
  })

  it('closes the opened store when model creation fails', async () => {
    vi.spyOn(TransformersJsEmbedder, 'create').mockRejectedValue(new Error('model creation failed'))

    await expect(SkillSearchLocal.apply(await context(), config)).rejects.toThrow('model creation failed')
  })

  it('registers explicit options and disposes resources with its plugin scope', async () => {
    const ctx = await context()
    const fixture = new DeterministicFixtureEmbedder(2)
    const dispose = vi.fn(() => Promise.resolve())
    const embedder: SkillSearchEmbedder = {
      identity: fixture.identity,
      embedDocuments: (texts, signal) => fixture.embedDocuments(texts, signal),
      embedQuery: (text, signal) => fixture.embedQuery(text, signal),
      dispose,
    }
    vi.spyOn(TransformersJsEmbedder, 'create').mockResolvedValue(embedder as unknown as TransformersJsEmbedder)
    const fiber = await ctx.plugin(Object.assign(async (inner: Context) => {
      await SkillSearchLocal.apply(inner, {
        ...config,
        providerName: 'explicit',
        manifestFile: 'custom-manifest.json',
        chunkTargetCodePoints: 100,
        chunkMaxCodePoints: 200,
        chunkOverlapCodePoints: 10,
        embeddingBatchSize: 2,
        lexicalCandidates: 3,
        vectorCandidates: 4,
        rrfK: 10,
        headingBoost: 0,
        pathBoost: 0,
        mmrLambda: 1,
        defaultResultCount: 1,
        maxResultCount: 2,
      })
    }, { inject: ['skillSearch'] }))

    await fiber.dispose()
    expect(dispose).toHaveBeenCalledOnce()
  })
})
