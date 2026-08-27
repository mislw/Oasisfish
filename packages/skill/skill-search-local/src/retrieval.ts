/** Hybrid BM25/vector retrieval, reciprocal-rank fusion, and MMR selection. */

import type { SkillSearchEmbedder } from './embedder.ts'
import type { LexicalCandidate, StoredVectorRow } from './store.ts'

/** Read interface required by the retrieval algorithm. */
export interface SkillSearchRetrievalStore {
  lexicalCandidates(corpusKey: string, query: string, limit: number): LexicalCandidate[]
  vectorRows(corpusKey: string): StoredVectorRow[]
}

/** Tunable hybrid candidate and reranking controls. */
export interface RetrievalOptions {
  readonly lexicalCandidates: number
  readonly vectorCandidates: number
  readonly rrfK: number
  readonly headingBoost: number
  readonly pathBoost: number
  readonly mmrLambda: number
  readonly limit: number
}

/** One final ranked retrieval passage. */
export interface SkillSearchRetrievalHit {
  readonly id: string
  readonly rank: number
  readonly score: number
  readonly path: string
  readonly headings: readonly string[]
  readonly startLine: number
  readonly endLine: number
  readonly excerpt: string
}

interface Candidate extends StoredVectorRow {
  score: number
}

function dot(left: Float32Array, right: Float32Array): number {
  if (left.length !== right.length) throw new Error('query and stored vector dimensions differ')
  let score = 0
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]
    const b = right[index]
    if (a === undefined || b === undefined) throw new Error('vector index is outside its dimensions')
    score += a * b
  }
  return score
}

function validateOptions(options: RetrievalOptions): void {
  for (const value of [options.lexicalCandidates, options.vectorCandidates]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('retrieval candidate and result limits must be positive integers')
  }
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 10) {
    throw new Error('retrieval result limit must be between 1 and 10')
  }
  if (!Number.isFinite(options.rrfK) || options.rrfK <= 0) throw new Error('rrfK must be positive')
  if (!Number.isFinite(options.mmrLambda) || options.mmrLambda < 0 || options.mmrLambda > 1) {
    throw new Error('mmrLambda must be between zero and one')
  }
  if (options.headingBoost < 0 || options.pathBoost < 0) throw new Error('retrieval boosts cannot be negative')
}

function exactBoost(row: StoredVectorRow, query: string, options: RetrievalOptions): number {
  const normalized = query.normalize('NFKC').toLocaleLowerCase('und').trim()
  if (normalized === '') return 0
  let boost = 0
  if (row.headings.join(' ').normalize('NFKC').toLocaleLowerCase('und').includes(normalized)) boost += options.headingBoost
  if (row.path.normalize('NFKC').toLocaleLowerCase('und').includes(normalized)) boost += options.pathBoost
  return boost
}

function stableCandidateOrder(left: Candidate, right: Candidate): number {
  return right.score - left.score
    || left.path.localeCompare(right.path, 'en')
    || left.startLine - right.startLine
    || left.id.localeCompare(right.id, 'en')
}

/**
 * Retrieve and rerank one query over a committed corpus index.
 * @param store - FTS and vector read interface.
 * @param corpusKey - Persistent corpus identity.
 * @param query - Raw query text.
 * @param options - Candidate, fusion, boost, MMR, and result controls.
 * @param embedder - Query embedding provider.
 * @param signal - Caller cancellation.
 * @returns stable hybrid-ranked source passages.
 */
export async function retrieve(
  store: SkillSearchRetrievalStore,
  corpusKey: string,
  query: string,
  options: RetrievalOptions,
  embedder: SkillSearchEmbedder,
  signal: AbortSignal,
): Promise<SkillSearchRetrievalHit[]> {
  validateOptions(options)
  signal.throwIfAborted()
  const lexical = store.lexicalCandidates(corpusKey, query, options.lexicalCandidates)
  const rows = store.vectorRows(corpusKey)
  if (rows.length === 0) return []
  const queryVector = await embedder.embedQuery(query, signal)
  signal.throwIfAborted()
  const vectors = [...rows]
    .map(row => ({ row, similarity: dot(queryVector, row.vector) }))
    .sort((left, right) => right.similarity - left.similarity
      || left.row.path.localeCompare(right.row.path, 'en')
      || left.row.startLine - right.row.startLine
      || left.row.id.localeCompare(right.row.id, 'en'))
    .slice(0, options.vectorCandidates)

  const byId = new Map(rows.map(row => [row.id, { ...row, score: exactBoost(row, query, options) }]))
  lexical.forEach((row, index) => {
    const candidate = byId.get(row.id)
    if (candidate !== undefined) candidate.score += 1 / (options.rrfK + index + 1)
  })
  vectors.forEach(({ row }, index) => {
    const candidate = byId.get(row.id)
    if (candidate !== undefined) candidate.score += 1 / (options.rrfK + index + 1)
  })
  const remaining = [...byId.values()].filter(candidate => candidate.score > 0).sort(stableCandidateOrder)
  const selected: Candidate[] = []
  while (selected.length < options.limit && remaining.length > 0) {
    signal.throwIfAborted()
    let bestIndex = 0
    let bestScore = Number.NEGATIVE_INFINITY
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]
      if (candidate === undefined) continue
      const similarity = selected.length === 0
        ? 0
        : Math.max(...selected.map(chosen => dot(candidate.vector, chosen.vector)))
      const score = options.mmrLambda * candidate.score - (1 - options.mmrLambda) * similarity
      if (score > bestScore) {
        bestScore = score
        bestIndex = index
      }
    }
    const [chosen] = remaining.splice(bestIndex, 1)
    if (chosen === undefined) break
    selected.push(chosen)
  }
  return selected.map((candidate, index) => ({
    id: candidate.id,
    rank: index + 1,
    score: candidate.score,
    path: candidate.path,
    headings: candidate.headings,
    startLine: candidate.startLine,
    endLine: candidate.endLine,
    excerpt: candidate.text,
  }))
}
