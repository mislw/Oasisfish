/** Directory-backed Skill search provider orchestration. */

import { createHash } from 'node:crypto'
import type { ResolvedSkillCorpus, SkillSearchProvider, SkillSearchRequest, SkillSearchResult } from '@deepseek-ai/dsh-skill-search'
import { SkillSearchError } from '@deepseek-ai/dsh-skill-search'
import { chunkDocument } from './chunk.ts'
import { discoverCorpus } from './corpus.ts'
import type { SkillSearchEmbedder } from './embedder.ts'
import { retrieve } from './retrieval.ts'
import type { SkillSearchStore } from './store.ts'

/** Fully resolved local indexing and retrieval controls. */
export interface LocalSkillSearchProviderOptions {
  readonly providerName: string
  readonly chunkTargetCodePoints: number
  readonly chunkMaxCodePoints: number
  readonly chunkOverlapCodePoints: number
  readonly lexicalCandidates: number
  readonly vectorCandidates: number
  readonly rrfK: number
  readonly headingBoost: number
  readonly pathBoost: number
  readonly mmrLambda: number
  readonly defaultResultCount: number
  readonly maxResultCount: number
}

function corpusKey(corpus: ResolvedSkillCorpus, resourcePath: string, embedder: SkillSearchEmbedder): string {
  return createHash('sha256').update(JSON.stringify({
    corpus: corpus.id,
    resourcePath,
    model: embedder.identity,
  })).digest('hex')
}

function aborted(signal: AbortSignal): SkillSearchError {
  return new SkillSearchError('ABORTED', 'Local Skill search was cancelled.', { cause: signal.reason })
}

function modelFailure(error: unknown, signal: AbortSignal): never {
  if (signal.aborted) throw aborted(signal)
  if (error instanceof SkillSearchError) throw error
  throw new SkillSearchError('MODEL_UNAVAILABLE', 'The local Skill search embedding model is unavailable.', { cause: error })
}

/** Provider that refreshes and searches one persistent local index on demand. */
export class LocalSkillSearchProvider implements SkillSearchProvider {
  private readonly lifecycle = new AbortController()
  private readonly active = new Set<Promise<SkillSearchResult>>()
  private disposal: Promise<void> | undefined

  /**
   * @param store - Persistent SQLite index owned by this provider.
   * @param embedder - Local document and query embedding runtime.
   * @param options - Validated indexing and retrieval controls.
   */
  constructor(
    private readonly store: SkillSearchStore,
    private readonly embedder: SkillSearchEmbedder,
    private readonly options: LocalSkillSearchProviderOptions,
  ) {}

  /** @inheritdoc */
  supports(corpus: ResolvedSkillCorpus): boolean {
    return corpus.resourceBase.kind === 'directory'
  }

  /** @inheritdoc */
  async search(
    corpus: ResolvedSkillCorpus,
    request: SkillSearchRequest,
    signal: AbortSignal,
  ): Promise<SkillSearchResult> {
    if (this.disposal !== undefined) throw new Error('Local Skill search provider is disposed')
    const operation = this.doSearch(corpus, request, signal)
    this.active.add(operation)
    void operation.then(
      () => { this.active.delete(operation) },
      () => { this.active.delete(operation) },
    )
    return await operation
  }

  private async doSearch(
    corpus: ResolvedSkillCorpus,
    request: SkillSearchRequest,
    signal: AbortSignal,
  ): Promise<SkillSearchResult> {
    if (corpus.resourceBase.kind !== 'directory') {
      throw new SkillSearchError('UNSUPPORTED_RESOURCE_BASE', 'The local search provider requires directory Skill resources.')
    }
    const operationSignal = AbortSignal.any([signal, this.lifecycle.signal])
    operationSignal.throwIfAborted()
    const limit = request.limit ?? this.options.defaultResultCount
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > this.options.maxResultCount) {
      throw new Error(`Skill search limit must be between 1 and ${this.options.maxResultCount}`)
    }
    const documents = await discoverCorpus(corpus, operationSignal)
    const indexed = documents.map(document => ({
      document,
      chunks: chunkDocument(document, {
        targetCodePoints: this.options.chunkTargetCodePoints,
        maxCodePoints: this.options.chunkMaxCodePoints,
        overlapCodePoints: this.options.chunkOverlapCodePoints,
      }),
    }))
    const chunkCount = indexed.reduce((sum, document) => sum + document.chunks.length, 0)
    if (chunkCount > corpus.spec.maxChunks) {
      throw new SkillSearchError('CORPUS_LIMIT', 'The Skill corpus exceeds maxChunks.')
    }
    const key = corpusKey(corpus, corpus.resourceBase.path, this.embedder)
    await this.store.refresh({ corpusKey: key, model: this.embedder.identity, documents: indexed }, async (texts, refreshSignal) => {
      try {
        return await this.embedder.embedDocuments(texts, refreshSignal)
      } catch (error) {
        return modelFailure(error, refreshSignal)
      }
    }, operationSignal)
    try {
      const hits = await retrieve(this.store, key, request.query, {
        lexicalCandidates: this.options.lexicalCandidates,
        vectorCandidates: this.options.vectorCandidates,
        rrfK: this.options.rrfK,
        headingBoost: this.options.headingBoost,
        pathBoost: this.options.pathBoost,
        mmrLambda: this.options.mmrLambda,
        limit,
      }, this.embedder, operationSignal)
      return {
        skill: corpus.skill.name,
        query: request.query,
        hits: hits.map(hit => ({ ...hit, skill: corpus.skill.name })),
      }
    } catch (error) {
      return modelFailure(error, operationSignal)
    }
  }

  /** Abort active searches, await settlement, then attempt both owned resource teardowns. */
  dispose(): Promise<void> {
    if (this.disposal === undefined) {
      this.lifecycle.abort(new Error('Local Skill search provider disposed'))
      this.disposal = this.disposeResources()
    }
    return this.disposal
  }

  private async disposeResources(): Promise<void> {
    await Promise.allSettled([...this.active])
    const outcomes = await Promise.allSettled([
      Promise.resolve().then(() => this.store.close()),
      Promise.resolve().then(() => this.embedder.dispose()),
    ])
    const failures: unknown[] = []
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') failures.push(outcome.reason as unknown)
    }
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'Local Skill search provider disposal failed')
  }
}
