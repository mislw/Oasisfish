import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SkillRegistry, {
  BUNDLED_SKILL_RANK,
  type SkillProvider,
  type SkillProviderControl,
} from '@deepseek-ai/dsh-skill'
import * as SkillImageGeneration from '../src/index.ts'
import { describe, expect, it } from 'vitest'

const assets = fileURLToPath(new URL('../assets/', import.meta.url))

describe('bundled image generation skill', () => {
  it('loads the formal workflow and removes it on disposal', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SkillRegistry)
      const fiber = await ctx.plugin(SkillImageGeneration)
      expect(await ctx.skills.list()).toContainEqual(expect.objectContaining({
        name: 'image-generation',
        description: 'Prepare image generation, editing, and variation requests before using an available image executor.',
        provider: 'dsh-image-generation',
        source: 'bundled',
        invocation: { modelInvocable: true, userInvocable: true },
      }))
      const skill = await ctx.skills.get('image-generation')
      expect(skill?.resourceBase).toEqual({ kind: 'directory', path: join(assets, 'image-generation') })
      expect(skill?.content).toContain('image_optimize')
      expect(skill?.content).toContain('needs_clarification')
      expect(skill?.content).toContain('prepared')
      expect(skill?.content).toMatch(/generate.*edit.*variation/su)
      expect(skill?.content).toMatch(/category.*style.*scene/su)
      expect(skill?.content).toMatch(/exact text.*structured/sui)
      expect(skill?.content).toMatch(/current input.*position.*role/sui)
      expect(skill?.content).toMatch(/prompt.*references.*output.*capabilities/su)
      expect(skill?.content).toMatch(/Oasis.*Cowart.*after/su)
      await fiber.dispose()
      expect(await ctx.skills.list()).toEqual([])
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('registers the exact discovery description and bundled rank', async () => {
    let provider: SkillProvider | undefined
    const skills = {
      registerProvider(create: (control: SkillProviderControl) => SkillProvider): () => void {
        provider = create({ signal: new AbortController().signal, invalidate() {} })
        return () => {}
      },
    }
    SkillImageGeneration.apply({ skills } as unknown as Context)
    if (provider === undefined) throw new Error('expected image generation provider registration')

    const observation = await provider.list({})
    const candidates = 'complete' in observation ? observation.candidates : observation
    expect(candidates).toContainEqual(expect.objectContaining({
      name: 'image-generation',
      description: 'Prepare image generation, editing, and variation requests before using an available image executor.',
      rank: BUNDLED_SKILL_RANK,
    }))
  })

  it('loads relocated resources through a real cordis.yml composition', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-image-generation-skill-'))
    const ctx = new Context()
    try {
      const external = join(root, 'relocated assets')
      await cp(assets, external, { recursive: true })
      const configPath = join(root, 'cordis.yml')
      await writeFile(configPath, [
        "- name: '@deepseek-ai/dsh-skill'",
        "- name: '@deepseek-ai/dsh-skill-image-generation'",
        '  config:',
        `    assetRoot: ${JSON.stringify(external)}`,
        '',
      ].join('\n'))
      ctx.baseUrl = pathToFileURL(root).href + '/'
      await ctx.plugin(Loader)
      ctx.loader.builtins.include = Include
      const modules = new Map<string, unknown>([
        ['@deepseek-ai/dsh-skill', SkillRegistry],
        ['@deepseek-ai/dsh-skill-image-generation', SkillImageGeneration],
      ])
      ctx.loader.internal = {
        version: 'v2',
        async import(specifier: string) {
          if (!modules.has(specifier)) throw new Error(`Unexpected Loader import: ${specifier}`)
          return modules.get(specifier)
        },
      } as unknown as NonNullable<typeof ctx.loader.internal>
      await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
      await ctx.loader.await()
      const loaded = await ctx.skills.get('image-generation')
      expect(loaded?.resourceBase).toEqual({ kind: 'directory', path: join(external, 'image-generation') })
      const raw = await readFile(join(external, 'image-generation', 'SKILL.md'), 'utf8')
      expect(loaded?.content).toBe(raw.slice(raw.indexOf('\n---\n') + 5).trim())
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects invalid resources before registration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-image-generation-invalid-'))
    const ctx = new Context()
    try {
      await ctx.plugin(SkillRegistry)
      expect(() => { SkillImageGeneration.apply(ctx, { assetRoot: 'assets' }) }).toThrow('absolute directory')
      await cp(assets, root, { recursive: true })
      await writeFile(join(root, 'image-generation', 'SKILL.md'), '# Missing frontmatter\n')
      expect(() => { SkillImageGeneration.apply(ctx, { assetRoot: root }) }).toThrow('has no YAML frontmatter')
      for (const header of ['', 'null', 'scalar', 'name: image-generation', 'description: 3', 'description: ""']) {
        await writeFile(join(root, 'image-generation', 'SKILL.md'), `---\n${header}\n---\n# Instructions\n`)
        expect(() => { SkillImageGeneration.apply(ctx, { assetRoot: root }) }).toThrow('has no description')
      }
      expect(await ctx.skills.list()).toEqual([])
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
})
