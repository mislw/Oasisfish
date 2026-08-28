/** Local-only embedding implementations for Skill search. */

import { createHash } from 'node:crypto'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { SkillSearchModelIdentity } from './store.ts'

/** Minimal Transformers.js environment fields used by the local loader. */
export interface TransformersEnvironment {
  allowRemoteModels: boolean
  localModelPath: string
}

/** Tensor-like result returned by the feature-extraction pipeline. */
export interface FeatureExtractionOutput {
  tolist(): unknown
}

/** Callable feature extractor plus optional resource disposal. */
export interface FeatureExtractor {
  (texts: string[], options: { pooling: 'mean'; normalize: true }): Promise<FeatureExtractionOutput>
  dispose?: () => Promise<void> | void
}

/** Narrow Transformers.js module contract required by this package. */
export interface TransformersModule {
  env: TransformersEnvironment
  pipeline(
    task: 'feature-extraction',
    model: string,
    options: { local_files_only: true; device: 'cpu'; dtype: 'q8' },
  ): Promise<FeatureExtractor>
}

/** Embedding provider used by indexing and query retrieval. */
export interface SkillSearchEmbedder {
  readonly identity: SkillSearchModelIdentity
  embedDocuments(texts: readonly string[], signal: AbortSignal): Promise<readonly Float32Array[]>
  embedQuery(text: string, signal: AbortSignal): Promise<Float32Array>
  dispose(): Promise<void>
}

/** Immutable local model loader configuration. */
export interface TransformersJsEmbedderOptions {
  /** Immutable directory containing the model manifest and its declared files. */
  readonly modelRoot: string
  readonly batchSize: number
  readonly manifestFile?: string
}

interface ModelManifest {
  modelId: string
  revision: string
  dimensions: number
  files: Array<{ path: string; sha256: string }>
}

function isWithin(base: string, candidate: string): boolean {
  const local = relative(base, candidate)
  return local === '' || (!local.startsWith(`..${sep}`) && local !== '..' && !isAbsolute(local))
}

function parseManifest(value: unknown): ModelManifest {
  if (typeof value !== 'object' || value === null) throw new Error('Skill search model manifest must be an object')
  const record = value as Record<string, unknown>
  if (typeof record.modelId !== 'string' || record.modelId === '') throw new Error('Skill search model manifest modelId is invalid')
  if (typeof record.revision !== 'string' || record.revision === '') throw new Error('Skill search model manifest revision is invalid')
  if (!Number.isSafeInteger(record.dimensions) || (record.dimensions as number) <= 0) {
    throw new Error('Skill search model manifest dimensions are invalid')
  }
  if (!Array.isArray(record.files) || record.files.length === 0) throw new Error('Skill search model manifest files are invalid')
  const files = record.files.map((entry) => {
    if (typeof entry !== 'object' || entry === null) throw new Error('Skill search model manifest file entry is invalid')
    const file = entry as Record<string, unknown>
    if (typeof file.path !== 'string' || file.path === '' || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(file.sha256)) {
      throw new Error('Skill search model manifest file entry is invalid')
    }
    return { path: file.path, sha256: file.sha256 }
  })
  return {
    modelId: record.modelId,
    revision: record.revision,
    dimensions: record.dimensions as number,
    files,
  }
}

async function verifyManifest(root: string, manifestFile: string): Promise<ModelManifest> {
  const manifest = parseManifest(JSON.parse(await readFile(manifestFile, 'utf8')) as unknown)
  for (const file of manifest.files) {
    const path = resolve(root, file.path)
    if (!isWithin(root, path)) throw new Error('Skill search model manifest path escapes modelRoot')
    const actual = createHash('sha256').update(await readFile(path)).digest('hex')
    if (actual !== file.sha256) throw new Error(`Skill search model file "${file.path}" failed SHA-256 verification`)
  }
  return manifest
}

function normalize(row: readonly number[], dimensions: number): Float32Array {
  if (row.length !== dimensions) throw new Error('embedding dimensions do not match the model manifest')
  let squared = 0
  for (const value of row) {
    if (!Number.isFinite(value)) throw new Error('embedding contains a non-finite value')
    squared += value * value
  }
  const length = Math.sqrt(squared)
  if (length === 0) throw new Error('embedding has zero length')
  return Float32Array.from(row, value => value / length)
}

function outputRows(output: FeatureExtractionOutput): number[][] {
  const value = output.tolist()
  if (!Array.isArray(value)) throw new Error('feature extractor returned a non-array tensor')
  return value.map((row) => {
    if (!Array.isArray(row) || row.some(component => typeof component !== 'number')) {
      throw new Error('feature extractor returned an invalid embedding row')
    }
    return row as number[]
  })
}

async function loadTransformers(): Promise<TransformersModule> {
  const loaded: unknown = await import('@huggingface/transformers')
  if (typeof loaded !== 'object' || loaded === null || !('env' in loaded) || !('pipeline' in loaded)) {
    throw new Error('Transformers.js module does not expose env and pipeline')
  }
  return loaded as TransformersModule
}

/** Local-only Transformers.js feature extractor. */
export class TransformersJsEmbedder implements SkillSearchEmbedder {
  readonly identity: SkillSearchModelIdentity
  private disposed = false

  private constructor(
    manifest: ModelManifest,
    private readonly batchSize: number,
    private readonly extractor: FeatureExtractor,
  ) {
    this.identity = {
      id: manifest.modelId,
      revision: manifest.revision,
      dimensions: manifest.dimensions,
    }
  }

  /**
   * Verify a staged model and create its local-only feature extractor.
   * @param options - Immutable model root, batch size, and optional manifest path.
   * @param module - Optional injected Transformers.js module for deterministic tests.
   * @returns ready local embedder.
   */
  static async create(
    options: TransformersJsEmbedderOptions,
    module?: TransformersModule,
  ): Promise<TransformersJsEmbedder> {
    if (!Number.isSafeInteger(options.batchSize) || options.batchSize <= 0) throw new Error('embedding batchSize must be a positive integer')
    const root = resolve(options.modelRoot)
    const manifest = await verifyManifest(root, options.manifestFile ?? join(root, 'model-manifest.json'))
    const transformers = module ?? await loadTransformers()
    transformers.env.allowRemoteModels = false
    transformers.env.localModelPath = root
    const extractor = await transformers.pipeline('feature-extraction', root, {
      local_files_only: true,
      device: 'cpu',
      dtype: 'q8',
    })
    return new TransformersJsEmbedder(manifest, options.batchSize, extractor)
  }

  /** @inheritdoc */
  async embedDocuments(texts: readonly string[], signal: AbortSignal): Promise<readonly Float32Array[]> {
    if (this.disposed) throw new Error('embedding model is disposed')
    const vectors: Float32Array[] = []
    for (let offset = 0; offset < texts.length; offset += this.batchSize) {
      signal.throwIfAborted()
      const batch = texts.slice(offset, offset + this.batchSize)
      const rows = outputRows(await this.extractor([...batch], { pooling: 'mean', normalize: true }))
      signal.throwIfAborted()
      if (rows.length !== batch.length) throw new Error('feature extractor returned a different embedding count')
      vectors.push(...rows.map(row => normalize(row, this.identity.dimensions)))
    }
    return vectors
  }

  /** @inheritdoc */
  async embedQuery(text: string, signal: AbortSignal): Promise<Float32Array> {
    const [vector] = await this.embedDocuments([text], signal)
    if (vector === undefined) throw new Error('feature extractor returned no query embedding')
    return vector
  }

  /** @inheritdoc */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    await this.extractor.dispose?.()
  }
}

/** Deterministic normalized embedder used by keyless tests and snapshots. */
export class DeterministicFixtureEmbedder implements SkillSearchEmbedder {
  readonly identity: SkillSearchModelIdentity

  /** @param dimensions - Positive deterministic vector width. */
  constructor(dimensions: number) {
    if (!Number.isSafeInteger(dimensions) || dimensions <= 0) throw new Error('fixture embedding dimensions must be positive')
    this.identity = { id: 'deterministic-fixture', revision: '1', dimensions }
  }

  /** @inheritdoc */
  embedDocuments(texts: readonly string[], signal: AbortSignal): Promise<readonly Float32Array[]> {
    return Promise.resolve(texts.map(text => this.vector(text, signal)))
  }

  /** @inheritdoc */
  embedQuery(text: string, signal: AbortSignal): Promise<Float32Array> {
    return Promise.resolve(this.vector(text, signal))
  }

  private vector(text: string, signal: AbortSignal): Float32Array {
    signal.throwIfAborted()
    const bytes = createHash('sha256').update(text).digest()
    const row = Array.from({ length: this.identity.dimensions }, (_, index) => {
      const byte = bytes[index % bytes.length]
      if (byte === undefined) throw new Error('fixture embedding digest is empty')
      return (byte - 127.5) / 127.5
    })
    return normalize(row, this.identity.dimensions)
  }

  /** @inheritdoc */
  dispose(): Promise<void> {
    return Promise.resolve()
  }
}
