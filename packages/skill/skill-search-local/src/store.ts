/** Transactional persistent index for local Skill corpus search. */

import type { DatabaseSync } from 'node:sqlite'
import { lexicalTokenStream } from './lexical.ts'
import type { DiscoveredDocument } from './corpus.ts'
import type { SourceChunk } from './chunk.ts'
import { openDatabase } from './schema.ts'

export { SKILL_SEARCH_SCHEMA_VERSION } from './schema.ts'

/** Embedding model identity stamped into each corpus index. */
export interface SkillSearchModelIdentity {
  readonly id: string
  readonly revision: string
  readonly dimensions: number
}

/** One discovered document with its prepared source chunks. */
export interface IndexedSourceDocument {
  readonly document: DiscoveredDocument
  readonly chunks: readonly SourceChunk[]
}

/** Complete desired state for one corpus refresh. */
export interface SkillSearchRefreshRequest {
  readonly corpusKey: string
  readonly model: SkillSearchModelIdentity
  readonly documents: readonly IndexedSourceDocument[]
}

/** Result of one committed or no-op refresh. */
export interface SkillSearchRefreshResult {
  readonly revision: number
  readonly changedDocuments: number
  readonly removedDocuments: number
}

/** Embedding callback used only for changed chunks before the write transaction. */
export type EmbedChangedChunks = (
  texts: readonly string[],
  signal: AbortSignal,
) => Promise<readonly Float32Array[]>

/** Stored chunk and vector used by exact semantic scoring. */
export interface StoredVectorRow {
  readonly id: string
  readonly path: string
  readonly headings: readonly string[]
  readonly startLine: number
  readonly endLine: number
  readonly text: string
  readonly vector: Float32Array
}

/** Stored chunk returned by SQLite FTS5 BM25. */
export interface LexicalCandidate extends Omit<StoredVectorRow, 'vector'> {
  readonly bm25: number
}

interface CorpusRow {
  model_id: string
  model_revision: string
  model_dimensions: number
  revision: number
}

interface DocumentRow {
  path: string
  bytes: number
  mtime_ms: number
  sha256: string
}

function requireActive(signal: AbortSignal): void {
  signal.throwIfAborted()
}

function sameModel(row: CorpusRow | undefined, model: SkillSearchModelIdentity): boolean {
  return row !== undefined
    && row.model_id === model.id
    && row.model_revision === model.revision
    && row.model_dimensions === model.dimensions
}

function vectorBlob(vector: Float32Array): Uint8Array {
  const bytes = new Uint8Array(vector.length * Float32Array.BYTES_PER_ELEMENT)
  const view = new DataView(bytes.buffer)
  for (let index = 0; index < vector.length; index += 1) {
    const value = vector[index]
    if (value === undefined) throw new Error('vector index is outside the declared dimensions')
    view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, value, true)
  }
  return bytes
}

function readVector(value: Uint8Array, dimensions: number): Float32Array {
  if (value.byteLength !== dimensions * Float32Array.BYTES_PER_ELEMENT) {
    throw new Error('stored Skill search vector byte length does not match its dimensions')
  }
  const view = new DataView(value.buffer, value.byteOffset, value.byteLength)
  const vector = new Float32Array(dimensions)
  for (let index = 0; index < dimensions; index += 1) {
    vector[index] = view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true)
  }
  return vector
}

function embeddingInput(chunk: SourceChunk): string {
  const heading = chunk.headings.join(' > ')
  return heading === '' ? `${chunk.path}\n${chunk.text}` : `${chunk.path}\n${heading}\n${chunk.text}`
}

function ftsQuery(query: string): string | undefined {
  const terms = lexicalTokenStream(query).split(' ').filter(Boolean)
  if (terms.length === 0) return undefined
  return terms.map(term => `"${term.replaceAll('"', '""')}"`).join(' OR ')
}

/** One SQLite connection serving all declared local Skill corpora. */
export class SkillSearchStore {
  private readonly refreshes = new Map<string, Promise<SkillSearchRefreshResult>>()
  private readonly active = new Set<Promise<SkillSearchRefreshResult>>()
  private closed = false
  private closing: Promise<void> | undefined

  /** @param db - Configured database owned by this store. */
  constructor(private readonly db: DatabaseSync) {}

  /**
   * Refresh one corpus serially and publish changes in one transaction.
   * @param request - Desired corpus documents and embedding model identity.
   * @param embed - Batch embedder for changed chunks.
   * @param signal - Caller cancellation.
   * @returns committed revision and changed/removed document counts.
   */
  refresh(
    request: SkillSearchRefreshRequest,
    embed: EmbedChangedChunks,
    signal: AbortSignal,
  ): Promise<SkillSearchRefreshResult> {
    if (this.closed) return Promise.reject(new Error('Skill search store is closed'))
    const prior = this.refreshes.get(request.corpusKey) ?? Promise.resolve(undefined)
    const operation = prior.catch(() => undefined).then(async () => await this.doRefresh(request, embed, signal))
    this.refreshes.set(request.corpusKey, operation)
    this.active.add(operation)
    void operation.finally(() => {
      this.active.delete(operation)
      if (this.refreshes.get(request.corpusKey) === operation) this.refreshes.delete(request.corpusKey)
    }).catch(() => {})
    return operation
  }

  private async doRefresh(
    request: SkillSearchRefreshRequest,
    embed: EmbedChangedChunks,
    signal: AbortSignal,
  ): Promise<SkillSearchRefreshResult> {
    requireActive(signal)
    const corpus = this.db.prepare(`
      SELECT model_id, model_revision, model_dimensions, revision
      FROM corpora WHERE corpus_key = ?
    `).get(request.corpusKey) as CorpusRow | undefined
    const existingRows = this.db.prepare(`
      SELECT path, bytes, mtime_ms, sha256 FROM documents WHERE corpus_key = ?
    `).all(request.corpusKey) as unknown as DocumentRow[]
    const existing = new Map(existingRows.map(row => [row.path, row]))
    const desired = new Map(request.documents.map(item => [item.document.path, item]))
    const modelMatches = sameModel(corpus, request.model)
    const changed = request.documents.filter(({ document }) => {
      const row = existing.get(document.path)
      return !modelMatches || row === undefined || row.bytes !== document.bytes
        || row.mtime_ms !== document.mtimeMs || row.sha256 !== document.sha256
    })
    const removed = existingRows.filter(row => !desired.has(row.path))
    if (corpus !== undefined && changed.length === 0 && removed.length === 0) {
      return { revision: corpus.revision, changedDocuments: 0, removedDocuments: 0 }
    }

    const changedChunks = changed.flatMap(item => item.chunks)
    const vectors = await embed(changedChunks.map(embeddingInput), signal)
    requireActive(signal)
    if (vectors.length !== changedChunks.length) throw new Error('embedder returned a different vector count')
    for (const vector of vectors) {
      if (vector.length !== request.model.dimensions) throw new Error('embedder vector dimensions do not match model identity')
      if ([...vector].some(value => !Number.isFinite(value))) throw new Error('embedder returned a non-finite vector')
    }

    const nextRevision = (corpus?.revision ?? 0) + 1
    this.db.exec('BEGIN IMMEDIATE')
    try {
      requireActive(signal)
      this.db.prepare(`
        INSERT INTO corpora (corpus_key, model_id, model_revision, model_dimensions, revision)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(corpus_key) DO UPDATE SET
          model_id = excluded.model_id,
          model_revision = excluded.model_revision,
          model_dimensions = excluded.model_dimensions,
          revision = excluded.revision
      `).run(request.corpusKey, request.model.id, request.model.revision, request.model.dimensions, nextRevision)

      const replacedPaths = [...removed.map(row => row.path), ...changed.map(item => item.document.path)]
      const selectChunkIds = this.db.prepare('SELECT id FROM chunks WHERE corpus_key = ? AND document_path = ?')
      const deleteFts = this.db.prepare('DELETE FROM chunks_fts WHERE corpus_key = ? AND chunk_id = ?')
      const deleteDocument = this.db.prepare('DELETE FROM documents WHERE corpus_key = ? AND path = ?')
      for (const path of replacedPaths) {
        requireActive(signal)
        const ids = selectChunkIds.all(request.corpusKey, path) as unknown as Array<{ id: string }>
        for (const { id } of ids) deleteFts.run(request.corpusKey, id)
        deleteDocument.run(request.corpusKey, path)
      }

      const insertDocument = this.db.prepare(`
        INSERT INTO documents (corpus_key, path, bytes, mtime_ms, sha256) VALUES (?, ?, ?, ?, ?)
      `)
      const insertChunk = this.db.prepare(`
        INSERT INTO chunks (
          corpus_key, id, document_path, headings_json, start_line, end_line, text, content_sha256
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const insertVector = this.db.prepare(`
        INSERT INTO vectors (corpus_key, chunk_id, dimensions, vector) VALUES (?, ?, ?, ?)
      `)
      const insertFts = this.db.prepare(`
        INSERT INTO chunks_fts (corpus_key, chunk_id, lexical) VALUES (?, ?, ?)
      `)
      let vectorIndex = 0
      for (const item of changed) {
        requireActive(signal)
        const { document } = item
        insertDocument.run(
          request.corpusKey,
          document.path,
          document.bytes,
          document.mtimeMs,
          document.sha256,
        )
        for (const chunk of item.chunks) {
          const vector = vectors[vectorIndex]
          if (vector === undefined) throw new Error('missing prepared vector')
          vectorIndex += 1
          insertChunk.run(
            request.corpusKey,
            chunk.id,
            document.path,
            JSON.stringify(chunk.headings),
            chunk.startLine,
            chunk.endLine,
            chunk.text,
            chunk.contentSha256,
          )
          insertVector.run(request.corpusKey, chunk.id, vector.length, vectorBlob(vector))
          insertFts.run(request.corpusKey, chunk.id, lexicalTokenStream(chunk.text))
        }
      }
      this.db.exec('COMMIT')
      return {
        revision: nextRevision,
        changedDocuments: changed.length,
        removedDocuments: removed.length,
      }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  /**
   * Read the current committed corpus revision.
   * @param corpusKey - Corpus identity.
   * @returns current committed revision or zero.
   */
  corpusRevision(corpusKey: string): number {
    const row = this.db.prepare('SELECT revision FROM corpora WHERE corpus_key = ?').get(corpusKey) as
      | { revision: number }
      | undefined
    return row?.revision ?? 0
  }

  /**
   * Read the embedding model identity stamped on a corpus.
   * @param corpusKey - Corpus identity.
   * @returns stamped embedding identity, when indexed.
   */
  modelIdentity(corpusKey: string): SkillSearchModelIdentity | undefined {
    const row = this.db.prepare(`
      SELECT model_id, model_revision, model_dimensions FROM corpora WHERE corpus_key = ?
    `).get(corpusKey) as Omit<CorpusRow, 'revision'> | undefined
    return row === undefined ? undefined : {
      id: row.model_id,
      revision: row.model_revision,
      dimensions: row.model_dimensions,
    }
  }

  /**
   * Query the committed FTS index.
   * @param corpusKey - Corpus identity.
   * @param query - Raw query converted to the local lexical stream.
   * @param limit - Maximum candidates.
   * @returns candidates in SQLite BM25 order.
   */
  lexicalCandidates(corpusKey: string, query: string, limit: number): LexicalCandidate[] {
    const match = ftsQuery(query)
    if (match === undefined) return []
    const rows = this.db.prepare(`
      SELECT c.id, c.document_path AS path, c.headings_json, c.start_line, c.end_line, c.text,
             bm25(chunks_fts) AS bm25
      FROM chunks_fts
      JOIN chunks c ON c.corpus_key = chunks_fts.corpus_key AND c.id = chunks_fts.chunk_id
      WHERE chunks_fts MATCH ? AND chunks_fts.corpus_key = ?
      ORDER BY bm25 ASC, c.document_path ASC, c.start_line ASC, c.id ASC
      LIMIT ?
    `).all(match, corpusKey, limit) as unknown as Array<{
      id: string
      path: string
      headings_json: string
      start_line: number
      end_line: number
      text: string
      bm25: number
    }>
    return rows.map(row => ({
      id: row.id,
      path: row.path,
      headings: JSON.parse(row.headings_json) as string[],
      startLine: row.start_line,
      endLine: row.end_line,
      text: row.text,
      bm25: row.bm25,
    }))
  }

  /**
   * Read every committed vector for exact semantic scoring.
   * @param corpusKey - Corpus identity.
   * @returns all committed vectors in deterministic source order.
   */
  vectorRows(corpusKey: string): StoredVectorRow[] {
    const rows = this.db.prepare(`
      SELECT c.id, c.document_path AS path, c.headings_json, c.start_line, c.end_line, c.text,
             v.dimensions, v.vector
      FROM chunks c
      JOIN vectors v ON v.corpus_key = c.corpus_key AND v.chunk_id = c.id
      WHERE c.corpus_key = ?
      ORDER BY c.document_path ASC, c.start_line ASC, c.id ASC
    `).all(corpusKey) as unknown as Array<{
      id: string
      path: string
      headings_json: string
      start_line: number
      end_line: number
      text: string
      dimensions: number
      vector: Uint8Array
    }>
    return rows.map(row => ({
      id: row.id,
      path: row.path,
      headings: JSON.parse(row.headings_json) as string[],
      startLine: row.start_line,
      endLine: row.end_line,
      text: row.text,
      vector: readVector(row.vector, row.dimensions),
    }))
  }

  /** Close after all active refresh operations settle. Idempotent. */
  close(): Promise<void> {
    this.closing ??= this.doClose()
    return this.closing
  }

  private async doClose(): Promise<void> {
    this.closed = true
    await Promise.allSettled([...this.active])
    this.db.close()
  }
}

/**
 * Open the persistent local Skill search store.
 * @param path - SQLite file path or `:memory:`.
 * @returns an owned store ready for refresh and query operations.
 */
export async function openSkillSearchStore(path: string): Promise<SkillSearchStore> {
  return new SkillSearchStore(await openDatabase(path))
}
