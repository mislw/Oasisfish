import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const inventoryModule = fileURLToPath(new URL('../scripts/staged-inventory.mjs', import.meta.url))
const resources = fileURLToPath(new URL('../resources/', import.meta.url))
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function stagedResources(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'desktop-retrieval-inventory-'))
  temporaryDirectories.push(root)
  await cp(join(resources, 'bundled-skills', 'oasis-wiki'), join(root, 'bundled-skills', 'oasis-wiki'), { recursive: true })
  await cp(
    join(resources, 'bundled-skills', 'ai-image-prompts'),
    join(root, 'bundled-skills', 'ai-image-prompts'),
    { recursive: true },
  )
  await cp(
    join(resources, 'bundled-models', 'bge-small-zh-v1.5'),
    join(root, 'models', 'bge-small-zh-v1.5'),
    { recursive: true },
  )
  return root
}

describe('Desktop retrieval resource inventory', () => {
  it('declares the exact approved path and digest inventory', async () => {
    const module = await import('../scripts/staged-inventory.mjs')
    expect(module.RETRIEVAL_APPROVED_FILES.length).toBeGreaterThan(100)
    expect(module.RETRIEVAL_APPROVED_FILES).toContainEqual({
      path: 'models/bge-small-zh-v1.5/LICENSE',
      sha256: '8e318bf1245d801ffe93917d1674a039ae947b206bdba0b73b271190c5ef1f58',
    })
  })

  it('accepts the complete approved staged resources', async () => {
    const { verifyStagedRetrievalResources } = await import('../scripts/staged-inventory.mjs')
    await expect(verifyStagedRetrievalResources(await stagedResources())).resolves.toBeUndefined()
  })

  it.each([
    ['missing', async (root: string) => {
      await rm(join(root, 'bundled-skills', 'oasis-wiki', 'references', 'code-style.md'))
    }],
    ['modified', async (root: string) => {
      await writeFile(join(root, 'bundled-skills', 'oasis-wiki', 'references', 'code-style.md'), 'modified\n')
    }],
    ['extra', async (root: string) => {
      await writeFile(join(root, 'bundled-skills', 'ai-image-prompts', 'references', 'extra.md'), 'extra\n')
    }],
    ['directory-substituted', async (root: string) => {
      const path = join(root, 'bundled-skills', 'ai-image-prompts', 'LICENSE')
      await rm(path)
      await mkdir(path)
    }],
  ])('rejects %s entries in an owned retrieval tree', async (_name, mutate) => {
    const { verifyStagedRetrievalResources } = await import('../scripts/staged-inventory.mjs')
    const root = await stagedResources()
    await mutate(root)
    await expect(verifyStagedRetrievalResources(root)).rejects.toThrow('retrieval inventory')
  })

  it('rejects linked files in an owned retrieval tree', async () => {
    const { verifyStagedRetrievalResources } = await import('../scripts/staged-inventory.mjs')
    const root = await stagedResources()
    const path = join(root, 'bundled-skills', 'ai-image-prompts', 'LICENSE')
    const outside = join(root, 'outside-license')
    await writeFile(outside, await readFile(path))
    await rm(path)
    await symlink(outside, path, 'file')

    await expect(verifyStagedRetrievalResources(root)).rejects.toThrow('filesystem link')
  })

  it('rejects linked parent directories in an owned retrieval tree', async () => {
    const { verifyStagedRetrievalResources } = await import('../scripts/staged-inventory.mjs')
    const root = await stagedResources()
    const path = join(root, 'bundled-skills', 'ai-image-prompts', 'references')
    const outside = join(root, 'outside-references')
    await cp(path, outside, { recursive: true })
    await rm(path, { recursive: true })
    await symlink(outside, path, process.platform === 'win32' ? 'junction' : 'dir')

    await expect(verifyStagedRetrievalResources(root)).rejects.toThrow('filesystem link')
  })

  it('keeps the inventory module in the prepared Desktop source tree', async () => {
    await expect(readFile(inventoryModule, 'utf8')).resolves.toContain('verifyStagedRetrievalResources')
    await expect(readFile(join(dirname(inventoryModule), 'staged-inventory.d.mts'), 'utf8'))
      .resolves.toContain('RETRIEVAL_APPROVED_FILES')
  })
})
