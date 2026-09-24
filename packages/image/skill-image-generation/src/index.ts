/** Bundled workflow for preparing image generation, editing, and variation requests. */

import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { BUNDLED_SKILL_RANK, type SkillCandidate, type SkillProvider } from '@deepseek-ai/dsh-skill'
import { parse as parseYaml } from 'yaml'

/** Image generation skill resource location. */
export interface Config {
  /** Absolute assets directory containing the image-generation skill; defaults to packaged assets. */
  assetRoot?: string
}

/** Validated resource configuration. */
export const Config: z<Config> = z.object({ assetRoot: z.string().min(1) })

/** Cordis plugin identity. */
export const name = 'skill-image-generation'
/** Registry used by the bundled provider. */
export const inject = ['skills']

function parseSkill(raw: string, path: string): { description: string; content: string } {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (frontmatter?.[1] === undefined) throw new Error(`skill-image-generation: ${path} has no YAML frontmatter`)
  const metadata: unknown = parseYaml(frontmatter[1])
  const description = typeof metadata === 'object' && metadata !== null && 'description' in metadata
    ? metadata.description : undefined
  if (typeof description !== 'string' || description.length === 0) {
    throw new Error(`skill-image-generation: ${path} has no description`)
  }
  return { description, content: raw.slice(frontmatter[0].length).trim() }
}

/**
 * Register the bundled image request preparation workflow.
 * @param ctx - Context carrying the skill registry.
 * @param config - Optional external assets directory for packaged applications.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const assetRoot = config.assetRoot ?? fileURLToPath(new URL('../assets/', import.meta.url))
  if (!isAbsolute(assetRoot)) throw new Error('skill-image-generation: assetRoot must be an absolute directory')
  const directory = join(assetRoot, 'image-generation')
  const path = join(directory, 'SKILL.md')
  const { description } = parseSkill(readFileSync(path, 'utf8'), path)
  const candidate: SkillCandidate = {
    name: 'image-generation',
    description,
    invocation: { modelInvocable: true, userInvocable: true },
    provider: 'dsh-image-generation',
    source: 'bundled',
    rank: BUNDLED_SKILL_RANK,
    resourceBase: { kind: 'directory', path: directory },
    locator: path,
  }
  const provider: SkillProvider = {
    name: 'dsh-image-generation',
    list: () => Promise.resolve([candidate]),
    async get(selected, options) {
      const { rank: _rank, locator, ...summary } = selected
      const raw = await readFile(locator as string, { encoding: 'utf8', signal: options.signal })
      return { ...summary, content: parseSkill(raw, locator as string).content }
    },
  }
  ctx.skills.registerProvider(() => provider)
}
