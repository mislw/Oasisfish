import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as SkillFileSystem from '@deepseek-ai/dsh-skill-filesystem'
import SkillSearchRegistry, { SkillSearchError } from '@deepseek-ai/dsh-skill-search'
import { DeterministicFixtureEmbedder, type SkillSearchEmbedder } from '../src/embedder.ts'
import { LocalSkillSearchProvider, type LocalSkillSearchProviderOptions } from '../src/provider.ts'
import { openSkillSearchStore } from '../src/store.ts'

const roots: string[] = []
const disposals: Array<() => Promise<void>> = []

afterEach(async () => {
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

async function setup(customEmbedder?: SkillSearchEmbedder) {
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
    maxChunks: 100,
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
  const provider = new LocalSkillSearchProvider(store, embedder, options)
  disposals.push(() => provider.dispose())
  ctx.skillSearch.registerProvider(() => provider)
  return { ctx, provider, skillRoot, embeddedDocuments: () => embeddedDocuments }
}

describe('LocalSkillSearchProvider', () => {
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
})
