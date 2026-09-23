import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import { SkillCorpusId, type ResolvedSkillCorpus } from '@deepseek-ai/dsh-skill-search'

const fs = vi.hoisted(() => ({
  lstat: vi.fn(),
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
    isSymbolicLink: () => false,
    size: 1,
    mtimeMs: 1,
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
})
