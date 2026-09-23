import { lstat, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/** Enumerate one ordinary directory tree without following filesystem links. */
export async function inspectRegularTree(root) {
  const files = []
  const directories = []

  async function visit(absolutePath, relativePath) {
    const metadata = await lstat(absolutePath)
    if (metadata.isSymbolicLink()) {
      throw new Error(`Desktop resource tree contains a filesystem link: ${absolutePath}`)
    }
    if (metadata.isFile()) {
      files.push({ path: relativePath, absolutePath })
      return
    }
    if (!metadata.isDirectory()) {
      throw new Error(`Desktop resource tree contains a non-regular entry: ${absolutePath}`)
    }
    if (relativePath !== '') directories.push(relativePath)
    for (const name of (await readdir(absolutePath)).sort()) {
      await visit(join(absolutePath, name), relativePath === '' ? name : `${relativePath}/${name}`)
    }
  }

  await visit(root, '')
  return { files, directories }
}
