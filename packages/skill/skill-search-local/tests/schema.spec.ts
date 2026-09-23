import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { openDatabase } from '../src/schema.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('openDatabase', () => {
  it('reopens an existing configured database without resetting its schema version', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-skill-search-schema-'))
    roots.push(root)
    const path = join(root, 'nested', 'index.sqlite')
    const first = await openDatabase(path)
    first.close()
    const second = await openDatabase(path)
    expect(second.prepare('PRAGMA user_version').get()).toEqual({ user_version: 1 })
    second.close()
  })

  it.each([
    ['unrelated', 'CREATE TABLE legacy_data (value TEXT)'],
    ['partial', 'CREATE TABLE corpora (corpus_key TEXT PRIMARY KEY)'],
  ])('rejects a nonempty version-zero %s database without changing it', async (_kind, ddl) => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-skill-search-schema-'))
    roots.push(root)
    const path = join(root, 'index.sqlite')
    const legacy = new DatabaseSync(path)
    legacy.exec(ddl)
    const before = legacy.prepare(`
      SELECT type, name, sql FROM sqlite_schema
      WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name
    `).all()
    legacy.close()

    const opening = openDatabase(path)
    await opening.then(
      (unexpected) => {
        unexpected.close()
        throw new Error('expected nonempty version-zero database rejection')
      },
      (error: unknown) => {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toContain('nonempty schema with user_version 0')
      },
    )

    const unchanged = new DatabaseSync(path)
    expect(unchanged.prepare('PRAGMA user_version').get()).toEqual({ user_version: 0 })
    expect(unchanged.prepare(`
      SELECT type, name, sql FROM sqlite_schema
      WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name
    `).all()).toEqual(before)
    unchanged.close()
  })
})
