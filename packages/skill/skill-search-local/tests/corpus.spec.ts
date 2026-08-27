import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ResolvedSkillCorpus } from '@deepseek-ai/dsh-skill-search'
import { discoverCorpus } from '../src/corpus.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-search-corpus-'))
  roots.push(root)
  return root
}

function corpus(root: string): ResolvedSkillCorpus {
  return {
    id: 'fixture' as ResolvedSkillCorpus['id'],
    skill: {
      name: 'fixture-skill',
      description: 'Fixture',
      invocation: { modelInvocable: true, userInvocable: true },
      source: 'test',
      provider: 'test',
      resourceBase: { kind: 'directory', path: root },
      content: 'Fixture.',
    },
    resourceBase: { kind: 'directory', path: root },
    spec: {
      skill: 'fixture-skill',
      roots: ['references'],
      extensions: ['.md', '.txt'],
      maxFileBytes: 1024,
      maxCorpusBytes: 4096,
      maxChunks: 100,
    },
  }
}

describe('discoverCorpus', () => {
  it('reads only declared roots and accepted extensions in deterministic order', async () => {
    const root = await fixtureRoot()
    await mkdir(join(root, 'references', 'nested'), { recursive: true })
    await mkdir(join(root, 'scripts'), { recursive: true })
    await writeFile(join(root, 'references', 'z.txt'), 'Z text.\n')
    await writeFile(join(root, 'references', 'nested', 'a.md'), '# A\n\nA text.\n')
    await writeFile(join(root, 'references', 'ignored.png'), 'not an image')
    await writeFile(join(root, 'scripts', 'secret.md'), 'must stay outside corpus')

    const documents = await discoverCorpus(corpus(root), new AbortController().signal)

    expect(documents.map(document => document.path)).toEqual([
      'references/nested/a.md',
      'references/z.txt',
    ])
    expect(documents.map(document => document.text)).toEqual(['# A\n\nA text.\n', 'Z text.\n'])
    expect(documents.every(document => document.sha256.length === 64)).toBe(true)
  })
})
