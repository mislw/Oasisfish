import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const skillRoot = new URL('../bundled-skills/', import.meta.url)

describe('bundled Oasis Wiki skill', () => {
  it('pins the released Oasis Companion skill snapshot', async () => {
    const skill = await readFile(new URL('oasis-wiki/SKILL.md', skillRoot), 'utf8')
    const version = await readFile(new URL('oasis-wiki/VERSION', skillRoot), 'utf8')
    const provenance = JSON.parse(await readFile(
      new URL('oasis-wiki.provenance.json', skillRoot),
      'utf8',
    )) as unknown

    expect(skill).toMatch(/^---\r?\nname: oasis-wiki\r?\n/)
    expect(version.trim()).toBe('1.260827.1')
    expect(provenance).toEqual({
      repository: 'https://github.com/mislw/oasis-wiki-comp.git',
      commit: '885cbf579dbbf1c1389c786f3c4ca8ab86bef6dc',
      version: '1.260827.1',
      source: 'skills/oasis-wiki',
    })
  })

  it('packages the skill root as immutable Electron resources', async () => {
    const builderConfig = await readFile(new URL('../electron-builder.yml', import.meta.url), 'utf8')

    expect(builderConfig).toContain('from: bundled-skills')
    expect(builderConfig).toContain('to: skills')
  })

  it('bundles the image prompt refinement skill with pinned provenance', async () => {
    const skill = await readFile(new URL('ai-image-prompts/SKILL.md', skillRoot), 'utf8')
    const license = await readFile(new URL('ai-image-prompts/LICENSE', skillRoot), 'utf8')
    const provenance = JSON.parse(
      await readFile(new URL('ai-image-prompts.provenance.json', skillRoot), 'utf8'),
    ) as { source: string; revision: string; adaptation: string }

    expect(skill).toContain('name: ai-image-prompts')
    expect(skill).toContain('generation-ready English prompt')
    expect(license).toContain('Copyright (c) 2026 YouMind-OpenLab')
    expect(provenance).toEqual({
      source: 'https://github.com/YouMind-OpenLab/ai-image-prompts-skill',
      revision: '6ef324c0aaf3bae6605e21be08f510a7a3fa0cfb',
      adaptation: 'Oasisfish offline prompt-refinement guidance',
    })
  })
})
