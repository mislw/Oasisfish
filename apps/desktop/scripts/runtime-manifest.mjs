import { isAbsolute, normalize, sep } from 'node:path'
import { readFile } from 'node:fs/promises'

export const REQUIRED_RUNTIME_NAMES = Object.freeze([
  'node',
  'pnpm',
  'python',
  'get-pip',
  'pip-wheel',
  'git',
  'powershell',
  'ripgrep',
  'fd',
  'jq',
  'sevenzip-extractor',
  'sevenzip',
])

const formats = new Set(['file', 'zip', 'self-extracting-7z', 'sevenzip'])

function requireRecord(value, location) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${location} must be an object.`)
  }
  return value
}

function requireString(record, key, location) {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${location}.${key} must be a non-empty string.`)
  }
  return value
}

function requireRelativePath(value, location) {
  const normalized = normalize(value)
  if (isAbsolute(value) || normalized === '..' || normalized.startsWith(`..${sep}`)) {
    throw new Error(`${location} must stay inside the runtime staging directory.`)
  }
  return normalized
}

function validateArtifact(value, index) {
  const location = `artifacts[${index}]`
  const artifact = requireRecord(value, location)
  const name = requireString(artifact, 'name', location)
  const version = requireString(artifact, 'version', location)
  const url = requireString(artifact, 'url', location)
  const sha256 = requireString(artifact, 'sha256', location)
  const format = requireString(artifact, 'format', location)
  const destination = requireRelativePath(requireString(artifact, 'destination', location), `${location}.destination`)
  const stripComponents = artifact.stripComponents ?? 0
  if (!Number.isInteger(stripComponents) || stripComponents < 0 || stripComponents > 1) {
    throw new Error(`${location}.stripComponents must be 0 or 1.`)
  }
  const fileName = artifact.fileName === undefined
    ? undefined
    : requireRelativePath(requireString(artifact, 'fileName', location), `${location}.fileName`)
  let parsedUrl
  try {
    parsedUrl = new URL(url)
  } catch (error) {
    throw new Error(`${location}.url is not a valid URL.`, { cause: error })
  }
  if (parsedUrl.protocol !== 'https:') throw new Error(`${location}.url must use HTTPS.`)
  if (!/^[a-f0-9]{64}$/u.test(sha256)) throw new Error(`${location}.sha256 must be a lowercase SHA-256 digest.`)
  if (!formats.has(format)) throw new Error(`${location}.format is unsupported: ${format}.`)
  if (!Array.isArray(artifact.requiredFiles) || artifact.requiredFiles.length === 0) {
    throw new Error(`${location}.requiredFiles must be a non-empty array.`)
  }
  const requiredFiles = artifact.requiredFiles.map((file, fileIndex) => {
    if (typeof file !== 'string' || file.length === 0) {
      throw new Error(`${location}.requiredFiles[${fileIndex}] must be a non-empty string.`)
    }
    return requireRelativePath(file, `${location}.requiredFiles[${fileIndex}]`)
  })
  return { name, version, url, sha256, format, destination, requiredFiles, stripComponents, fileName }
}

/** Validate and normalize the checked-in portable runtime manifest. */
export function validateRuntimeManifest(value) {
  const manifest = requireRecord(value, 'manifest')
  if (manifest.schemaVersion !== 1) throw new Error('manifest.schemaVersion must be 1.')
  if (manifest.platform !== 'win32-x64') throw new Error('manifest.platform must be win32-x64.')
  if (!Array.isArray(manifest.artifacts)) throw new Error('manifest.artifacts must be an array.')
  const artifacts = manifest.artifacts.map(validateArtifact)
  const names = new Set()
  const destinations = new Set()
  for (const artifact of artifacts) {
    if (names.has(artifact.name)) throw new Error(`Duplicate runtime artifact name: ${artifact.name}.`)
    if (destinations.has(artifact.destination)) throw new Error(`Duplicate runtime artifact destination: ${artifact.destination}.`)
    names.add(artifact.name)
    destinations.add(artifact.destination)
  }
  for (const name of REQUIRED_RUNTIME_NAMES) {
    if (!names.has(name)) throw new Error(`Required runtime artifact is missing: ${name}.`)
  }
  return { schemaVersion: 1, platform: 'win32-x64', artifacts }
}

/** Read and validate a runtime manifest from disk. */
export async function readRuntimeManifest(path) {
  return validateRuntimeManifest(JSON.parse(await readFile(path, 'utf8')))
}
