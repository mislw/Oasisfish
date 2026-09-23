import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { chunkDocument } from '../src/chunk.ts'
import type { DiscoveredDocument } from '../src/corpus.ts'
import { openDatabase } from '../src/schema.ts'
import {
  SKILL_SEARCH_SCHEMA_VERSION,
  SkillSearchStore,
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

  it('preserves the last complete revision when cancellation arrives before commit', async () => {
    const store = await openSkillSearchStore(':memory:')
    await store.refresh({
      corpusKey: 'fixture',
      model,
      documents: [source('references/a.md', '# A\n\n火龙。\n', 'old')],
    }, embed, new AbortController().signal)
    const controller = new AbortController()

    await expect(store.refresh({
      corpusKey: 'fixture',
      model,
      documents: [source('references/a.md', '# A\n\n冰凤。\n', 'new')],
    }, async (texts) => {
      const vectors = await embed(texts)
      controller.abort(new Error('cancel before commit'))
      return vectors
    }, controller.signal)).rejects.toThrow('cancel before commit')

    expect(store.lexicalCandidates('fixture', '火龙', 5)).toHaveLength(1)
    expect(store.lexicalCandidates('fixture', '冰凤', 5)).toHaveLength(0)
    expect(store.corpusRevision('fixture')).toBe(1)
    await store.close()
  })

  it('rebuilds cached documents when the embedding identity changes', async () => {
    const store = await openSkillSearchStore(':memory:')
    const documents = [source('references/a.md', '# A\n\n内容。\n')]
    await store.refresh({ corpusKey: 'fixture', model, documents }, embed, new AbortController().signal)
    const replacement = { ...model, revision: '2' }
    let embedded = 0

    const result = await store.refresh({ corpusKey: 'fixture', model: replacement, documents }, async (texts) => {
      embedded += texts.length
      return await embed(texts)
    }, new AbortController().signal)

    expect(embedded).toBeGreaterThan(0)
    expect(result).toEqual({ revision: 2, changedDocuments: 1, removedDocuments: 0 })
    expect(store.modelIdentity('fixture')).toEqual(replacement)
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

  it('reports empty state and accepts a plain-text chunk without headings', async () => {
    const store = await openSkillSearchStore(':memory:')
    expect(store.corpusRevision('missing')).toBe(0)
    expect(store.modelIdentity('missing')).toBeUndefined()
    expect(store.lexicalCandidates('missing', ' !!! ', 5)).toEqual([])

    await store.refresh({
      corpusKey: 'fixture',
      model,
      documents: [source('references/plain.txt', 'plain text\n')],
    }, embed, new AbortController().signal)
    expect(store.vectorRows('fixture')).toHaveLength(1)
    await store.close()
    await store.close()
    await expect(store.refresh({ corpusKey: 'fixture', model, documents: [] }, embed, new AbortController().signal))
      .rejects.toThrow('closed')
  })

  it.each([
    [async () => [Float32Array.of(1, 0), Float32Array.of(0, 1)], 'different vector count'],
    [async () => [Float32Array.of(1)], 'dimensions do not match'],
    [async () => [Float32Array.of(Number.NaN, 1)], 'non-finite'],
  ])('rejects invalid embedder output before publishing a revision', async (invalidEmbed, message) => {
    const store = await openSkillSearchStore(':memory:')
    await expect(store.refresh({
      corpusKey: 'fixture',
      model,
      documents: [source('references/a.md', '# A\n\ntext\n')],
    }, invalidEmbed, new AbortController().signal)).rejects.toThrow(message)
    expect(store.corpusRevision('fixture')).toBe(0)
    await store.close()
  })

  it('continues a corpus queue after a failed refresh', async () => {
    const store = await openSkillSearchStore(':memory:')
    const request = {
      corpusKey: 'fixture',
      model,
      documents: [source('references/a.md', '# A\n\ntext\n')],
    }
    await expect(store.refresh(request, () => Promise.reject(new Error('first failed')), new AbortController().signal))
      .rejects.toThrow('first failed')
    await expect(store.refresh(request, embed, new AbortController().signal))
      .resolves.toMatchObject({ revision: 1 })
    await store.close()
  })

  it('serializes overlapping refreshes and retains only the newest queue entry', async () => {
    const store = await openSkillSearchStore(':memory:')
    let release!: () => void
    const blocked = new Promise<void>((resolve) => { release = resolve })
    let started!: () => void
    const firstStarted = new Promise<void>((resolve) => { started = resolve })
    const first = store.refresh({
      corpusKey: 'fixture',
      model,
      documents: [source('references/a.md', '# A\n\nfirst\n', 'first')],
    }, async (texts) => {
      started()
      await blocked
      return await embed(texts)
    }, new AbortController().signal)
    await firstStarted
    const second = store.refresh({
      corpusKey: 'fixture',
      model,
      documents: [source('references/a.md', '# A\n\nsecond\n', 'second')],
    }, embed, new AbortController().signal)
    release()

    await expect(Promise.all([first, second])).resolves.toEqual([
      { revision: 1, changedDocuments: 1, removedDocuments: 0 },
      { revision: 2, changedDocuments: 1, removedDocuments: 0 },
    ])
    await store.close()
  })

  it('runs a queued refresh after the active refresh rejects', async () => {
    const store = await openSkillSearchStore(':memory:')
    let release!: () => void
    const blocked = new Promise<void>((resolve) => { release = resolve })
    let started!: () => void
    const firstStarted = new Promise<void>((resolve) => { started = resolve })
    const request = {
      corpusKey: 'fixture',
      model,
      documents: [source('references/a.md', '# A\n\ntext\n')],
    }
    const first = store.refresh(request, async () => {
      started()
      await blocked
      throw new Error('active refresh failed')
    }, new AbortController().signal)
    await firstStarted
    const second = store.refresh(request, embed, new AbortController().signal)
    release()

    await expect(first).rejects.toThrow('active refresh failed')
    await expect(second).resolves.toEqual({ revision: 1, changedDocuments: 1, removedDocuments: 0 })
    await store.close()
  })

  it('rolls back a transaction that violates chunk identity uniqueness', async () => {
    const store = await openSkillSearchStore(':memory:')
    const indexed = source('references/a.md', '# A\n\none\n\ntwo\n')
    const duplicate = indexed.chunks[0]!
    const invalid = { ...indexed, chunks: [duplicate, { ...duplicate, text: 'duplicate' }] }

    await expect(store.refresh({ corpusKey: 'fixture', model, documents: [invalid] }, embed, new AbortController().signal))
      .rejects.toThrow()
    expect(store.corpusRevision('fixture')).toBe(0)
    await store.close()
  })

  it('rejects a stored vector whose byte count disagrees with its dimensions', async () => {
    const db = await openDatabase(':memory:')
    const store = new SkillSearchStore(db)
    await store.refresh({
      corpusKey: 'fixture',
      model,
      documents: [source('references/a.md', '# A\n\ntext\n')],
    }, embed, new AbortController().signal)
    db.exec('UPDATE vectors SET dimensions = dimensions + 1')

    expect(() => store.vectorRows('fixture')).toThrow('byte length')
    await store.close()
  })
})
