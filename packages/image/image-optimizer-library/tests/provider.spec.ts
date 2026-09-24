import { createHash } from 'node:crypto'
import { cp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import ImageOptimizer from '@deepseek-ai/dsh-image-optimizer'
import * as ImageLibrary from '@deepseek-ai/dsh-image-optimizer-library'
import { describe, expect, it, vi } from 'vitest'
import { prepared, requestFixture } from '../../image-optimizer/tests/fixtures.ts'
import { copiedAssets, syncedAssets } from './harness.ts'

async function optimizer(config?: ImageLibrary.Config): Promise<{ ctx: Context; fiber: Awaited<ReturnType<Context['plugin']>> }> {
  const ctx = new Context()
  await ctx.plugin(ImageOptimizer)
  const fiber = await ctx.plugin(ImageLibrary, config)
  return { ctx, fiber }
}

async function rewriteResource(root: string, name: string, content: string): Promise<void> {
  await writeFile(join(root, name), content)
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')) as unknown as {
    resources: Record<string, { bytes: number; sha256: string }>
  }
  manifest.resources[name] = {
    bytes: Buffer.byteLength(content, 'utf8'),
    sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
  }
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest, undefined, 2) + '\n')
}

describe('packaged image optimization library', () => {
  it('ships a truthful replaceable bootstrap snapshot', async () => {
    const root = await copiedAssets()
    try {
      const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')) as unknown as {
        snapshot: {
          kind: string
          importedUpstreamTemplates: number
          importedUpstreamCases: number
          note: string
        }
        upstream: { repository: string; commit: string | null; reviewedCheckout: boolean }
      }
      expect(manifest.snapshot).toMatchObject({
        kind: 'bootstrap',
        importedUpstreamTemplates: 0,
        importedUpstreamCases: 0,
      })
      expect(manifest.snapshot.note).toContain('complete reviewed checkout')
      expect(manifest.upstream).toMatchObject({
        repository: 'https://github.com/freestylefly/awesome-gpt-image-2',
        commit: null,
        reviewedCheckout: false,
      })
      expect(JSON.parse(await readFile(join(root, 'cases.json'), 'utf8'))).toEqual([])
      expect(JSON.parse(await readFile(join(root, 'templates.json'), 'utf8'))).toHaveLength(1)
      expect(await readFile(join(root, 'LICENSE.upstream'), 'utf8')).toContain('No upstream license file was imported')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('fails activation for relative roots and changed packaged resources', async () => {
    const ctx = new Context()
    const root = await copiedAssets()
    try {
      await ctx.plugin(ImageOptimizer)
      await expect(ctx.plugin(ImageLibrary, { assetRoot: 'assets' })).rejects.toThrow('absolute directory')
      await writeFile(join(root, 'cases.json'), '[ ]\n')
      await expect(ctx.plugin(ImageLibrary, { assetRoot: root })).rejects.toThrow('hash mismatch')
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects count, license, and prompt-permission corruption after hashes are updated', async () => {
    const counts = await copiedAssets()
    const license = await copiedAssets()
    const prompt = await syncedAssets()
    const ctx = new Context()
    try {
      await ctx.plugin(ImageOptimizer)
      const manifest = JSON.parse(await readFile(join(counts, 'manifest.json'), 'utf8')) as unknown as {
        counts: { cases: number }
      }
      manifest.counts.cases = 1
      await writeFile(join(counts, 'manifest.json'), JSON.stringify(manifest, undefined, 2) + '\n')
      await expect(ctx.plugin(ImageLibrary, { assetRoot: counts })).rejects.toThrow('counts do not match')

      await rewriteResource(license, 'LICENSE.upstream', '\n')
      await expect(ctx.plugin(ImageLibrary, { assetRoot: license })).rejects.toThrow('must not be empty')

      const cases = JSON.parse(await readFile(join(prompt.root, 'cases.json'), 'utf8')) as unknown as Array<{
        id: string
        prompt?: string
      }>
      const unlicensed = cases.find(item => item.id === 'case-4')
      if (unlicensed === undefined) throw new Error('fixture is missing case-4')
      unlicensed.prompt = '特朗普在抖音直播间卖老干妈，手里举着「老干妈风味」新品，背景还是 SpaceX 那种科技感，左下角弹幕飘着「特斯拉车主：求上链接」。'
      await rewriteResource(prompt.root, 'cases.json', JSON.stringify(cases, undefined, 2) + '\n')
      await expect(ctx.plugin(ImageLibrary, { assetRoot: prompt.root })).rejects.toThrow('without redistribution permission')
    } finally {
      await ctx.fiber.dispose()
      await rm(counts, { recursive: true, force: true })
      await rm(license, { recursive: true, force: true })
      await prompt.cleanup()
    }
  })

  it('matches the packaged global fallback without network or model calls', async () => {
    const { ctx } = await optimizer()
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network forbidden'))
    try {
      const result = prepared(await ctx.imageOptimizer.optimize(requestFixture({
        category: 'game-ui',
        styleHints: ['flat icon'],
        sceneHints: ['inventory'],
      })))
      expect(result.evidence[0]).toMatchObject({
        provider: 'image-optimizer-library',
        templateId: 'general-image',
        caseIds: [],
      })
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      fetch.mockRestore()
      await ctx.fiber.dispose()
    }
  })

  it('keeps prepared results free of concrete image model names', async () => {
    const { ctx } = await optimizer()
    try {
      const serialized = JSON.stringify(await ctx.imageOptimizer.optimize(requestFixture()))
      for (const forbidden of ['gpt-image', 'gemini', 'flux']) {
        expect(serialized.toLowerCase()).not.toContain(forbidden)
      }
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('matches category, style, scene, English, and Chinese metadata deterministically', async () => {
    const assets = await syncedAssets()
    const { ctx } = await optimizer({ assetRoot: assets.root })
    try {
      const English = prepared(await ctx.imageOptimizer.optimize(requestFixture({
        intent: 'Create a social interface screenshot.',
        category: 'UI & Interfaces',
        styleHints: ['UI'],
        sceneHints: ['Social'],
      })))
      expect(English.evidence[0]).toMatchObject({
        provider: 'image-optimizer-library',
        templateId: 'ui-screenshot-system',
        caseIds: ['case-4'],
      })
      const Chinese = prepared(await ctx.imageOptimizer.optimize(requestFixture({
        intent: '创建社媒界面截图。',
        category: 'UI 与界面',
        styleHints: ['界面'],
        sceneHints: ['社媒'],
      })))
      expect(Chinese.evidence[0]).toMatchObject({
        provider: 'image-optimizer-library',
        templateId: 'ui-screenshot-system',
      })
      expect(JSON.stringify(await ctx.imageOptimizer.optimize(requestFixture({ category: 'UI & Interfaces' }))))
        .toBe(JSON.stringify(await ctx.imageOptimizer.optimize(requestFixture({ category: 'UI & Interfaces' }))))
    } finally {
      await ctx.fiber.dispose()
      await assets.cleanup()
    }
  })

  it('preserves a matched request category alias for strict compiler selection', async () => {
    const assets = await syncedAssets()
    const { ctx } = await optimizer({ assetRoot: assets.root })
    try {
      const result = prepared(await ctx.imageOptimizer.optimize(requestFixture({
        category: 'UI 与界面',
        intent: 'Create a readable game interface.',
        styleHints: [],
        sceneHints: [],
      })))
      expect(result.evidence[0]).toMatchObject({ templateId: 'ui-screenshot-system' })
    } finally {
      await ctx.fiber.dispose()
      await assets.cleanup()
    }
  })

  it('resolves exact ids, forwards cancellation, and removes the Provider on disposal', async () => {
    const assets = await syncedAssets()
    const { ctx, fiber } = await optimizer({ assetRoot: assets.root })
    try {
      const explicit = prepared(await ctx.imageOptimizer.optimize(requestFixture({
        templateId: 'ui-screenshot-system',
        caseIds: ['case-4'],
      })))
      expect(explicit.evidence[0]).toMatchObject({
        templateId: 'ui-screenshot-system',
        caseIds: ['case-4'],
      })
      const controller = new AbortController()
      controller.abort()
      await expect(ctx.imageOptimizer.optimize(requestFixture(), { signal: controller.signal }))
        .rejects.toMatchObject({ name: 'AbortError' })
      await fiber.dispose()
      await expect(ctx.imageOptimizer.optimize(requestFixture({ templateId: 'ui-screenshot-system' })))
        .rejects.toMatchObject({ code: 'IMAGE_OPTIMIZATION_SOURCE_NOT_FOUND' })
    } finally {
      await ctx.fiber.dispose()
      await assets.cleanup()
    }
  })

  it('loads relocated assets through a real cordis.yml composition', async () => {
    const assets = await syncedAssets()
    const configRoot = await copiedAssets()
    const ctx = new Context()
    try {
      const relocated = join(configRoot, 'relocated assets')
      await cp(assets.root, relocated, { recursive: true })
      const configPath = join(configRoot, 'cordis.yml')
      await writeFile(configPath, [
        "- name: '@deepseek-ai/dsh-image-optimizer'",
        "- name: '@deepseek-ai/dsh-image-optimizer-library'",
        '  config:',
        `    assetRoot: ${JSON.stringify(relocated)}`,
        '',
      ].join('\n'))
      ctx.baseUrl = pathToFileURL(configRoot).href + '/'
      await ctx.plugin(Loader)
      ctx.loader.builtins.include = Include
      const modules = new Map<string, unknown>([
        ['@deepseek-ai/dsh-image-optimizer', ImageOptimizer],
        ['@deepseek-ai/dsh-image-optimizer-library', ImageLibrary],
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
      expect(prepared(await ctx.imageOptimizer.optimize(requestFixture({ category: 'UI & Interfaces' }))).evidence[0])
        .toMatchObject({ provider: 'image-optimizer-library' })
    } finally {
      await ctx.fiber.dispose()
      await assets.cleanup()
      await rm(configRoot, { recursive: true, force: true })
    }
  })

  it('keeps category, style, scene, and keyword tiers absolute for repeated query terms', async () => {
    const assets = await syncedAssets()
    const { ctx } = await optimizer({ assetRoot: assets.root })
    try {
      const category = prepared(await ctx.imageOptimizer.optimize(requestFixture({
        category: 'UI & Interfaces',
        styleHints: Array.from({ length: 20 }, () => 'Poster'),
        sceneHints: Array.from({ length: 20 }, () => 'Commerce'),
        intent: 'poster campaign '.repeat(100),
      })))
      expect(category.evidence[0]).toMatchObject({ templateId: 'ui-screenshot-system' })

      const style = prepared(await ctx.imageOptimizer.optimize(requestFixture({
        styleHints: ['Poster'],
        sceneHints: Array.from({ length: 20 }, () => 'Tech'),
        intent: 'ui interface dashboard '.repeat(100),
      })))
      expect(style.evidence[0]).toMatchObject({ templateId: 'poster-layout-system' })

      const scene = prepared(await ctx.imageOptimizer.optimize(requestFixture({
        sceneHints: ['Commerce'],
        intent: 'ui interface dashboard '.repeat(100),
      })))
      expect(scene.evidence[0]).toMatchObject({ templateId: 'poster-layout-system' })
    } finally {
      await ctx.fiber.dispose()
      await assets.cleanup()
    }
  })
})
