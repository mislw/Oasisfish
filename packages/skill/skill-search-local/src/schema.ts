/** SQLite open and schema management for the local Skill search index. */

import { DatabaseSync } from 'node:sqlite'
import { mkdir, open } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

/** Monotonic on-disk schema version for local Skill search indexes. */
export const SKILL_SEARCH_SCHEMA_VERSION = 1

async function createDatabaseFile(path: string): Promise<void> {
  try {
    const handle = await open(path, 'wx', 0o600)
    await handle.close()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
}

function configure(db: DatabaseSync, path: string): void {
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA journal_mode = WAL')
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number }
  if (version !== 0 && version !== SKILL_SEARCH_SCHEMA_VERSION) {
    throw new Error(`Skill search database at "${path}" has schema version ${version}, incompatible with ${SKILL_SEARCH_SCHEMA_VERSION}.`)
  }
  db.exec('CREATE VIRTUAL TABLE temp.skill_search_fts_probe USING fts5(value)')
  db.exec('DROP TABLE temp.skill_search_fts_probe')
  db.exec(`
    CREATE TABLE IF NOT EXISTS corpora (
      corpus_key       TEXT PRIMARY KEY,
      model_id         TEXT NOT NULL,
      model_revision   TEXT NOT NULL,
      model_dimensions INTEGER NOT NULL,
      revision         INTEGER NOT NULL
    ) STRICT
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      corpus_key TEXT NOT NULL REFERENCES corpora(corpus_key) ON DELETE CASCADE,
      path       TEXT NOT NULL,
      bytes      INTEGER NOT NULL,
      mtime_ms   REAL NOT NULL,
      sha256     TEXT NOT NULL,
      PRIMARY KEY (corpus_key, path)
    ) STRICT
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      corpus_key    TEXT NOT NULL,
      id            TEXT NOT NULL,
      document_path TEXT NOT NULL,
      headings_json TEXT NOT NULL,
      start_line    INTEGER NOT NULL,
      end_line      INTEGER NOT NULL,
      text          TEXT NOT NULL,
      content_sha256 TEXT NOT NULL,
      PRIMARY KEY (corpus_key, id),
      FOREIGN KEY (corpus_key, document_path) REFERENCES documents(corpus_key, path) ON DELETE CASCADE
    ) STRICT
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS vectors (
      corpus_key TEXT NOT NULL,
      chunk_id   TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      vector     BLOB NOT NULL,
      PRIMARY KEY (corpus_key, chunk_id),
      FOREIGN KEY (corpus_key, chunk_id) REFERENCES chunks(corpus_key, id) ON DELETE CASCADE
    ) STRICT
  `)
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      corpus_key UNINDEXED,
      chunk_id UNINDEXED,
      lexical,
      tokenize = 'unicode61'
    )
  `)
  if (version === 0) db.exec(`PRAGMA user_version = ${SKILL_SEARCH_SCHEMA_VERSION}`)
}

/**
 * Open a local Skill search database and ensure its complete schema.
 * @param path - SQLite file path or `:memory:`.
 * @returns configured synchronous SQLite handle.
 */
export async function openDatabase(path: string): Promise<DatabaseSync> {
  const actual = path === ':memory:' ? path : resolve(path)
  if (actual !== ':memory:') {
    await mkdir(dirname(actual), { recursive: true, mode: 0o700 })
    await createDatabaseFile(actual)
  }
  const db = new DatabaseSync(actual)
  try {
    configure(db, actual)
    return db
  } catch (error) {
    db.close()
    throw error
  }
}
