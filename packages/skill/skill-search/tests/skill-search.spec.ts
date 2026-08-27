import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SkillSearchRegistry, {
  SkillSearchError,
  type ResolvedSkillCorpus,
  type SkillSearchProvider,
} from '../src/index.ts'

async function setup(corpora = [{
  skill: 'fixture-skill',
  roots: ['references'],
  extensions: ['.md', '.txt'],
  maxFileBytes: 1024,
  maxCorpusBytes: 4096,
  maxChunks: 100,
}]) {
  const ctx = new Context()
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(SkillSearchRegistry, { corpora })
  ctx.skills.register({
    name: 'fixture-skill',
    description: 'Fixture skill',
    source: 'test',
    resourceBase: { kind: 'directory', path: 'C:\\fixture-skill' },
    content: 'Fixture instructions.',
  })
  return ctx
}

describe('SkillSearchRegistry', () => {
  it('resolves one declared directory corpus and dispatches to a supporting provider', async () => {
    const ctx = await setup()
    let received: ResolvedSkillCorpus | undefined
    const provider: SkillSearchProvider = {
      name: 'memory-search',
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
    ctx.skillSearch.registerProvider(() => provider)

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
})
