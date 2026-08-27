import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { chunkDocument } from '../src/chunk.ts'
import type { DiscoveredDocument } from '../src/corpus.ts'
import {
  SKILL_SEARCH_SCHEMA_VERSION,
  openSkillSearchStore,
  type IndexedSourceDocument,
  type SkillSearchModelIdentity,
} from '../src/store.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

function source(path: string, text: string, sha = text): IndexedSourceDocument {
  const document: DiscoveredDocument = {
    path,
    absolutePath: `C:\\fixture\\${path.replaceAll('/', '\\')}`,
    bytes: Buffer.byteLength(text),
    mtimeMs: 1,
    sha256: Buffer.from(sha).toString('hex').padEnd(64, '0').slice(0, 64),
    text,
  }
  return {
    document,
    chunks: chunkDocument(document, {
      targetCodePoints: 800,
      maxCodePoints: 1200,
      overlapCodePoints: 120,
    }),
  }
}

const model: SkillSearchModelIdentity = {
  id: 'fixture-embedder',
  revision: '1',
  dimensions: 2,
}

function embed(texts: readonly string[]): Promise<Float32Array[]> {
  return Promise.resolve(texts.map((_, index) => index % 2 === 0
    ? Float32Array.of(1, 0)
    : Float32Array.of(0, 1)))
}

describe('SkillSearchStore', () => {
  it('creates the schema and transactionally stores FTS rows and little-endian vectors', async () => {
    const store = await openSkillSearchStore(':memory:')
    const result = await store.refresh({
      corpusKey: 'fixture',
      model,
      documents: [source('references/respawn.md', '# 复活\n\n角色可以复活。\n')],
    }, embed, new AbortController().signal)

    expect(result).toEqual({ revision: 1, changedDocuments: 1, removedDocuments: 0 })
    expect(store.modelIdentity('fixture')).toEqual(model)
    expect(store.lexicalCandidates('fixture', '复活', 5)[0]).toMatchObject({
      path: 'references/respawn.md',
      startLine: 3,
    })
    expect(store.vectorRows('fixture')[0]?.vector).toEqual(Float32Array.of(1, 0))
    await store.close()
  })

  it('reuses unchanged documents without invoking the embedder again', async () => {
    const store = await openSkillSearchStore(':memory:')
    const documents = [source('references/a.md', '# A\n\n内容。\n')]
    await store.refresh({ corpusKey: 'fixture', model, documents }, embed, new AbortController().signal)
    let calls = 0
    const result = await store.refresh({ corpusKey: 'fixture', model, documents }, async (texts) => {
      calls += texts.length
      return await embed(texts)
    }, new AbortController().signal)

    expect(calls).toBe(0)
    expect(result).toEqual({ revision: 1, changedDocuments: 0, removedDocuments: 0 })
    await store.close()
  })

  it('preserves the last complete revision when changed-document embedding fails', async () => {
    const store = await openSkillSearchStore(':memory:')
    await store.refresh({
      corpusKey: 'fixture',
      model,
      documents: [source('references/a.md', '# A\n\n火龙。\n', 'old')],
    }, embed, new AbortController().signal)

    await expect(store.refresh({
      corpusKey: 'fixture',
      model,
      documents: [source('references/a.md', '# A\n\n冰凤。\n', 'new')],
    }, () => Promise.reject(new Error('embedding failed')), new AbortController().signal))
      .rejects.toThrow('embedding failed')

    expect(store.lexicalCandidates('fixture', '火龙', 5)).toHaveLength(1)
    expect(store.lexicalCandidates('fixture', '冰凤', 5)).toHaveLength(0)
    expect(store.corpusRevision('fixture')).toBe(1)
    await store.close()
  })

  it('removes documents and rejects incompatible schema versions', async () => {
    const store = await openSkillSearchStore(':memory:')
    await store.refresh({
      corpusKey: 'fixture',
      model,
      documents: [
        source('references/a.md', '# A\n\n保留。\n'),
        source('references/b.md', '# B\n\n删除。\n'),
      ],
    }, embed, new AbortController().signal)
    const result = await store.refresh({
      corpusKey: 'fixture',
      model,
      documents: [source('references/a.md', '# A\n\n保留。\n')],
    }, embed, new AbortController().signal)
    expect(result.removedDocuments).toBe(1)
    expect(store.lexicalCandidates('fixture', '删除', 5)).toHaveLength(0)
    await store.close()

    const root = await mkdtemp(join(tmpdir(), 'dsh-skill-search-store-'))
    roots.push(root)
    const path = join(root, 'index.sqlite')
    const incompatible = new DatabaseSync(path)
    incompatible.exec(`PRAGMA user_version = ${String(SKILL_SEARCH_SCHEMA_VERSION + 1)}`)
    incompatible.close()
    await expect(openSkillSearchStore(path)).rejects.toThrow('schema version')
  })
})
