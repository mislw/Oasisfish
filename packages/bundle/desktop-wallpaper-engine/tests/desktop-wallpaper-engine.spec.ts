import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { WEB_PROFILE_BUNDLES, bundleRoster } from '@deepseek-ai/dsh-client-test-runtime/src/assembly/bundle-roster.ts'
import { describe, expect, onTestFinished, test } from 'vitest'

const require = createRequire(import.meta.url)
const BUNDLE = '@deepseek-ai/dsh-desktop-wallpaper-engine'
const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url))

describe('desktop wallpaper engine bundle', () => {
  test('pins and resolves Wallpaper Engine 0.7.5 exactly', () => {
    const wrapper = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { dependencies?: Record<string, unknown> }
    const installed = JSON.parse(
      readFileSync(require.resolve('dsh-plugin-wallpaper-engine/package.json'), 'utf8'),
    ) as { version?: unknown }

    expect(wrapper.dependencies?.['dsh-plugin-wallpaper-engine']).toBe('0.7.5')
    expect(installed.version).toBe('0.7.5')
  })

  test('does not install the legacy Client runtime peer', () => {
    const lockfile = readFileSync(new URL('../../../../pnpm-lock.yaml', import.meta.url), 'utf8')

    expect(lockfile).not.toMatch(/^  '@deepseek-ai\/dsh-client-runtime@/mu)
  })

  test('uses the Client module id as the stylesheet owner', () => {
    const client = readFileSync(require.resolve('dsh-plugin-wallpaper-engine/client'), 'utf8')

    expect(client).toContain('tag.dataset.plugin = "dsh-plugin-wallpaper-engine"')
    expect(client).not.toContain('tag.dataset.plugin = "dsh-wallpaper-engine"')
  })

  test('adds exactly the two Desktop rows without changing the ordinary Web roster', () => {
    const ordinaryRows = bundleRoster(WEB_PROFILE_BUNDLES, fileURLToPath(import.meta.url)).rows
    const ordinaryBytes = JSON.stringify(ordinaryRows)
    const desktopRows = bundleRoster([...WEB_PROFILE_BUNDLES, BUNDLE], fileURLToPath(import.meta.url)).rows

    expect(WEB_PROFILE_BUNDLES).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    expect(desktopRows.slice(ordinaryRows.length)).toEqual([
      {
        name: 'dsh-plugin-wallpaper-engine',
        inject: ['@deepseek-ai/dsh-client-runtime'],
        immediately: true,
      },
      {
        name: '@deepseek-ai/dsh-client-ui-wallpaper-engine-onboarding',
        inject: [
          '@deepseek-ai/dsh-client-locale',
          '@deepseek-ai/dsh-client-ui-renderer',
          '@deepseek-ai/dsh-client-ui-settings',
        ],
        immediately: false,
      },
    ])
    expect(desktopRows.filter(row => row.name === 'dsh-plugin-wallpaper-engine')).toHaveLength(1)
    expect(desktopRows.filter(row => row.name === '@deepseek-ai/dsh-client-ui-wallpaper-engine-onboarding')).toHaveLength(1)
    expect(JSON.stringify(bundleRoster(WEB_PROFILE_BUNDLES, fileURLToPath(import.meta.url)).rows)).toBe(ordinaryBytes)
    expect(require.resolve('dsh-plugin-wallpaper-engine/package.json')).toBeTruthy()
    expect(require.resolve('@deepseek-ai/dsh-client-ui-wallpaper-engine-onboarding/package.json')).toBeTruthy()
  })

  test('removes both Loader rows when the bundle fiber is disposed', async () => {
    const ctx = new Context()
    const root = mkdtempSync(join(PACKAGE_ROOT, '.bundle-test-'))
    onTestFinished(async () => {
      try {
        await ctx.fiber.dispose()
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })
    const configPath = join(root, 'cordis.yml')
    writeFileSync(configPath, '[]\n')
    await ctx.plugin(Loader).await()
    ctx.loader.builtins.include = Include
    const bundleId = await ctx.loader.create({
      id: 'desktop-wallpaper-engine-bundle',
      name: 'cordis:include',
      config: {
        path: pathToFileURL(configPath).href,
        patches: loadOverlayPatches('desktop-wallpaper-engine-test', join(PACKAGE_ROOT, 'cordis.patch.yml')),
      },
    })

    await ctx.loader.await()
    const bundle = ctx.loader.resolve(bundleId)
    const rows = () => [...ctx.loader.entries()]
      .filter(entry => entry.options.id !== 'desktop-wallpaper-engine-bundle')
      .map(entry => [entry.options.id, entry.options.name])
    expect(rows()).toEqual([
      ['desktop-wallpaper-engine', 'dsh-plugin-wallpaper-engine'],
      ['ui-wallpaper-engine-onboarding', '@deepseek-ai/dsh-client-ui-wallpaper-engine-onboarding'],
    ])

    if (bundle.fiber === undefined) throw new Error('bundle Include row did not activate')
    await bundle.fiber.dispose()
    await ctx.loader.await()
    expect(rows()).toEqual([])
  })
})
