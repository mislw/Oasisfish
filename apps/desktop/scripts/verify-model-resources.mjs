import { deepStrictEqual } from 'node:assert'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MODEL_RESOURCE_FILES = Object.freeze([
  'config.json',
  'onnx/model_quantized.onnx',
  'special_tokens_map.json',
  'tokenizer_config.json',
  'tokenizer.json',
  'vocab.txt',
])

const APPROVED_MODEL_MANIFEST = Object.freeze({
  schemaVersion: 1,
  modelId: 'Xenova/bge-small-zh-v1.5',
  upstreamModelId: 'BAAI/bge-small-zh-v1.5',
  revision: '75c43b069aac4d136ba6bc1122f995fedcfd2781',
  license: 'MIT',
  transformersJsVersion: '4.2.0',
  files: Object.freeze({
    'config.json': 'd4193ead3a810fd694fa8a31d7fc72fbaebc0668b603e398734bf2f6538ff42f',
    'onnx/model_quantized.onnx': '15b717c382bcb518ba457b93ea6850ede7f4f1cd8937454aa06972366cd19bcc',
    'special_tokens_map.json': 'b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3',
    'tokenizer_config.json': 'e6f3b96db926a37d4039995fbf5ad17de158dfb8f6343d607e4dbaad18d75f5a',
    'tokenizer.json': '48cea5d44424912a6fd1ea647bf4fe50b55ab8b1e5879c3275f80e339e8fae26',
    'vocab.txt': '45bbac6b341c319adc98a532532882e91a9cefc0329aa57bac9ae761c27b291c',
  }),
})

/** Read and require the one approved local embedding model manifest. */
export async function readModelManifest(path) {
  const parsed = JSON.parse(await readFile(path, 'utf8'))
  try {
    deepStrictEqual(parsed, APPROVED_MODEL_MANIFEST)
  } catch (error) {
    throw new Error('Model manifest does not match the approved snapshot.', { cause: error })
  }
  return parsed
}

async function requireRegularFileWithoutReparsePoint(root, relativePath) {
  const segments = relativePath.split('/')
  let current = root
  const rootMetadata = await lstat(current)
  if (rootMetadata.isSymbolicLink()) throw new Error(`Model resources contain a reparse point: ${current}`)
  if (!rootMetadata.isDirectory()) throw new Error(`Model resource root is not a directory: ${current}`)
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment)
    const metadata = await lstat(current)
    if (metadata.isSymbolicLink()) throw new Error(`Model resources contain a reparse point: ${current}`)
    if (index === segments.length - 1) {
      if (!metadata.isFile()) throw new Error(`Model resource is not a file: ${current}`)
    } else if (!metadata.isDirectory()) {
      throw new Error(`Model resource parent is not a directory: ${current}`)
    }
  }
  return current
}

async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

/** Verify the approved model manifest, license, file types, and every pinned digest. */
export async function verifyModelResources(root) {
  const manifestPath = await requireRegularFileWithoutReparsePoint(root, 'model-manifest.json')
  const manifest = await readModelManifest(manifestPath)
  await requireRegularFileWithoutReparsePoint(root, 'LICENSE')
  for (const relativePath of MODEL_RESOURCE_FILES) {
    const path = await requireRegularFileWithoutReparsePoint(root, relativePath)
    const actual = await sha256(path)
    const expected = manifest.files[relativePath]
    if (actual !== expected) {
      throw new Error(`SHA-256 mismatch for ${relativePath}: expected ${expected}, received ${actual}.`)
    }
  }
  return manifest
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  const root = process.argv[2]
  if (root === undefined) throw new Error('Usage: verify-model-resources.mjs <model-root>')
  await verifyModelResources(resolve(root))
  process.stdout.write(`verify-model-resources: verified ${resolve(root)}\n`)
}
