import { describe, expect, it } from 'vitest'
import type { SkillSearchEmbedder } from '../src/embedder.ts'
import { retrieve, type SkillSearchRetrievalStore } from '../src/retrieval.ts'

const options = {
  lexicalCandidates: 10,
  vectorCandidates: 10,
  rrfK: 60,
  headingBoost: 0.1,
  pathBoost: 0.05,
  mmrLambda: 0.6,
  limit: 2,
}

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
    const hits = await retrieve(store, 'fixture', '复活', options, embedder, new AbortController().signal)

    expect(hits.map(hit => hit.id)).toEqual(['heading-hit', 'semantic-hit'])
    expect(hits.map(hit => hit.rank)).toEqual([1, 2])
    expect(hits[0]).toMatchObject({ path: 'references/respawn.md', startLine: 10 })
  })

  it('rejects result limits above the model-facing maximum', async () => {
    await expect(retrieve(store, 'fixture', '复活', { ...options, limit: 11 }, embedder, new AbortController().signal))
      .rejects.toThrow('between 1 and 10')
  })

  it.each([
    [{ lexicalCandidates: 0 }, 'positive integers'],
    [{ lexicalCandidates: 1.5 }, 'positive integers'],
    [{ vectorCandidates: 0 }, 'positive integers'],
    [{ vectorCandidates: Number.NaN }, 'positive integers'],
    [{ limit: 0 }, 'between 1 and 10'],
    [{ limit: 1.5 }, 'between 1 and 10'],
    [{ rrfK: 0 }, 'rrfK must be positive'],
    [{ rrfK: Number.NaN }, 'rrfK must be positive'],
    [{ mmrLambda: -0.1 }, 'between zero and one'],
    [{ mmrLambda: 1.1 }, 'between zero and one'],
    [{ mmrLambda: Number.NaN }, 'between zero and one'],
    [{ headingBoost: -0.1 }, 'boosts cannot be negative'],
    [{ pathBoost: -0.1 }, 'boosts cannot be negative'],
    [{ headingBoost: Number.NaN }, 'boosts must be finite'],
    [{ pathBoost: Number.NaN }, 'boosts must be finite'],
  ])('rejects invalid retrieval option %o', async (change, message) => {
    await expect(retrieve(store, 'fixture', '复活', { ...options, ...change }, embedder, new AbortController().signal))
      .rejects.toThrow(message)
  })

  it('returns before embedding when the corpus has no stored vectors', async () => {
    const emptyStore: SkillSearchRetrievalStore = {
      lexicalCandidates: () => [],
      vectorRows: () => [],
    }
    const unused = { ...embedder, embedQuery: () => Promise.reject(new Error('must not embed')) }

    await expect(retrieve(emptyStore, 'fixture', 'anything', options, unused, new AbortController().signal))
      .resolves.toEqual([])
  })

  it('checks cancellation before and after query embedding', async () => {
    const before = new AbortController()
    before.abort(new Error('before embedding'))
    await expect(retrieve(store, 'fixture', '复活', options, embedder, before.signal)).rejects.toThrow('before embedding')

    const after = new AbortController()
    const aborting = {
      ...embedder,
      embedQuery: () => {
        after.abort(new Error('after embedding'))
        return Promise.resolve(Float32Array.of(1, 0))
      },
    }
    await expect(retrieve(store, 'fixture', '复活', options, aborting, after.signal)).rejects.toThrow('after embedding')
  })

  it('rejects stored vectors whose dimensions differ from the query vector', async () => {
    const mismatched: SkillSearchRetrievalStore = {
      lexicalCandidates: () => [],
      vectorRows: () => [{ ...rows[0]!, vector: Float32Array.of(1) }],
    }

    await expect(retrieve(mismatched, 'fixture', '复活', options, embedder, new AbortController().signal))
      .rejects.toThrow('dimensions differ')
  })

  it('ignores stale lexical ids and filters candidates outside both rank lists', async () => {
    const sparse: SkillSearchRetrievalStore = {
      lexicalCandidates: () => [{ ...rows[0]!, id: 'missing', bm25: -1 }],
      vectorRows: () => rows,
    }

    const hits = await retrieve(sparse, 'fixture', '', { ...options, vectorCandidates: 1, limit: 3 }, embedder, new AbortController().signal)

    expect(hits.map(hit => hit.id)).toEqual(['heading-hit'])
  })

  it('boosts an exact normalized path match', async () => {
    const hits = await retrieve(store, 'fixture', 'REFERENCES/RESPAWN', options, embedder, new AbortController().signal)

    expect(hits[0]?.path).toBe('references/respawn.md')
    expect(hits[0]?.score).toBeGreaterThan(0.05)
  })

  it.each([
    [
      [{ ...rows[0]!, id: 'z', path: 'z.md', startLine: 1 }, { ...rows[0]!, id: 'a', path: 'a.md', startLine: 1 }],
      ['a', 'z'],
    ],
    [
      [{ ...rows[0]!, id: 'later', path: 'same.md', startLine: 2 }, { ...rows[0]!, id: 'earlier', path: 'same.md', startLine: 1 }],
      ['earlier', 'later'],
    ],
    [
      [{ ...rows[0]!, id: 'z', path: 'same.md', startLine: 1 }, { ...rows[0]!, id: 'a', path: 'same.md', startLine: 1 }],
      ['a', 'z'],
    ],
  ])('breaks equal fused scores in stable source order', async (tiedRows, expected) => {
    const normalized = tiedRows.map(row => ({ ...row, vector: Float32Array.of(1, 0) }))
    const tiedStore: SkillSearchRetrievalStore = {
      lexicalCandidates: () => normalized.map(row => ({ ...row, bm25: -1 })),
      vectorRows: () => normalized,
    }

    const hits = await retrieve(tiedStore, 'fixture', '', { ...options, limit: 2, mmrLambda: 1 }, embedder, new AbortController().signal)

    expect(hits.map(hit => hit.id)).toEqual(expected)
  })
})
