import { describe, expect, it } from 'vitest'
import type { SkillSearchEmbedder } from '../src/embedder.ts'
import { retrieve, type SkillSearchRetrievalStore } from '../src/retrieval.ts'

const rows = [
  {
    id: 'heading-hit',
    path: 'references/respawn.md',
    headings: ['角色', '复活'],
    startLine: 10,
    endLine: 12,
    text: '角色在复活点重新进入战斗。',
    vector: Float32Array.of(1, 0),
  },
  {
    id: 'semantic-hit',
    path: 'references/rejoin.md',
    headings: ['重返战场'],
    startLine: 20,
    endLine: 22,
    text: '玩家阵亡后可以再次进入对局。',
    vector: Float32Array.of(0.6, 0.8),
  },
  {
    id: 'duplicate-hit',
    path: 'references/respawn.md',
    headings: ['角色', '复活'],
    startLine: 13,
    endLine: 15,
    text: '角色在复活点再次进入战斗。',
    vector: Float32Array.of(0.99, 0.01),
  },
]

const store: SkillSearchRetrievalStore = {
  lexicalCandidates: () => [
    { ...rows[0]!, bm25: -2 },
    { ...rows[2]!, bm25: -1 },
  ],
  vectorRows: () => rows,
}

const embedder: SkillSearchEmbedder = {
  identity: { id: 'fixture', revision: '1', dimensions: 2 },
  embedDocuments: () => Promise.reject(new Error('not used')),
  embedQuery: () => Promise.resolve(Float32Array.of(1, 0)),
  dispose: () => Promise.resolve(),
}

describe('retrieve', () => {
  it('fuses lexical and vector ranks, boosts headings, and uses MMR to reduce adjacent duplicates', async () => {
    const hits = await retrieve(store, 'fixture', '复活', {
      lexicalCandidates: 10,
      vectorCandidates: 10,
      rrfK: 60,
      headingBoost: 0.1,
      pathBoost: 0.05,
      mmrLambda: 0.6,
      limit: 2,
    }, embedder, new AbortController().signal)

    expect(hits.map(hit => hit.id)).toEqual(['heading-hit', 'semantic-hit'])
    expect(hits.map(hit => hit.rank)).toEqual([1, 2])
    expect(hits[0]).toMatchObject({ path: 'references/respawn.md', startLine: 10 })
  })

  it('rejects result limits above the model-facing maximum', async () => {
    await expect(retrieve(store, 'fixture', '复活', {
      lexicalCandidates: 10,
      vectorCandidates: 10,
      rrfK: 60,
      headingBoost: 0.1,
      pathBoost: 0.05,
      mmrLambda: 0.6,
      limit: 11,
    }, embedder, new AbortController().signal)).rejects.toThrow('between 1 and 10')
  })
})
