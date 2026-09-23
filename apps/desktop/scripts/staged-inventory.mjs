import { createHash } from 'node:crypto'
import { createReadStream, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inspectRegularTree } from './regular-tree.mjs'

const OWNED_ROOTS = Object.freeze([
  'bundled-skills/oasis-wiki',
  'bundled-skills/ai-image-prompts',
  'models/bge-small-zh-v1.5',
])

function approvedInventory() {
  const parsed = JSON.parse(readFileSync(new URL('../resources/retrieval-inventory.json', import.meta.url), 'utf8'))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)
    || parsed.schemaVersion !== 1 || !Array.isArray(parsed.files)) {
    throw new Error('Desktop retrieval inventory manifest is invalid')
  }
  const paths = new Set()
  return parsed.files.map((entry) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)
      || typeof entry.path !== 'string' || entry.path.startsWith('/') || entry.path.includes('\\')
      || entry.path.split('/').some(segment => segment === '' || segment === '.' || segment === '..')
      || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(entry.sha256)
      || paths.has(entry.path)) {
      throw new Error('Desktop retrieval inventory manifest contains an invalid file record')
    }
    paths.add(entry.path)
    return Object.freeze({ path: entry.path, sha256: entry.sha256 })
  })
}

/** Exact immutable files approved for Desktop Skill retrieval. */
export const RETRIEVAL_APPROVED_FILES = Object.freeze(approvedInventory())

function approvedDirectories() {
  const directories = new Set(OWNED_ROOTS)
  for (const file of RETRIEVAL_APPROVED_FILES) {
    const segments = file.path.split('/')
    segments.pop()
    while (segments.length > 0) {
      directories.add(segments.join('/'))
      segments.pop()
    }
  }
  return directories
}

async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

/** Reject staged Desktop retrieval roots that differ from the approved regular-file inventory. */
export async function verifyStagedRetrievalResources(root) {
  const actualFiles = new Map()
  const actualDirectories = new Set()
  for (const ownedRoot of OWNED_ROOTS) {
    let tree
    try {
      tree = await inspectRegularTree(join(root, ownedRoot))
    } catch (error) {
      if (error?.code === 'ENOENT') continue
      throw error
    }
    actualDirectories.add(ownedRoot)
    for (const directory of tree.directories) actualDirectories.add(`${ownedRoot}/${directory}`)
    for (const file of tree.files) actualFiles.set(`${ownedRoot}/${file.path}`, file.absolutePath)
  }

  const approvedFiles = new Map(RETRIEVAL_APPROVED_FILES.map(file => [file.path, file.sha256]))
  const allowedDirectories = approvedDirectories()
  const missing = [...approvedFiles.keys()].filter(path => !actualFiles.has(path))
  const extraFiles = [...actualFiles.keys()].filter(path => !approvedFiles.has(path))
  const extraDirectories = [...actualDirectories].filter(path => !allowedDirectories.has(path))
  const modified = []
  for (const [path, absolutePath] of actualFiles) {
    const expected = approvedFiles.get(path)
    if (expected !== undefined && await sha256(absolutePath) !== expected) modified.push(path)
  }
  if (missing.length > 0 || extraFiles.length > 0 || extraDirectories.length > 0 || modified.length > 0) {
    const lines = [
      ...missing.sort().map(path => `- missing file: ${path}`),
      ...extraFiles.sort().map(path => `- extra file: ${path}`),
      ...extraDirectories.sort().map(path => `- extra directory: ${path}`),
      ...modified.sort().map(path => `- modified file: ${path}`),
    ]
    throw new Error(`Desktop retrieval inventory mismatch:\n${lines.join('\n')}`)
  }
}
