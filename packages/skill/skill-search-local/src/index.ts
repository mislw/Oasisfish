/** Directory-backed local Skill corpus search provider. @module @deepseek-ai/dsh-skill-search-local */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { TransformersJsEmbedder } from './embedder.ts'
import { LocalSkillSearchProvider, type LocalSkillSearchProviderOptions } from './provider.ts'
import { openSkillSearchStore } from './store.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'skill-search-local'
/** Provider-neutral Skill search registry required for registration. */
export const inject = ['skillSearch']

const DEFAULT_CHUNK_TARGET = 800
const DEFAULT_CHUNK_MAX = 1200
const DEFAULT_CHUNK_OVERLAP = 120
const DEFAULT_EMBEDDING_BATCH_SIZE = 16
const DEFAULT_CANDIDATES = 50
const DEFAULT_RRF_K = 60
const DEFAULT_HEADING_BOOST = 0.1
const DEFAULT_PATH_BOOST = 0.05
const DEFAULT_MMR_LAMBDA = 0.6
const DEFAULT_RESULT_COUNT = 5
const DEFAULT_MAX_RESULT_COUNT = 10

/** Local provider database, model, indexing, and ranking configuration. */
export interface Config {
  /** Unique provider name within one scope layer. */
  providerName?: string
  /** Mutable SQLite database path. */
  databasePath: string
  /** Immutable local Transformers.js model root. */
  modelRoot: string
  /** Optional manifest path; defaults to `model-manifest.json` under {@link modelRoot}. */
  manifestFile?: string
  /** Preferred Unicode code-point count per chunk. */
  chunkTargetCodePoints?: number
  /** Hard Unicode code-point maximum per chunk. */
  chunkMaxCodePoints?: number
  /** Prose overlap copied from the preceding chunk. */
  chunkOverlapCodePoints?: number
  /** Maximum documents embedded in one model call. */
  embeddingBatchSize?: number
  /** Maximum SQLite BM25 candidates. */
  lexicalCandidates?: number
  /** Maximum exact-cosine candidates. */
  vectorCandidates?: number
  /** Reciprocal-rank fusion denominator constant. */
  rrfK?: number
  /** Bounded score added for an exact heading query match. */
  headingBoost?: number
  /** Bounded score added for an exact relative-path query match. */
  pathBoost?: number
  /** Relevance weight used by maximal marginal relevance. */
  mmrLambda?: number
  /** Result count used when the caller omits `limit`. */
  defaultResultCount?: number
  /** Maximum result count accepted from any caller; cannot exceed 10. */
  maxResultCount?: number
}

export const Config: z<Config> = z.object({
  providerName: z.string().min(1).default('local'),
  databasePath: z.string().required(),
  modelRoot: z.string().required(),
  manifestFile: z.string(),
  chunkTargetCodePoints: z.number().default(DEFAULT_CHUNK_TARGET),
  chunkMaxCodePoints: z.number().default(DEFAULT_CHUNK_MAX),
  chunkOverlapCodePoints: z.number().default(DEFAULT_CHUNK_OVERLAP),
  embeddingBatchSize: z.number().default(DEFAULT_EMBEDDING_BATCH_SIZE),
  lexicalCandidates: z.number().default(DEFAULT_CANDIDATES),
  vectorCandidates: z.number().default(DEFAULT_CANDIDATES),
  rrfK: z.number().default(DEFAULT_RRF_K),
  headingBoost: z.number().default(DEFAULT_HEADING_BOOST),
  pathBoost: z.number().default(DEFAULT_PATH_BOOST),
  mmrLambda: z.number().default(DEFAULT_MMR_LAMBDA),
  defaultResultCount: z.number().default(DEFAULT_RESULT_COUNT),
  maxResultCount: z.number().default(DEFAULT_MAX_RESULT_COUNT),
})

function positiveInteger(field: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`skill-search-local: ${field} must be a positive safe integer`)
  return value
}

function resolvedOptions(config: Config): LocalSkillSearchProviderOptions {
  const chunkTargetCodePoints = positiveInteger('chunkTargetCodePoints', config.chunkTargetCodePoints ?? DEFAULT_CHUNK_TARGET)
  const chunkMaxCodePoints = positiveInteger('chunkMaxCodePoints', config.chunkMaxCodePoints ?? DEFAULT_CHUNK_MAX)
  const chunkOverlapCodePoints = config.chunkOverlapCodePoints ?? DEFAULT_CHUNK_OVERLAP
  if (!Number.isSafeInteger(chunkOverlapCodePoints) || chunkOverlapCodePoints < 0 || chunkOverlapCodePoints >= chunkTargetCodePoints) {
    throw new Error('skill-search-local: chunkOverlapCodePoints must be a non-negative safe integer smaller than chunkTargetCodePoints')
  }
  if (chunkMaxCodePoints < chunkTargetCodePoints) throw new Error('skill-search-local: chunkMaxCodePoints cannot be smaller than chunkTargetCodePoints')
  const maxResultCount = positiveInteger('maxResultCount', config.maxResultCount ?? DEFAULT_MAX_RESULT_COUNT)
  if (maxResultCount > 10) throw new Error('skill-search-local: maxResultCount cannot exceed 10')
  const defaultResultCount = positiveInteger('defaultResultCount', config.defaultResultCount ?? DEFAULT_RESULT_COUNT)
  if (defaultResultCount > maxResultCount) throw new Error('skill-search-local: defaultResultCount cannot exceed maxResultCount')
  const rrfK = config.rrfK ?? DEFAULT_RRF_K
  const headingBoost = config.headingBoost ?? DEFAULT_HEADING_BOOST
  const pathBoost = config.pathBoost ?? DEFAULT_PATH_BOOST
  const mmrLambda = config.mmrLambda ?? DEFAULT_MMR_LAMBDA
  if (!Number.isFinite(rrfK) || rrfK <= 0) throw new Error('skill-search-local: rrfK must be positive')
  if (!Number.isFinite(headingBoost) || headingBoost < 0 || !Number.isFinite(pathBoost) || pathBoost < 0) {
    throw new Error('skill-search-local: headingBoost and pathBoost must be finite and non-negative')
  }
  if (!Number.isFinite(mmrLambda) || mmrLambda < 0 || mmrLambda > 1) throw new Error('skill-search-local: mmrLambda must be between zero and one')
  return {
    providerName: config.providerName ?? 'local',
    chunkTargetCodePoints,
    chunkMaxCodePoints,
    chunkOverlapCodePoints,
    lexicalCandidates: positiveInteger('lexicalCandidates', config.lexicalCandidates ?? DEFAULT_CANDIDATES),
    vectorCandidates: positiveInteger('vectorCandidates', config.vectorCandidates ?? DEFAULT_CANDIDATES),
    rrfK,
    headingBoost,
    pathBoost,
    mmrLambda,
    defaultResultCount,
    maxResultCount,
  }
}

/**
 * Verify local resources and register the directory search provider.
 * @param ctx - Cordis context carrying `ctx.skillSearch`.
 * @param config - Explicit database, model, chunking, and retrieval settings.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const options = resolvedOptions(config)
  const store = await openSkillSearchStore(config.databasePath)
  let embedder: TransformersJsEmbedder
  try {
    embedder = await TransformersJsEmbedder.create({
      modelRoot: config.modelRoot,
      batchSize: positiveInteger('embeddingBatchSize', config.embeddingBatchSize ?? DEFAULT_EMBEDDING_BATCH_SIZE),
      ...config.manifestFile === undefined ? {} : { manifestFile: config.manifestFile },
    })
  } catch (error) {
    await store.close()
    throw error
  }
  const provider = new LocalSkillSearchProvider(store, embedder, options)
  ctx.skillSearch.registerProvider((control) => {
    control.signal.addEventListener('abort', () => { void provider.dispose() }, { once: true })
    return provider
  })
  ctx.effect(function* () {
    yield async () => { await provider.dispose() }
  }, 'skill-search-local resources')
}

export { discoverCorpus, type DiscoveredDocument } from './corpus.ts'
export { chunkDocument, type ChunkOptions, type SourceChunk } from './chunk.ts'
export { lexicalTokenStream } from './lexical.ts'
export {
  DeterministicFixtureEmbedder,
  TransformersJsEmbedder,
  type FeatureExtractionOutput,
  type FeatureExtractor,
  type SkillSearchEmbedder,
  type TransformersEnvironment,
  type TransformersJsEmbedderOptions,
  type TransformersModule,
} from './embedder.ts'
export {
  retrieve,
  type RetrievalOptions,
  type SkillSearchRetrievalHit,
  type SkillSearchRetrievalStore,
} from './retrieval.ts'
export { LocalSkillSearchProvider, type LocalSkillSearchProviderOptions } from './provider.ts'
export {
  SKILL_SEARCH_SCHEMA_VERSION,
  SkillSearchStore,
  openSkillSearchStore,
  type EmbedChangedChunks,
  type IndexedSourceDocument,
  type LexicalCandidate,
  type SkillSearchModelIdentity,
  type SkillSearchRefreshRequest,
  type SkillSearchRefreshResult,
  type StoredVectorRow,
} from './store.ts'
