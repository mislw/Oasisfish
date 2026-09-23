import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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
})
