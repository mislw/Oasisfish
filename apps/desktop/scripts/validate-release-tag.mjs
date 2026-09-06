import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Require a Git tag that names exactly the desktop package version. */
export function validateReleaseTag(tag, version) {
  const expected = `v${version}`
  if (tag !== expected) {
    throw new Error(`Oasisfish release tag must equal ${expected}; received ${tag || '<empty>'}.`)
  }
  return tag
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const tag = validateReleaseTag(process.argv[2] ?? '', process.argv[3] ?? '')
    process.stdout.write(`${tag}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
