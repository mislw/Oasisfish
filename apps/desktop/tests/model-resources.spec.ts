import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MODEL_RESOURCE_FILES,
  readModelManifest,
  verifyModelResources,
} from '../scripts/verify-model-resources.mjs'

const desktopRoot = resolve(import.meta.dirname, '..')
const modelRoot = join(desktopRoot, 'bundled-models', 'bge-small-zh-v1.5')
const expectedHashes = {
  'config.json': 'd4193ead3a810fd694fa8a31d7fc72fbaebc0668b603e398734bf2f6538ff42f',
  'onnx/model_quantized.onnx': '15b717c382bcb518ba457b93ea6850ede7f4f1cd8937454aa06972366cd19bcc',
  'special_tokens_map.json': 'b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3',
  'tokenizer_config.json': 'e6f3b96db926a37d4039995fbf5ad17de158dfb8f6343d607e4dbaad18d75f5a',
  'tokenizer.json': '48cea5d44424912a6fd1ea647bf4fe50b55ab8b1e5879c3275f80e339e8fae26',
  'vocab.txt': '45bbac6b341c319adc98a532532882e91a9cefc0329aa57bac9ae761c27b291c',
} as const
const expectedFiles = Object.entries(expectedHashes).map(([path, sha256]) => ({ path, sha256 }))

const temporaryDirectories: string[] = []

async function stageModelMetadata(root: string): Promise<void> {
  await cp(join(modelRoot, 'model-manifest.json'), join(root, 'model-manifest.json'))
  await cp(join(modelRoot, 'LICENSE'), join(root, 'LICENSE'))
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('bundled embedding model', () => {
  it('pins the approved repository, revision, license, runtime, files, and hashes', async () => {
    const manifest = await readModelManifest(join(modelRoot, 'model-manifest.json'))

    expect(manifest).toEqual({
      schemaVersion: 1,
      modelId: 'Xenova/bge-small-zh-v1.5',
      upstreamModelId: 'BAAI/bge-small-zh-v1.5',
      revision: '75c43b069aac4d136ba6bc1122f995fedcfd2781',
      dimensions: 512,
      license: 'MIT',
      transformersJsVersion: '4.2.0',
      files: expectedFiles,
    })
    expect(MODEL_RESOURCE_FILES).toEqual(Object.keys(expectedHashes))
    const modelConfig = JSON.parse(await readFile(join(modelRoot, 'config.json'), 'utf8')) as { hidden_size?: unknown }
    expect(modelConfig.hidden_size).toBe(manifest.dimensions)
  })

  it('verifies the checked-in model snapshot byte for byte', async () => {
    await expect(verifyModelResources(modelRoot)).resolves.toMatchObject({ files: expectedFiles })
  })

  it('rejects a missing model file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-model-missing-'))
    temporaryDirectories.push(root)
    await stageModelMetadata(root)

    await expect(verifyModelResources(root)).rejects.toThrow('config.json')
  })

  it('rejects a model file whose bytes do not match the manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-model-tampered-'))
    temporaryDirectories.push(root)
    await stageModelMetadata(root)
    await writeFile(join(root, 'config.json'), 'tampered')

    await expect(verifyModelResources(root)).rejects.toThrow('SHA-256 mismatch')
  })

  it('rejects a reparse point beneath the model root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-model-reparse-'))
    temporaryDirectories.push(root)
    await stageModelMetadata(root)
    const target = join(root, 'target.json')
    await writeFile(target, await readFile(join(modelRoot, 'config.json')))
    await symlink(target, join(root, 'config.json'), 'file')

    await expect(verifyModelResources(root)).rejects.toThrow('reparse point')
  })
})
