import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, posix } from 'node:path'

export const PORTABLE_INVENTORY_PATH = 'resources/oasisfish-portable-inventory.json'
const SHA256 = /^[a-f0-9]{64}$/

async function sha256File(path) {
  const hash = createHash('sha256')
  await new Promise((resolve, reject) => {
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', resolve)
  })
  return hash.digest('hex')
}

function assertRelativePath(path) {
  if (typeof path !== 'string' || path.length === 0) throw new Error('Portable inventory path must be non-empty.')
  if (path.includes('\\') || posix.isAbsolute(path) || /^[a-z]:/i.test(path)) {
    throw new Error(`Portable inventory path must be relative and normalized: ${path}`)
  }
  const parts = path.split('/')
  if (parts.some(part => part.length === 0 || part === '.' || part === '..')) {
    throw new Error(`Portable inventory path contains traversal: ${path}`)
  }
  if (path === PORTABLE_INVENTORY_PATH) throw new Error('Portable inventory cannot own itself.')
}

async function collectEntries(root) {
  const entries = []
  async function visit(relativeDirectory) {
    const directory = relativeDirectory === '' ? root : join(root, ...relativeDirectory.split('/'))
    const children = await readdir(directory, { withFileTypes: true })
    children.sort((left, right) => left.name.localeCompare(right.name, 'en'))
    for (const child of children) {
      const relativePath = relativeDirectory === '' ? child.name : `${relativeDirectory}/${child.name}`
      if (relativePath === PORTABLE_INVENTORY_PATH) continue
      const absolutePath = join(root, ...relativePath.split('/'))
      const stats = await lstat(absolutePath)
      if (stats.isSymbolicLink()) throw new Error(`Portable tree contains a reparse point: ${relativePath}`)
      if (stats.isDirectory()) {
        entries.push({ path: relativePath, kind: 'directory' })
        await visit(relativePath)
        continue
      }
      if (!stats.isFile()) throw new Error(`Portable tree contains an unsupported entry: ${relativePath}`)
      entries.push({
        path: relativePath,
        kind: 'file',
        size: stats.size,
        sha256: await sha256File(absolutePath),
      })
    }
  }
  await visit('')
  entries.sort((left, right) => left.path.localeCompare(right.path, 'en'))
  return entries
}

export function validatePortableInventory(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Portable inventory must be an object.')
  }
  if (value.schemaVersion !== 1 || value.product !== 'Oasisfish') {
    throw new Error('Portable inventory identity is invalid.')
  }
  if (typeof value.version !== 'string' || value.version.length === 0) {
    throw new Error('Portable inventory version is invalid.')
  }
  if (!Array.isArray(value.entries)) throw new Error('Portable inventory entries must be an array.')
  const caseInsensitivePaths = new Set()
  let previous
  for (const entry of value.entries) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error('Portable inventory entry must be an object.')
    }
    assertRelativePath(entry.path)
    const insensitive = entry.path.toLowerCase()
    if (caseInsensitivePaths.has(insensitive)) {
      throw new Error(`Portable inventory paths collide case-insensitively: ${entry.path}`)
    }
    caseInsensitivePaths.add(insensitive)
    if (previous !== undefined && previous.localeCompare(entry.path, 'en') >= 0) {
      throw new Error('Portable inventory entries must be unique and sorted.')
    }
    previous = entry.path
    if (entry.kind === 'directory') continue
    if (entry.kind !== 'file' || !Number.isSafeInteger(entry.size) || entry.size < 0 || !SHA256.test(entry.sha256)) {
      throw new Error(`Portable inventory file metadata is invalid: ${entry.path}`)
    }
  }
  return value
}

export async function createPortableInventory(root, version) {
  const inventory = validatePortableInventory({
    schemaVersion: 1,
    product: 'Oasisfish',
    version,
    entries: await collectEntries(root),
  })
  const target = join(root, ...PORTABLE_INVENTORY_PATH.split('/'))
  const temporary = `${target}.tmp-${process.pid}`
  await mkdir(dirname(target), { recursive: true })
  await writeFile(temporary, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8')
  try {
    await rm(target, { force: true })
    await rename(temporary, target)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
  return inventory
}

export async function verifyPortableTree(root, input) {
  try {
    const inventory = validatePortableInventory(input)
    const actual = await collectEntries(root)
    if (actual.length !== inventory.entries.length) {
      return { ok: false, reason: 'Portable tree entry count changed.' }
    }
    for (let index = 0; index < actual.length; index += 1) {
      const expected = inventory.entries[index]
      const received = actual[index]
      if (JSON.stringify(received) !== JSON.stringify(expected)) {
        return { ok: false, reason: `Portable tree entry changed: ${expected.path}` }
      }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}
