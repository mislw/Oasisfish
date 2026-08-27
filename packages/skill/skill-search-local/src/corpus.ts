/** Directory-backed Skill corpus discovery. */

import { createHash } from 'node:crypto'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { SkillSearchError } from '@deepseek-ai/dsh-skill-search'
import type { ResolvedSkillCorpus } from '@deepseek-ai/dsh-skill-search'

/** One decoded source document discovered beneath a declared corpus root. */
export interface DiscoveredDocument {
  readonly path: string
  readonly absolutePath: string
  readonly bytes: number
  readonly mtimeMs: number
  readonly sha256: string
  readonly text: string
}

function posixPath(path: string): string {
  return path.split(sep).join('/')
}

function isWithin(base: string, candidate: string): boolean {
  const local = relative(base, candidate)
  return local === '' || (!local.startsWith(`..${sep}`) && local !== '..' && !isAbsolute(local))
}

function sourceError(message: string, cause?: unknown): SkillSearchError {
  return new SkillSearchError('SOURCE_UNREADABLE', message, cause === undefined ? undefined : { cause })
}

function requireActive(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new SkillSearchError('ABORTED', 'Skill corpus discovery was cancelled.', { cause: signal.reason })
  }
}

async function requirePlainPath(path: string): Promise<void> {
  const metadata = await lstat(path)
  if (metadata.isSymbolicLink()) throw sourceError('Skill corpus paths cannot contain symbolic links or reparse points.')
}

/**
 * Discover and decode the files included by one directory-backed corpus.
 * @param corpus - Resolved Skill and explicit corpus declaration.
 * @param signal - Cancellation checked between filesystem operations.
 * @returns accepted documents sorted by relative path.
 */
export async function discoverCorpus(
  corpus: ResolvedSkillCorpus,
  signal: AbortSignal,
): Promise<DiscoveredDocument[]> {
  requireActive(signal)
  if (corpus.resourceBase.kind !== 'directory') {
    throw new SkillSearchError('UNSUPPORTED_RESOURCE_BASE', 'The local search provider requires directory Skill resources.')
  }

  let base: string
  try {
    await requirePlainPath(corpus.resourceBase.path)
    base = await realpath(corpus.resourceBase.path)
  } catch (error) {
    if (error instanceof SkillSearchError) throw error
    throw sourceError('The Skill resource directory cannot be read.', error)
  }

  const acceptedExtensions = new Set(corpus.spec.extensions.map(extension => extension.toLocaleLowerCase('und')))
  const documents: DiscoveredDocument[] = []
  let totalBytes = 0

  const visit = async (directory: string): Promise<void> => {
    requireActive(signal)
    await requirePlainPath(directory)
    const resolvedDirectory = await realpath(directory)
    if (!isWithin(base, resolvedDirectory)) throw sourceError('A Skill corpus directory resolves outside its resource base.')
    const entries = await readdir(resolvedDirectory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))
    for (const entry of entries) {
      requireActive(signal)
      const path = resolve(resolvedDirectory, entry.name)
      await requirePlainPath(path)
      if (entry.isDirectory()) {
        await visit(path)
        continue
      }
      if (!entry.isFile()) continue
      const extensionIndex = entry.name.lastIndexOf('.')
      const extension = extensionIndex < 0 ? '' : entry.name.slice(extensionIndex).toLocaleLowerCase('und')
      if (!acceptedExtensions.has(extension)) continue
      const resolvedFile = await realpath(path)
      if (!isWithin(base, resolvedFile)) throw sourceError('A Skill corpus file resolves outside its resource base.')
      const metadata = await lstat(resolvedFile)
      if (metadata.size > corpus.spec.maxFileBytes) {
        throw new SkillSearchError('CORPUS_LIMIT', 'A Skill corpus file exceeds maxFileBytes.')
      }
      totalBytes += metadata.size
      if (totalBytes > corpus.spec.maxCorpusBytes) {
        throw new SkillSearchError('CORPUS_LIMIT', 'The Skill corpus exceeds maxCorpusBytes.')
      }
      requireActive(signal)
      const bytes = await readFile(resolvedFile)
      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      } catch (error) {
        throw sourceError('A Skill corpus file is not valid UTF-8.', error)
      }
      documents.push({
        path: posixPath(relative(base, resolvedFile)),
        absolutePath: resolvedFile,
        bytes: bytes.byteLength,
        mtimeMs: metadata.mtimeMs,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        text,
      })
    }
  }

  try {
    for (const root of corpus.spec.roots) {
      requireActive(signal)
      if (isAbsolute(root) || root.split(/[\\/]+/u).includes('..')) {
        throw sourceError('Skill corpus roots must be relative paths without parent traversal.')
      }
      const rootPath = resolve(base, root)
      if (!isWithin(base, rootPath)) throw sourceError('A Skill corpus root resolves outside its resource base.')
      await visit(rootPath)
    }
  } catch (error) {
    if (error instanceof SkillSearchError) throw error
    throw sourceError('The Skill corpus cannot be read.', error)
  }

  documents.sort((left, right) => left.path.localeCompare(right.path, 'en'))
  return documents
}
