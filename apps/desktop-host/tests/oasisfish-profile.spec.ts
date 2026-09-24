import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { composeEntries, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { desktopPatchFiles } from '../src/index.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const loadPatch = (path: string) => loadOverlayPatches('Oasisfish Desktop profile test', join(root, path))

describe('Oasisfish Desktop profile', () => {
  it('loads the application overlay only for the Oasisfish client build', () => {
    const resourceRoot = join(root, '.desktop-build', 'runtime')
    expect(desktopPatchFiles('official', resourceRoot)).toEqual([])
    expect(desktopPatchFiles(undefined, resourceRoot)).toEqual([])
    expect(desktopPatchFiles('oasisfish', resourceRoot).map(path => basename(path)))
      .toEqual(['oasisfish.cordis.patch.yml'])
  })

  it('loads the Oasisfish overlay from prepared Desktop resources instead of the Host package', () => {
    const resourceRoot = join(root, '.desktop-build', 'runtime')
    const select = desktopPatchFiles as (profile: string | undefined, root: string) => string[]
    expect(select('oasisfish', resourceRoot)).toEqual([join(resourceRoot, 'desktop', 'oasisfish.cordis.patch.yml')])
    const manifest = JSON.parse(readFileSync(join(root, 'apps', 'desktop-host', 'package.json'), 'utf8')) as {
      files?: string[]
    }
    expect(manifest.files).toEqual(['lib/index.js'])
  })

  it('composes restored Host services exactly once without changing generic Web defaults', () => {
    const base = loadPatch('packages/bundle/base/cordis.patch.yml')
    const web = loadPatch('packages/bundle/web-app/cordis.patch.yml')
    const wallpaper = loadPatch('packages/bundle/desktop-wallpaper-engine/cordis.patch.yml')
    const oasisfish = loadPatch('apps/desktop-host/oasisfish.cordis.patch.yml')
    const generic = composeEntries([base, web])
    expect(generic.find(row => row.id === 'image-generation')?.disabled).toBe(true)
    expect(generic.find(row => row.id === 'ui-codex-bridge')?.disabled).toBe(true)
    expect(generic.find(row => row.id === 'skill-search')?.config).toEqual({ corpora: [] })
    expect(generic.some(row => row.id === 'skill-search-local')).toBe(false)
    expect(generic.some(row => row.id === 'desktop-wallpaper-engine')).toBe(false)

    const desktop = composeEntries([base, web, wallpaper, oasisfish])
    const required = new Map([
      ['memory', '@deepseek-ai/dsh-memory'],
      ['memory-local', '@deepseek-ai/dsh-memory-local'],
      ['ui-settings-memory', '@deepseek-ai/dsh-client-ui-settings-memory'],
      ['image-optimizer', '@deepseek-ai/dsh-image-optimizer'],
      ['image-optimizer-library', '@deepseek-ai/dsh-image-optimizer-library'],
      ['skill-image-generation', '@deepseek-ai/dsh-skill-image-generation'],
      ['tool-image-optimize', '@deepseek-ai/dsh-tool-image-optimize'],
      ['image-generation', '@deepseek-ai/dsh-image-generation'],
      ['ui-oasis-workflow', '@deepseek-ai/dsh-client-ui-oasis-workflow'],
      ['ui-codex-bridge', '@deepseek-ai/dsh-client-ui-codex-bridge'],
      ['skill-search', '@deepseek-ai/dsh-skill-search'],
      ['skill-search-local', '@deepseek-ai/dsh-skill-search-local'],
      ['desktop-wallpaper-engine', 'dsh-plugin-wallpaper-engine'],
      ['ui-wallpaper-engine-onboarding', '@deepseek-ai/dsh-client-ui-wallpaper-engine-onboarding'],
    ])
    for (const [id, name] of required) {
      expect(desktop.filter(row => row.id === id), id).toEqual([
        expect.objectContaining({ id, name }),
      ])
    }
    expect(desktop.some(row => row.id === 'tool-memory')).toBe(false)
    expect(desktop.find(row => row.id === 'image-generation')?.disabled).toBe(false)
    expect(desktop.find(row => row.id === 'ui-codex-bridge')?.disabled).toBe(false)
  })
})
