import { beforeEach, describe, expect, it, vi } from 'vitest'

const sqlite = vi.hoisted(() => {
  const commands: string[] = []
  const failure = new Error('schema creation failed')
  let version = 0
  const db = {
    close: vi.fn(),
    exec: vi.fn((command: string) => {
      commands.push(command)
      if (command.includes('CREATE TABLE IF NOT EXISTS corpora')) throw failure
    }),
    prepare: vi.fn((statement: string) => statement === 'PRAGMA user_version'
      ? { get: () => ({ user_version: version }) }
      : { all: () => [] }),
  }
  return { commands, db, failure, setVersion: (value: number) => { version = value } }
})

vi.mock('node:sqlite', () => ({
  DatabaseSync: vi.fn(function DatabaseSync() { return sqlite.db }),
}))

import { openDatabase } from '../src/schema.ts'

beforeEach(() => {
  sqlite.commands.length = 0
  sqlite.db.close.mockClear()
  sqlite.db.exec.mockClear()
  sqlite.db.prepare.mockClear()
})

describe('openDatabase schema transaction', () => {
  it.each([
    { version: 0, rollback: true },
    { version: 1, rollback: false },
  ])('rolls back schema creation only for version zero: $version', async ({ version, rollback }) => {
    sqlite.setVersion(version)

    await expect(openDatabase(':memory:')).rejects.toBe(sqlite.failure)
    expect(sqlite.commands.includes('BEGIN IMMEDIATE')).toBe(version === 0)
    expect(sqlite.commands.includes('ROLLBACK')).toBe(rollback)
    expect(sqlite.db.close).toHaveBeenCalledOnce()
  })
})
