import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const inventoryModule = fileURLToPath(new URL('../scripts/staged-inventory.mjs', import.meta.url))
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('Desktop retrieval resource inventory', () => {
  it('exists and declares every immutable packaged retrieval resource', async () => {
    await expect(access(inventoryModule)).resolves.toBeUndefined()
    const { RETRIEVAL_REQUIRED_FILES } = await import('../scripts/staged-inventory.mjs')
    expect(RETRIEVAL_REQUIRED_FILES).toEqual(expect.arrayContaining([
      'bundled-skills/oasis-wiki/SKILL.md',
      'bundled-skills/oasis-wiki/VERSION',
      'bundled-skills/ai-image-prompts/SKILL.md',
      'bundled-skills/ai-image-prompts/LICENSE',
      'bundled-skills/ai-image-prompts/references/visual-recipes.md',
      'models/bge-small-zh-v1.5/model-manifest.json',
      'models/bge-small-zh-v1.5/LICENSE',
      'models/bge-small-zh-v1.5/config.json',
      'models/bge-small-zh-v1.5/onnx/model_quantized.onnx',
      'models/bge-small-zh-v1.5/special_tokens_map.json',
      'models/bge-small-zh-v1.5/tokenizer_config.json',
      'models/bge-small-zh-v1.5/tokenizer.json',
      'models/bge-small-zh-v1.5/vocab.txt',
    ]))
  })

  it('reports every missing retrieval resource and accepts a complete staged root', async () => {
    const { RETRIEVAL_REQUIRED_FILES, verifyStagedRetrievalResources } = await import('../scripts/staged-inventory.mjs')
    const root = await mkdtemp(join(tmpdir(), 'desktop-retrieval-inventory-'))
    temporaryDirectories.push(root)
    await expect(verifyStagedRetrievalResources(root)).rejects.toThrow(RETRIEVAL_REQUIRED_FILES[0])
    for (const relativePath of RETRIEVAL_REQUIRED_FILES) {
      const path = join(root, relativePath)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, 'fixture')
    }
    await expect(verifyStagedRetrievalResources(root)).resolves.toBeUndefined()
  })
})
