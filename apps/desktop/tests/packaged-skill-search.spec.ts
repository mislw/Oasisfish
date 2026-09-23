import { DatabaseSync } from 'node:sqlite'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { prepareModelAssets } from '../scripts/prepare-primary-runtime.ts'

const binScript = fileURLToPath(new URL('../../cli/tests/fixtures/desktop-oasis-wiki/snapshot.ts', import.meta.url))
const configPath = fileURLToPath(new URL('../../cli/tests/fixtures/desktop-oasis-wiki/packaged.cordis.yml', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const sourceSkills = fileURLToPath(new URL('../resources/bundled-skills/', import.meta.url))
const sourceModel = fileURLToPath(new URL('../resources/bundled-models/bge-small-zh-v1.5/', import.meta.url))
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

function revisions(path: string): unknown[] {
  const database = new DatabaseSync(path, { readOnly: true })
  try {
    return database.prepare('SELECT corpus_key AS corpusKey, revision FROM corpora ORDER BY corpus_key').all()
  } finally { database.close() }
}

function withoutScores(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutScores)
  if (typeof value !== 'object' || value === null) return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(Object.entries(record)
    .filter(([key]) => key !== 'score')
    .map(([key, nested]) => [key, withoutScores(nested)]))
}

describe('packaged local Skill search restart', () => {
  it('reuses the committed corpus revisions after a complete Loader restart', async () => {
    const root = await mkdtemp(join(tmpdir(), 'desktop-packaged-skill-search-'))
    temporaryDirectories.push(root)
    const runtime = join(root, 'runtime')
    const bundled = join(runtime, 'bundled-skills')
    const model = join(runtime, 'models', 'bge-small-zh-v1.5')
    const cache = join(root, 'cache', 'skill-search')
    await mkdir(cache, { recursive: true })
    await mkdir(join(bundled, 'oasis-wiki', 'references'), { recursive: true })
    await mkdir(join(bundled, 'ai-image-prompts', 'references'), { recursive: true })
    await mkdir(join(bundled, 'undeclared-skill', 'references'), { recursive: true })
    await cp(join(sourceSkills, 'oasis-wiki', 'SKILL.md'), join(bundled, 'oasis-wiki', 'SKILL.md'))
    await cp(
      join(sourceSkills, 'oasis-wiki', 'references', 'mcp-integration.md'),
      join(bundled, 'oasis-wiki', 'references', 'mcp-integration.md'),
    )
    await cp(join(sourceSkills, 'ai-image-prompts', 'SKILL.md'), join(bundled, 'ai-image-prompts', 'SKILL.md'))
    await cp(
      join(sourceSkills, 'ai-image-prompts', 'references', 'visual-recipes.md'),
      join(bundled, 'ai-image-prompts', 'references', 'visual-recipes.md'),
    )
    await writeFile(join(bundled, 'undeclared-skill', 'SKILL.md'), [
      '---',
      'name: undeclared-skill',
      'description: Must remain unavailable to corpus search.',
      '---',
      '',
      '# Undeclared',
      '',
    ].join('\n'))
    await writeFile(join(bundled, 'undeclared-skill', 'references', 'hidden.md'), '# Hidden\n\nNever index this resource.\n')
    await prepareModelAssets(sourceModel, model)
    const run = async (): Promise<unknown> => {
      const result = await runLoaderSmoke({
        label: 'packaged Oasisfish Skill search restart',
        cwd: root,
        binScript,
        libBinScript: binScript,
        configPath,
        tsconfigPath,
        processTimeoutMs: 180_000,
        env: {
          DSH_BUNDLED_SKILL_DIR: bundled,
          DSH_SKILL_SEARCH_MODEL_DIR: model,
          DSH_SKILL_SEARCH_CACHE_DIR: cache,
        },
      })
      expect(result.stderr).toBe('')
      return JSON.parse(result.stdout) as unknown
    }

    const first = await run()
    const databasePath = join(cache, 'skill-search.sqlite')
    const firstRevisions = revisions(databasePath)
    const second = await run()
    expect(withoutScores(second)).toEqual(withoutScores(first))
    expect(revisions(databasePath)).toEqual(firstRevisions)
    expect(firstRevisions).toHaveLength(2)
    expect(await readFile(join(runtime, 'models', 'bge-small-zh-v1.5', 'model-manifest.json'), 'utf8')).toContain('75c43b069aac4d136ba6bc1122f995fedcfd2781')
  }, 360_000)
})
