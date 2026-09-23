import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  DeterministicFixtureEmbedder,
  TransformersJsEmbedder,
  type FeatureExtractionOutput,
  type FeatureExtractor,
  type TransformersModule,
} from '../src/embedder.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function modelFixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-search-model-'))
  roots.push(root)
  await mkdir(join(root, 'onnx'), { recursive: true })
  const bytes = Buffer.from('model')
  await writeFile(join(root, 'onnx', 'model_quantized.onnx'), bytes)
  await writeFile(join(root, 'model-manifest.json'), `${JSON.stringify({
    modelId: 'fixture/model',
    revision: 'revision-1',
    dimensions: 2,
    files: [{
      path: 'onnx/model_quantized.onnx',
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }],
  })}\n`)
  return root
}

async function writeManifest(root: string, value: unknown, file = 'model-manifest.json'): Promise<string> {
  const path = join(root, file)
  await writeFile(path, `${JSON.stringify(value)}\n`)
  return path
}

function moduleWith(output: (texts: string[]) => unknown, dispose?: () => Promise<void> | void): TransformersModule {
  const extractor: FeatureExtractor = Object.assign(async (texts: string[]): Promise<FeatureExtractionOutput> => ({
    tolist: () => output(texts),
  }), dispose === undefined ? {} : { dispose })
  return {
    env: { allowRemoteModels: true, localModelPath: '' },
    pipeline: async () => extractor,
  }
}

describe('TransformersJsEmbedder', () => {
  it('verifies the local manifest, disables remote models, and batches normalized embeddings', async () => {
    const root = await modelFixture()
    const dispose = vi.fn(() => Promise.resolve())
    const extractor = vi.fn(async (texts: string[], options: object) => {
      expect(options).toEqual({ pooling: 'mean', normalize: true })
      return { tolist: () => texts.map(text => text === 'a' ? [3, 4] : [0, 2]) }
    })
    const pipeline = vi.fn(async () => Object.assign(extractor, { dispose }))
    const module: TransformersModule = {
      env: { allowRemoteModels: true, localModelPath: '' },
      pipeline,
    }

    const embedder = await TransformersJsEmbedder.create({ modelRoot: root, batchSize: 1 }, module)
    const vectors = await embedder.embedDocuments(['a', 'b'], new AbortController().signal)

    expect(module.env).toMatchObject({ allowRemoteModels: false, localModelPath: root })
    expect(pipeline).toHaveBeenCalledWith('feature-extraction', root, {
      local_files_only: true,
      device: 'cpu',
      dtype: 'q8',
    })
    expect(vectors).toEqual([Float32Array.of(0.6, 0.8), Float32Array.of(0, 1)])
    expect(extractor).toHaveBeenCalledTimes(2)
    await embedder.dispose()
    await embedder.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('rejects a mismatched manifest and exposes a deterministic normalized fixture embedder', async () => {
    const root = await modelFixture()
    await writeFile(join(root, 'onnx', 'model_quantized.onnx'), 'tampered')
    await expect(TransformersJsEmbedder.create({ modelRoot: root, batchSize: 2 }, {
      env: { allowRemoteModels: true, localModelPath: '' },
      pipeline: vi.fn(),
    })).rejects.toThrow('SHA-256')

    const fixture = new DeterministicFixtureEmbedder(4)
    const vector = await fixture.embedQuery('角色复活', new AbortController().signal)
    const norm = Math.sqrt([...vector].reduce((sum, component) => sum + component * component, 0))
    expect(norm).toBeCloseTo(1)
  })

  it.each([
    [null, 'must be an object'],
    [{}, 'modelId is invalid'],
    [{ modelId: '' }, 'modelId is invalid'],
    [{ modelId: 'fixture/model' }, 'revision is invalid'],
    [{ modelId: 'fixture/model', revision: '' }, 'revision is invalid'],
    [{ modelId: 'fixture/model', revision: '1', dimensions: 1.5 }, 'dimensions are invalid'],
    [{ modelId: 'fixture/model', revision: '1', dimensions: 0 }, 'dimensions are invalid'],
    [{ modelId: 'fixture/model', revision: '1', dimensions: 2 }, 'files are invalid'],
    [{ modelId: 'fixture/model', revision: '1', dimensions: 2, files: [] }, 'files are invalid'],
    [{ modelId: 'fixture/model', revision: '1', dimensions: 2, files: [null] }, 'file entry is invalid'],
    [{ modelId: 'fixture/model', revision: '1', dimensions: 2, files: [{}] }, 'file entry is invalid'],
    [{ modelId: 'fixture/model', revision: '1', dimensions: 2, files: [{ path: '', sha256: 'a'.repeat(64) }] }, 'file entry is invalid'],
    [{ modelId: 'fixture/model', revision: '1', dimensions: 2, files: [{ path: 'model', sha256: 1 }] }, 'file entry is invalid'],
    [{ modelId: 'fixture/model', revision: '1', dimensions: 2, files: [{ path: 'model', sha256: 'bad' }] }, 'file entry is invalid'],
  ])('rejects malformed manifest value %o', async (manifest, message) => {
    const root = await modelFixture()
    await writeManifest(root, manifest)

    await expect(TransformersJsEmbedder.create({ modelRoot: root, batchSize: 1 }, moduleWith(() => [[1, 0]])))
      .rejects.toThrow(message)
  })

  it('rejects manifest paths outside the immutable model root', async () => {
    const root = await modelFixture()
    await writeManifest(root, {
      modelId: 'fixture/model',
      revision: '1',
      dimensions: 2,
      files: [{ path: '../outside.bin', sha256: 'a'.repeat(64) }],
    })

    await expect(TransformersJsEmbedder.create({ modelRoot: root, batchSize: 1 }, moduleWith(() => [[1, 0]])))
      .rejects.toThrow('escapes modelRoot')
  })

  it.each([0, 1.5])('rejects invalid batch size %s', async (batchSize) => {
    const root = await modelFixture()
    await expect(TransformersJsEmbedder.create({ modelRoot: root, batchSize }, moduleWith(() => [[1, 0]])))
      .rejects.toThrow('positive integer')
  })

  it('accepts an explicit manifest file and an extractor without disposal', async () => {
    const root = await modelFixture()
    const defaultManifest = JSON.parse(await (await import('node:fs/promises')).readFile(join(root, 'model-manifest.json'), 'utf8')) as unknown
    const manifestFile = await writeManifest(root, defaultManifest, 'custom-manifest.json')
    const embedder = await TransformersJsEmbedder.create(
      { modelRoot: root, manifestFile, batchSize: 2 },
      moduleWith(texts => texts.map(() => [1, 0])),
    )

    await expect(embedder.embedQuery('query', new AbortController().signal)).resolves.toEqual(Float32Array.of(1, 0))
    await embedder.dispose()
  })

  it.each([
    [() => 'not an array', 'non-array tensor'],
    [() => [null], 'invalid embedding row'],
    [() => [[1, 'bad']], 'invalid embedding row'],
    [() => [[1]], 'dimensions do not match'],
    [() => [[Number.NaN, 1]], 'non-finite'],
    [() => [[0, 0]], 'zero length'],
    [() => [], 'different embedding count'],
  ])('rejects malformed extractor output', async (output, message) => {
    const root = await modelFixture()
    const embedder = await TransformersJsEmbedder.create({ modelRoot: root, batchSize: 2 }, moduleWith(output))

    await expect(embedder.embedDocuments(['text'], new AbortController().signal)).rejects.toThrow(message)
    await embedder.dispose()
  })

  it('checks cancellation before and after each extractor call', async () => {
    const root = await modelFixture()
    const before = await TransformersJsEmbedder.create({ modelRoot: root, batchSize: 1 }, moduleWith(() => [[1, 0]]))
    const preAborted = new AbortController()
    preAborted.abort(new Error('before extractor'))
    await expect(before.embedDocuments(['text'], preAborted.signal)).rejects.toThrow('before extractor')
    await before.dispose()

    const afterController = new AbortController()
    const after = await TransformersJsEmbedder.create({ modelRoot: root, batchSize: 1 }, moduleWith(() => {
      afterController.abort(new Error('after extractor'))
      return [[1, 0]]
    }))
    await expect(after.embedDocuments(['text'], afterController.signal)).rejects.toThrow('after extractor')
    await after.dispose()
  })

  it('rejects use after disposal and accepts an empty document batch', async () => {
    const root = await modelFixture()
    const embedder = await TransformersJsEmbedder.create({ modelRoot: root, batchSize: 2 }, moduleWith(() => []))
    await expect(embedder.embedDocuments([], new AbortController().signal)).resolves.toEqual([])
    await embedder.dispose()
    await expect(embedder.embedDocuments(['text'], new AbortController().signal)).rejects.toThrow('disposed')
  })

  it('loads the installed Transformers module when no test module is supplied', async () => {
    const root = await modelFixture()
    const extractor: FeatureExtractor = async () => ({ tolist: () => [[1, 0]] })
    const module: TransformersModule = {
      env: { allowRemoteModels: true, localModelPath: '' },
      pipeline: async () => extractor,
    }
    vi.doMock('@huggingface/transformers', () => module)
    try {
      const embedder = await TransformersJsEmbedder.create({ modelRoot: root, batchSize: 1 })
      await expect(embedder.embedQuery('query', new AbortController().signal)).resolves.toEqual(Float32Array.of(1, 0))
      await embedder.dispose()
    } finally {
      vi.doUnmock('@huggingface/transformers')
    }
  })

  it('validates and executes the deterministic fixture document path', async () => {
    expect(() => new DeterministicFixtureEmbedder(0)).toThrow('must be positive')
    expect(() => new DeterministicFixtureEmbedder(1.5)).toThrow('must be positive')
    const fixture = new DeterministicFixtureEmbedder(3)
    const vectors = await fixture.embedDocuments(['a', 'b'], new AbortController().signal)
    expect(vectors).toHaveLength(2)
    const controller = new AbortController()
    controller.abort(new Error('fixture cancelled'))
    await expect(fixture.embedQuery('a', controller.signal)).rejects.toThrow('fixture cancelled')
    await fixture.dispose()
  })
})
