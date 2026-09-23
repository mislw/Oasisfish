import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import { SkillCorpusId, type ResolvedSkillCorpus } from '@deepseek-ai/dsh-skill-search'

const fs = vi.hoisted(() => ({
  lstat: vi.fn(),
  open: vi.fn(),
  readdir: vi.fn(),
  realpath: vi.fn(),
}))

vi.mock('node:fs/promises', () => fs)

import { discoverCorpus } from '../src/corpus.ts'

const base = resolve('C:\\fixture-skill')

function corpus(): ResolvedSkillCorpus {
  return {
    id: SkillCorpusId('fixture'),
    skill: {
      name: 'fixture-skill',
      description: 'Fixture',
      invocation: { modelInvocable: true, userInvocable: true },
      source: 'test',
      provider: 'test',
      resourceBase: { kind: 'directory', path: base },
      content: 'Fixture.',
    },
    resourceBase: { kind: 'directory', path: base },
    spec: {
      skill: 'fixture-skill',
      roots: ['references'],
      extensions: ['.md'],
      maxFileBytes: 1024,
      maxCorpusBytes: 4096,
      maxChunks: 100,
    },
  }
}

function entry(name: string, kind: 'directory' | 'file' | 'other') {
  return {
    name,
    isDirectory: () => kind === 'directory',
    isFile: () => kind === 'file',
  }
}

function readFrom(content: () => Buffer) {
  return vi.fn(async (buffer: Buffer, offset: number, length: number, position: number) => {
    const source = content()
    const bytesRead = Math.min(length, Math.max(0, source.byteLength - position))
    source.copy(buffer, offset, position, position + bytesRead)
    return { buffer, bytesRead }
  })
}

beforeEach(() => {
  fs.lstat.mockReset().mockResolvedValue({
    dev: 1,
    ino: 1,
    isFile: () => true,
    isSymbolicLink: () => false,
    size: 1,
    mtimeMs: 1,
  })
  fs.open.mockReset().mockResolvedValue({
    close: () => Promise.resolve(),
    read: readFrom(() => Buffer.from('text')),
    readFile: () => Promise.resolve(Buffer.from('text')),
    stat: () => Promise.resolve({ dev: 1, ino: 1, isFile: () => true, size: 4, mtimeMs: 1 }),
  })
  fs.readdir.mockReset()
  fs.realpath.mockReset().mockImplementation(async (path: string) => path)
})

describe('discoverCorpus filesystem boundaries', () => {
  it('ignores directory entries that are neither files nor directories', async () => {
    fs.readdir.mockResolvedValue([entry('socket', 'other')])

    await expect(discoverCorpus(corpus(), new AbortController().signal)).resolves.toEqual([])
  })

  it('rejects a directory that resolves outside the checked resource base', async () => {
    fs.readdir.mockResolvedValueOnce([entry('child', 'directory')])
    fs.realpath.mockImplementation(async (path: string) => path.endsWith('child') ? resolve('C:\\outside') : path)

    await expect(discoverCorpus(corpus(), new AbortController().signal)).rejects.toMatchObject({ code: 'SOURCE_UNREADABLE' })
  })

  it('rejects a file that resolves outside the checked resource base', async () => {
    fs.readdir.mockResolvedValueOnce([entry('escaped.md', 'file')])
    fs.realpath.mockImplementation(async (path: string) => path.endsWith('escaped.md') ? resolve('C:\\outside.md') : path)

    await expect(discoverCorpus(corpus(), new AbortController().signal)).rejects.toMatchObject({ code: 'SOURCE_UNREADABLE' })
  })

  it('bounds reads of an initially oversized file and returns the file limit error', async () => {
    const content = Buffer.alloc(2048)
    const read = readFrom(() => content)
    const readFile = vi.fn(async () => content)
    fs.readdir.mockResolvedValueOnce([entry('oversized.md', 'file')])
    fs.open.mockResolvedValue({
      close: () => Promise.resolve(),
      read,
      readFile,
      stat: () => Promise.resolve({ dev: 1, ino: 1, isFile: () => true, size: content.byteLength, mtimeMs: 1 }),
    })

    await expect(discoverCorpus(corpus(), new AbortController().signal))
      .rejects.toMatchObject({ code: 'CORPUS_LIMIT', message: 'A Skill corpus file exceeds maxFileBytes.' })
    expect(readFile).not.toHaveBeenCalled()
    expect(read).toHaveBeenCalledTimes(1)
    expect(read.mock.calls[0]?.slice(1)).toEqual([0, 1025, 0])
  })

  it('bounds a file that grows during its read and returns the stable file limit error', async () => {
    const started = Promise.withResolvers<undefined>()
    const release = Promise.withResolvers<undefined>()
    let content = Buffer.alloc(512)
    const boundedRead = readFrom(() => content)
    const read = vi.fn(async (buffer: Buffer, offset: number, length: number, position: number) => {
      started.resolve(undefined)
      await release.promise
      return boundedRead(buffer, offset, length, position)
    })
    const readFile = vi.fn(async () => {
      started.resolve(undefined)
      await release.promise
      return content
    })
    fs.readdir.mockResolvedValueOnce([entry('growing.md', 'file')])
    fs.open.mockResolvedValue({
      close: () => Promise.resolve(),
      read,
      readFile,
      stat: () => Promise.resolve({ dev: 1, ino: 1, isFile: () => true, size: content.byteLength, mtimeMs: 1 }),
    })

    const discovery = discoverCorpus(corpus(), new AbortController().signal)
    await started.promise
    content = Buffer.alloc(2048)
    release.resolve(undefined)

    await expect(discovery)
      .rejects.toMatchObject({ code: 'CORPUS_LIMIT', message: 'A Skill corpus file exceeds maxFileBytes.' })
    expect(readFile).not.toHaveBeenCalled()
    expect(read).toHaveBeenCalledTimes(1)
    expect(read.mock.calls[0]?.slice(1)).toEqual([0, 1025, 0])
  })

  it('rejects a file entry that stops being a regular file before open', async () => {
    fs.readdir.mockResolvedValueOnce([entry('changed.md', 'file')])
    let fileStats = 0
    fs.lstat.mockImplementation(async (path: string) => {
      if (!path.endsWith('changed.md')) {
        return { dev: 1, ino: 1, isFile: () => true, isSymbolicLink: () => false, size: 0, mtimeMs: 1 }
      }
      fileStats += 1
      return {
        dev: 1,
        ino: 2,
        isFile: () => fileStats === 1,
        isSymbolicLink: () => false,
        size: 4,
        mtimeMs: 1,
      }
    })

    await expect(discoverCorpus(corpus(), new AbortController().signal))
      .rejects.toMatchObject({ code: 'SOURCE_UNREADABLE' })
  })

  it('rejects a different file opened after the path check', async () => {
    fs.readdir.mockResolvedValueOnce([entry('swapped.md', 'file')])
    fs.open.mockResolvedValue({
      close: () => Promise.resolve(),
      read: readFrom(() => Buffer.from('text')),
      readFile: () => Promise.resolve(Buffer.from('text')),
      stat: () => Promise.resolve({ dev: 1, ino: 2, isFile: () => true, size: 4, mtimeMs: 1 }),
    })

    await expect(discoverCorpus(corpus(), new AbortController().signal))
      .rejects.toMatchObject({ code: 'SOURCE_UNREADABLE' })
  })

  it('rejects a path replaced after its file handle is opened', async () => {
    fs.readdir.mockResolvedValueOnce([entry('replaced.md', 'file')])
    let fileStats = 0
    fs.lstat.mockImplementation(async (path: string) => {
      if (!path.endsWith('replaced.md')) {
        return { dev: 1, ino: 1, isFile: () => false, isSymbolicLink: () => false, size: 0, mtimeMs: 1 }
      }
      fileStats += 1
      return {
        dev: 1,
        ino: fileStats < 3 ? 2 : 3,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 4,
        mtimeMs: 1,
      }
    })
    fs.open.mockResolvedValue({
      close: () => Promise.resolve(),
      read: readFrom(() => Buffer.from('text')),
      readFile: () => Promise.resolve(Buffer.from('text')),
      stat: () => Promise.resolve({ dev: 1, ino: 2, isFile: () => true, size: 4, mtimeMs: 1 }),
    })

    await expect(discoverCorpus(corpus(), new AbortController().signal))
      .rejects.toMatchObject({ code: 'SOURCE_UNREADABLE' })
  })
})
