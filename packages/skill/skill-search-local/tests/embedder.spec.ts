import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  DeterministicFixtureEmbedder,
  TransformersJsEmbedder,
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
    expect(pipeline).toHaveBeenCalledWith('feature-extraction', 'fixture/model', {
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
})
