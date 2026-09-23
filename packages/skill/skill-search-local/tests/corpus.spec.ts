import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { SkillCorpusId, SkillSearchError, type ResolvedSkillCorpus } from '@deepseek-ai/dsh-skill-search'
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

function corpus(root: string, declaredRoots: string[] = ['references']): ResolvedSkillCorpus {
  return {
    id: SkillCorpusId('fixture'),
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
      roots: declaredRoots,
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

  it('rejects declared roots that traverse outside the loaded Skill resource base', async () => {
    const root = await fixtureRoot()
    const skillRoot = join(root, 'skill')
    await mkdir(skillRoot)
    await mkdir(join(root, 'outside'))
    await writeFile(join(root, 'outside', 'secret.md'), 'must not be read')

    await expect(discoverCorpus(corpus(skillRoot, ['../outside']), new AbortController().signal))
      .rejects.toEqual(expect.objectContaining<Partial<SkillSearchError>>({ code: 'SOURCE_UNREADABLE' }))
  })

  it('rejects reparse points before following them outside a declared root', async () => {
    const root = await fixtureRoot()
    const skillRoot = join(root, 'skill')
    const references = join(skillRoot, 'references')
    const outside = join(root, 'outside')
    await mkdir(references, { recursive: true })
    await mkdir(outside)
    await writeFile(join(outside, 'secret.md'), 'must not be read')
    await symlink(outside, join(references, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')

    await expect(discoverCorpus(corpus(skillRoot), new AbortController().signal))
      .rejects.toEqual(expect.objectContaining<Partial<SkillSearchError>>({ code: 'SOURCE_UNREADABLE' }))
  })

  it('rejects cancellation and unsupported resource kinds before filesystem access', async () => {
    const root = await fixtureRoot()
    const controller = new AbortController()
    controller.abort(new Error('cancel discovery'))
    await expect(discoverCorpus(corpus(root), controller.signal)).rejects.toMatchObject({ code: 'ABORTED' })

    const unsupported = { ...corpus(root), resourceBase: { kind: 'url', url: 'https://example.test' } } as never
    await expect(discoverCorpus(unsupported, new AbortController().signal))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_RESOURCE_BASE' })
  })

  it('reports unreadable resource directories and missing declared roots', async () => {
    const root = await fixtureRoot()
    await expect(discoverCorpus(corpus(join(root, 'missing')), new AbortController().signal))
      .rejects.toMatchObject({ code: 'SOURCE_UNREADABLE' })

    await mkdir(join(root, 'skill'))
    await expect(discoverCorpus(corpus(join(root, 'skill'), ['missing']), new AbortController().signal))
      .rejects.toMatchObject({ code: 'SOURCE_UNREADABLE' })
  })

  it('rejects a resource base that is itself a reparse point', async () => {
    const root = await fixtureRoot()
    const target = join(root, 'target')
    const linked = join(root, 'linked')
    await mkdir(target)
    await symlink(target, linked, process.platform === 'win32' ? 'junction' : 'dir')

    await expect(discoverCorpus(corpus(linked, ['']), new AbortController().signal))
      .rejects.toMatchObject({ code: 'SOURCE_UNREADABLE' })
  })

  it('rejects absolute roots, oversized files, aggregate overflow, and invalid UTF-8', async () => {
    const root = await fixtureRoot()
    await mkdir(join(root, 'references'))
    await expect(discoverCorpus(corpus(root, [resolve(root, 'references')]), new AbortController().signal))
      .rejects.toMatchObject({ code: 'SOURCE_UNREADABLE' })

    await writeFile(join(root, 'references', 'large.md'), 'x'.repeat(1025))
    await expect(discoverCorpus(corpus(root), new AbortController().signal))
      .rejects.toMatchObject({ code: 'CORPUS_LIMIT' })
    await rm(join(root, 'references', 'large.md'))

    await writeFile(join(root, 'references', 'a.md'), 'a'.repeat(700))
    await writeFile(join(root, 'references', 'b.md'), 'b'.repeat(700))
    const aggregateBase = corpus(root)
    const aggregate = { ...aggregateBase, spec: { ...aggregateBase.spec, maxCorpusBytes: 1024 } }
    await expect(discoverCorpus(aggregate, new AbortController().signal))
      .rejects.toMatchObject({ code: 'CORPUS_LIMIT' })
    await rm(join(root, 'references', 'a.md'))
    await rm(join(root, 'references', 'b.md'))

    await writeFile(join(root, 'references', 'invalid.txt'), Buffer.from([0xff]))
    await expect(discoverCorpus(corpus(root), new AbortController().signal))
      .rejects.toMatchObject({ code: 'SOURCE_UNREADABLE' })
  })

  it('supports the resource base itself as a declared root and ignores extensionless files', async () => {
    const root = await fixtureRoot()
    await writeFile(join(root, 'README'), 'ignored')
    await writeFile(join(root, 'accepted.MD'), '# Accepted\n')

    const documents = await discoverCorpus(corpus(root, ['']), new AbortController().signal)

    expect(documents.map(document => document.path)).toEqual(['accepted.MD'])
  })
})
