import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Derive Windows-safe metadata from one canonical Oasisfish release version. */
export function windowsVersionFor(version) {
  const match = /^(\d+)\.(\d{4})(\d{2})(\d{2})\.(\d+)$/.exec(version)
  if (match === null) {
    throw new Error(`Oasisfish version must use V.YYYYMMDD.T; received ${version || '<empty>'}.`)
  }
  const [, major, year, month, day, revision] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() + 1 !== Number(month)
    || date.getUTCDate() !== Number(day)
    || Number(major) < 1
    || Number(revision) < 1) {
    throw new Error(`Oasisfish version must contain a valid date and positive major/revision; received ${version}.`)
  }
  return `${Number(major)}.${year}.${Number(`${month}${day}`)}.${Number(revision)}`
}

/** Require package metadata to preserve the canonical version and its Windows mapping. */
export function validateDesktopReleaseVersion(version, shortVersion, shortVersionWindows) {
  const expectedWindows = windowsVersionFor(version)
  if (shortVersion !== expectedWindows || shortVersionWindows !== expectedWindows) {
    throw new Error(`Oasisfish ${version} requires shortVersion and shortVersionWindows ${expectedWindows}.`)
  }
  return version
}

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
    const version = validateDesktopReleaseVersion(
      process.argv[3] ?? '',
      process.argv[4] ?? '',
      process.argv[5] ?? '',
    )
    const tag = validateReleaseTag(process.argv[2] ?? '', version)
    process.stdout.write(`${tag}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
