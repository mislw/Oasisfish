import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PORTABLE_INVENTORY_PATH,
  createPortableInventory,
  validatePortableInventory,
  verifyPortableTree,
} from '../scripts/portable-inventory.mjs'

const temporaryDirectories: string[] = []

async function temporaryRoot(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), name))
  temporaryDirectories.push(root)
  return root
}

async function write(root: string, relativePath: string, content: string): Promise<void> {
  const path = join(root, relativePath)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('portable inventory', () => {
  it('writes a deterministic product-owned inventory and verifies the unchanged tree', async () => {
    const root = await temporaryRoot('oasisfish-portable-')
    await write(root, 'z.txt', 'z')
    await write(root, 'app/a.txt', 'alpha')
    await write(root, 'resources/base.txt', 'base')

    const inventory = await createPortableInventory(root, '1.2.3')
    const disk = JSON.parse(await readFile(join(root, PORTABLE_INVENTORY_PATH), 'utf8'))

    expect(inventory).toEqual(disk)
    expect(inventory).toMatchObject({ schemaVersion: 1, product: 'Oasisfish', version: '1.2.3' })
    expect(inventory.entries.map(entry => entry.path)).toEqual([
      'app',
      'app/a.txt',
      'resources',
      'resources/base.txt',
      'z.txt',
    ])
    await expect(verifyPortableTree(root, inventory)).resolves.toEqual({ ok: true })
  })

  it.each([
    ['an absolute path', 'C:/Windows/system.ini'],
    ['a traversal path', '../outside.txt'],
    ['a backslash path', 'app\\file.txt'],
  ])('rejects %s in a persisted inventory', (_label, path) => {
    expect(() => validatePortableInventory({
      schemaVersion: 1,
      product: 'Oasisfish',
      version: '1.2.3',
      entries: [{ path, kind: 'file', size: 1, sha256: 'a'.repeat(64) }],
    })).toThrow()
  })

  it('rejects case-colliding entries', () => {
    expect(() => validatePortableInventory({
      schemaVersion: 1,
      product: 'Oasisfish',
      version: '1.2.3',
      entries: [
        { path: 'App/file.txt', kind: 'file', size: 1, sha256: 'a'.repeat(64) },
        { path: 'app/File.txt', kind: 'file', size: 1, sha256: 'b'.repeat(64) },
      ],
    })).toThrow('case-insensitive')
  })

  it.each([
    ['an unknown file', async (root: string) => write(root, 'notes.txt', 'mine')],
    ['an unknown directory', async (root: string) => mkdir(join(root, 'mine'))],
    ['a changed file', async (root: string) => write(root, 'app/a.txt', 'changed')],
  ])('preserves the tree when it contains %s', async (_label, mutate) => {
    const root = await temporaryRoot('oasisfish-portable-changed-')
    await write(root, 'app/a.txt', 'alpha')
    await write(root, 'resources/base.txt', 'base')
    const inventory = await createPortableInventory(root, '1.2.3')

    await mutate(root)

    await expect(verifyPortableTree(root, inventory)).resolves.toMatchObject({ ok: false })
  })

  it('rejects a reparse point without following it', async () => {
    const root = await temporaryRoot('oasisfish-portable-link-')
    const outside = await temporaryRoot('oasisfish-portable-outside-')
    await write(root, 'resources/base.txt', 'base')
    await write(outside, 'secret.txt', 'outside')
    await symlink(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')

    await expect(createPortableInventory(root, '1.2.3')).rejects.toThrow('reparse')
  })
})
