import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { createScope } from '@deepseek-ai/dsh-scope'
import SkillSearchRegistry, {
  SkillSearchError,
  SkillSearchProviderName,
  type SkillCorpusSpec,
  type ResolvedSkillCorpus,
  type SkillSearchProvider,
} from '../src/index.ts'

const defaultCorpus: SkillCorpusSpec = {
  skill: 'fixture-skill',
  roots: ['references'],
  extensions: ['.md', '.txt'],
  maxFileBytes: 1024,
  maxCorpusBytes: 4096,
  maxChunks: 100,
}

async function setup(corpora: SkillCorpusSpec[] = [defaultCorpus], skill: Record<string, unknown> = {}) {
  const ctx = new Context()
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(SkillSearchRegistry, { corpora })
  ctx.skills.register({
    name: 'fixture-skill',
    description: 'Fixture skill',
    source: 'test',
    resourceBase: { kind: 'directory', path: 'C:\\fixture-skill' },
    content: 'Fixture instructions.',
    ...skill,
  })
  return ctx
}

describe('SkillSearchRegistry', () => {
  it('removes a named provider when its contributing fiber is disposed', async () => {
    const ctx = await setup()
    const provider: SkillSearchProvider = {
      supports: corpus => corpus.resourceBase.kind === 'directory',
      async search(corpus, request) {
        return { skill: corpus.skill.name, query: request.query, hits: [] }
      },
    }
    const fiber = await ctx.plugin(Object.assign((inner: Context) => {
      inner.skillSearch.registerProvider(SkillSearchProviderName('memory-search'), provider)
    }, { inject: ['skillSearch'] }))

    await expect(ctx.skillSearch.search({ name: 'fixture-skill', query: '复活' }))
      .resolves.toMatchObject({ skill: 'fixture-skill' })
    await fiber.dispose()
    await expect(ctx.skillSearch.search({ name: 'fixture-skill', query: '复活' }))
      .rejects.toEqual(expect.objectContaining<Partial<SkillSearchError>>({ code: 'UNSUPPORTED_RESOURCE_BASE' }))
  })

  it('cancels without waiting for an uncooperative provider', async () => {
    const ctx = await setup()
    let markStarted!: () => void
    const started = new Promise<void>((resolve) => { markStarted = resolve })
    let release!: (value: { skill: string; query: string; hits: [] }) => void
    const blocked = new Promise<{ skill: string; query: string; hits: [] }>((resolve) => { release = resolve })
    ctx.skillSearch.registerProvider(SkillSearchProviderName('blocked'), {
      supports: () => true,
      search() {
        markStarted()
        return blocked
      },
    })
    const controller = new AbortController()
    let outcome: unknown
    const search = ctx.skillSearch.search({ name: 'fixture-skill', query: '复活' }, { signal: controller.signal })
      .then((value) => { outcome = value }, (error: unknown) => { outcome = error })
    await started
    controller.abort(new Error('test cancellation'))
    await new Promise<void>(resolve => setImmediate(resolve))

    try {
      expect(outcome).toEqual(expect.objectContaining<Partial<SkillSearchError>>({ code: 'ABORTED' }))
    } finally {
      release({ skill: 'fixture-skill', query: '复活', hits: [] })
      await search
    }
  })

  it('bounds the complete provider result to the requested passage count', async () => {
    const ctx = await setup()
    ctx.skillSearch.registerProvider(SkillSearchProviderName('overproducing'), {
      supports: () => true,
      async search(corpus, request) {
        return {
          skill: corpus.skill.name,
          query: request.query,
          hits: Array.from({ length: 4 }, (_, index) => ({
            skill: corpus.skill.name,
            rank: index + 1,
            score: 1 - index / 10,
            path: `references/${String(index + 1)}.md`,
            headings: [],
            startLine: 1,
            endLine: 1,
            excerpt: `passage ${String(index + 1)}`,
          })),
        }
      },
    })

    const result = await ctx.skillSearch.search({ name: 'fixture-skill', query: '复活', limit: 2 })

    expect(result.hits).toHaveLength(2)
    expect(result.hits.map(hit => hit.path)).toEqual(['references/1.md', 'references/2.md'])
  })

  it('resolves one declared directory corpus and dispatches to a supporting provider', async () => {
    const ctx = await setup()
    let received: ResolvedSkillCorpus | undefined
    const provider: SkillSearchProvider = {
      supports: corpus => corpus.resourceBase.kind === 'directory',
      async search(corpus, request) {
        received = corpus
        return {
          skill: corpus.skill.name,
          query: request.query,
          hits: [{
            skill: corpus.skill.name,
            rank: 1,
            score: 1,
            path: 'references/respawn.md',
            headings: ['角色', '复活'],
            startLine: 12,
            endLine: 20,
            excerpt: '角色可以在复活点重新进入战斗。',
          }],
        }
      },
    }
    ctx.skillSearch.registerProvider(SkillSearchProviderName('memory-search'), provider)

    const result = await ctx.skillSearch.search({
      name: 'fixture-skill',
      query: '角色复活',
      limit: 5,
    })

    expect(received).toMatchObject({
      skill: { name: 'fixture-skill', provider: 'runtime' },
      resourceBase: { kind: 'directory', path: 'C:\\fixture-skill' },
      spec: { roots: ['references'], extensions: ['.md', '.txt'] },
    })
    expect(result.hits[0]).toMatchObject({ path: 'references/respawn.md', startLine: 12 })
  })

  it('rejects a skill without an explicit corpus declaration', async () => {
    const ctx = await setup([])
    await expect(ctx.skillSearch.search({ name: 'fixture-skill', query: '复活' }))
      .rejects.toEqual(expect.objectContaining<Partial<SkillSearchError>>({ code: 'CORPUS_UNDECLARED' }))
  })

  it.each([
    [{ skill: '' }, 'skill must be non-empty'],
    [{ roots: [] }, 'at least one root'],
    [{ extensions: [] }, 'at least one extension'],
    [{ maxFileBytes: 0 }, 'positive safe integers'],
    [{ maxFileBytes: 1.5 }, 'positive safe integers'],
    [{ maxCorpusBytes: 0 }, 'positive safe integers'],
    [{ maxChunks: 0 }, 'positive safe integers'],
    [{ maxFileBytes: 5000 }, 'cannot exceed maxCorpusBytes'],
  ])('rejects invalid corpus declaration %o', async (change, message) => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    await expect(ctx.plugin(SkillSearchRegistry, { corpora: [{ ...defaultCorpus, ...change }] }))
      .rejects.toThrow(message)
  })

  it('rejects duplicate corpus declarations and empty provider names', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    await expect(ctx.plugin(SkillSearchRegistry, { corpora: [defaultCorpus, { ...defaultCorpus }] }))
      .rejects.toThrow('duplicate Skill corpus')

    const ready = await setup()
    expect(() => ready.skillSearch.registerProvider(SkillSearchProviderName(' '), {
      supports: () => true,
      search: () => Promise.reject(new Error('unused')),
    })).toThrow('must be non-empty')
  })

  it('removes a directly registered provider through its exact disposer', async () => {
    const ctx = await setup()
    const dispose = ctx.skillSearch.registerProvider(SkillSearchProviderName('direct'), {
      supports: () => true,
      search: async (corpus, request) => ({ skill: corpus.skill.name, query: request.query, hits: [] }),
    })

    await expect(ctx.skillSearch.search({ name: 'fixture-skill', query: '复活' })).resolves.toMatchObject({ hits: [] })
    dispose()
    await expect(ctx.skillSearch.search({ name: 'fixture-skill', query: '复活' }))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_RESOURCE_BASE' })
  })

  it('reports unknown, non-model-invocable, and resource-less Skills distinctly', async () => {
    const ctx = await setup()
    await expect(ctx.skillSearch.search({ name: 'missing', query: '复活' }))
      .rejects.toMatchObject({ code: 'UNKNOWN_SKILL' })

    const hidden = await setup([defaultCorpus], { invocation: { modelInvocable: false, userInvocable: true } })
    await expect(hidden.skillSearch.search({ name: 'fixture-skill', query: '复活' }))
      .rejects.toMatchObject({ code: 'NOT_MODEL_INVOCABLE' })

    const resourceLess = await setup([defaultCorpus], { resourceBase: undefined })
    await expect(resourceLess.skillSearch.search({ name: 'fixture-skill', query: '复活' }))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_RESOURCE_BASE' })
  })

  it('honors provider-specific corpus declarations', async () => {
    const ctx = await setup([{ ...defaultCorpus, provider: 'runtime' }])
    ctx.skillSearch.registerProvider(SkillSearchProviderName('specific'), {
      supports: () => true,
      search: async (corpus, request) => ({ skill: corpus.skill.name, query: request.query, hits: [] }),
    })

    await expect(ctx.skillSearch.search({ name: 'fixture-skill', query: '复活' }))
      .resolves.toMatchObject({ skill: 'fixture-skill' })
  })

  it('checks cancellation again after asynchronous Skill resolution', async () => {
    const ctx = await setup()
    const controller = new AbortController()
    const get = ctx.skills.get.bind(ctx.skills)
    vi.spyOn(ctx.skills, 'get').mockImplementation(async (...args) => {
      const skill = await get(...args)
      controller.abort(new Error('cancel after resolution'))
      return skill
    })

    await expect(ctx.skillSearch.search({ name: 'fixture-skill', query: '复活' }, { signal: controller.signal }))
      .rejects.toMatchObject({ code: 'ABORTED' })
  })

  it('preserves provider failures when the caller is still active', async () => {
    const ctx = await setup()
    ctx.skillSearch.registerProvider(SkillSearchProviderName('failing'), {
      supports: () => true,
      search: () => Promise.reject(new Error('provider failed')),
    })

    await expect(ctx.skillSearch.search({ name: 'fixture-skill', query: '复活' })).rejects.toThrow('provider failed')
  })

  it('reclaims an empty scoped provider layer and supports direct default construction', async () => {
    const ctx = await setup()
    let scope!: ReturnType<typeof createScope>
    await ctx.plugin(Object.assign((inner: Context) => { scope = createScope(inner, {}) }, { inject: ['skillSearch'] }))
    const dispose = scope.ctx.skillSearch.registerProvider(SkillSearchProviderName('scoped'), {
      supports: () => true,
      search: async (corpus, request) => ({ skill: corpus.skill.name, query: request.query, hits: [] }),
    })
    dispose()
    await scope.dispose()

    const bare = new Context()
    await bare.plugin(SkillRegistry)
    expect(() => new SkillSearchRegistry(bare)).not.toThrow()
  })
})
