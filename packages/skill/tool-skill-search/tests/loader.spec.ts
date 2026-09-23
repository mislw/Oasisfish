import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const driver = fileURLToPath(new URL('./fixtures/loader/driver.ts', import.meta.url))
const configPath = fileURLToPath(new URL('./fixtures/loader/cordis.yml', import.meta.url))
const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))

interface SkillSearchLoaderReport {
  description: string
  resultText: string
  leakedAbsolutePath: boolean
}

describe('tool-skill-search through a real Loader composition', () => {
  it('registers the model schema and executes a deterministic provider result', async () => {
    let report: SkillSearchLoaderReport | undefined
    const { stderr } = await runLoaderSmoke({
      label: 'tool-skill-search loader smoke',
      tempDirPrefix: 'tool-skill-search-loader-',
      binScript: driver,
      libBinScript: driver,
      configPath,
      tsconfigPath: repoTsconfig,
      inspect: async (cwd) => {
        report = JSON.parse(await readFile(join(cwd, 'skill-search-loader-report.json'), 'utf8')) as SkillSearchLoaderReport
      },
    })

    expect(stderr).not.toContain('UNHANDLED')
    expect(report).toEqual({
      description: 'Search the declared Skill corpus for a loaded Skill. Use this for factual or API questions after loading the Skill, then cite the returned relative path and line range.',
      resultText: '1. references/respawn.md:7-9\nHeadings: Player > Respawn\nRespawn at the nearest active checkpoint.',
      leakedAbsolutePath: false,
    })
  }, 45_000)
})
