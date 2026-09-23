import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import { SkillCorpusId, type ResolvedSkillCorpus } from '@deepseek-ai/dsh-skill-search'

const fs = vi.hoisted(() => ({
  lstat: vi.fn(),
  open: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
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
    readFile: () => Promise.resolve(Buffer.from('text')),
    stat: () => Promise.resolve({ dev: 1, ino: 1, isFile: () => true, size: 4, mtimeMs: 1 }),
  })
  fs.readdir.mockReset()
  fs.readFile.mockReset().mockResolvedValue(Buffer.from('text'))
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

  it('enforces file bounds against the bytes read from the opened handle', async () => {
    fs.readdir.mockResolvedValueOnce([entry('growing.md', 'file')])
    fs.readFile.mockResolvedValue(Buffer.alloc(1025))
    fs.open.mockResolvedValue({
      close: () => Promise.resolve(),
      readFile: () => Promise.resolve(Buffer.alloc(1025)),
      stat: () => Promise.resolve({ dev: 1, ino: 1, isFile: () => true, size: 1025, mtimeMs: 1 }),
    })

    await expect(discoverCorpus(corpus(), new AbortController().signal))
      .rejects.toMatchObject({ code: 'CORPUS_LIMIT' })
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
      readFile: () => Promise.resolve(Buffer.from('text')),
      stat: () => Promise.resolve({ dev: 1, ino: 2, isFile: () => true, size: 4, mtimeMs: 1 }),
    })

    await expect(discoverCorpus(corpus(), new AbortController().signal))
      .rejects.toMatchObject({ code: 'SOURCE_UNREADABLE' })
  })
})
