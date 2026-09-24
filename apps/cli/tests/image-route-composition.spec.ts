import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { composeEntries, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { SHIPPED_PRESET_ROOT } from '@deepseek-ai/dsh-agent-presets'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const patch = (path: string) => loadOverlayPatches('image route composition', join(root, path))
const base = patch('packages/bundle/base/cordis.patch.yml')
const web = patch('packages/bundle/web-app/cordis.patch.yml')
const desktop = patch('apps/desktop-host/oasisfish.cordis.patch.yml')
const generationSnapshot = patch('snapshots/session/image-generation/cordis.yml')
const generationSnapshotReplay = patch('snapshots/session/image-generation/cordis.snapshot.yml')
const optimizationSnapshot = patch('snapshots/session/image-optimization/profile.patch.yml')
const presetManifest = JSON.parse(
  readFileSync(join(root, 'packages/preset/agent-presets/package.json'), 'utf8'),
) as { dependencies?: Record<string, string> }

function imageService(layers: typeof base[]) {
  return composeEntries(layers).find(row => row.id === 'image-generation')
}

function imageOptimizeTool(layers: typeof base[]) {
  return composeEntries(layers).find(row => row.id === 'tool-image-optimize')
}

describe('auxiliary image route composition', () => {
  it('keeps the provider disabled in generic profiles and enables it only in Oasisfish Desktop', () => {
    expect(imageService([base])).toMatchObject({
      name: '@deepseek-ai/dsh-image-generation', disabled: true,
    })
    expect(imageService([base, web])?.disabled).toBe(true)
    expect(imageService([base, web, desktop])).toMatchObject({
      name: '@deepseek-ai/dsh-image-generation', disabled: false,
    })
  })

  it('keeps the shared optimizer services active while Web delegates the tool to presets', () => {
    const baseEntries = composeEntries([base])
    expect(baseEntries.find(row => row.id === 'image-optimizer')).toMatchObject({
      name: '@deepseek-ai/dsh-image-optimizer',
    })
    expect(baseEntries.find(row => row.id === 'image-optimizer-library')).toMatchObject({
      name: '@deepseek-ai/dsh-image-optimizer-library',
    })
    expect(baseEntries.find(row => row.id === 'skill-image-generation')).toMatchObject({
      name: '@deepseek-ai/dsh-skill-image-generation',
      disabled: true,
    })
    expect(composeEntries([base, web, desktop]).find(row => row.id === 'skill-image-generation'))
      .toMatchObject({ name: '@deepseek-ai/dsh-skill-image-generation', disabled: false })
    expect(composeEntries([base, optimizationSnapshot]).find(row => row.id === 'skill-image-generation'))
      .toMatchObject({ name: '@deepseek-ai/dsh-skill-image-generation', disabled: false })
    expect(composeEntries([base, generationSnapshot]).find(row => row.id === 'skill-image-generation'))
      .toMatchObject({ name: '@deepseek-ai/dsh-skill-image-generation', disabled: false })
    expect(composeEntries([base, generationSnapshotReplay]).find(row => row.id === 'skill-image-generation'))
      .toMatchObject({ name: '@deepseek-ai/dsh-skill-image-generation', disabled: false })
    expect(imageOptimizeTool([base])).toMatchObject({
      name: '@deepseek-ai/dsh-tool-image-optimize',
      disabled: true,
    })
    expect(imageOptimizeTool([base, web])?.disabled).toBe(true)
    expect(imageOptimizeTool([base, generationSnapshot])?.disabled).toBe(false)
    expect(imageOptimizeTool([base, generationSnapshotReplay])?.disabled).toBe(false)
    expect(imageOptimizeTool([base, optimizationSnapshot])?.disabled).toBe(false)
  })

  it.each(['standard', 'ptc'])('mounts optimization before generation in the %s preset', (preset) => {
    const entries = yaml.load(
      readFileSync(join(SHIPPED_PRESET_ROOT, preset, 'agent.cordis.yml'), 'utf8'),
      { schema: entryListSchema },
    ) as readonly {
      id?: string
      name?: string
      group?: boolean
      isolate?: Record<string, boolean>
      config?: readonly { id?: string; name?: string; disabled?: unknown }[]
    }[]
    const imageTools = entries.find(row => row.id === 'image-tools')
    expect(imageTools).toMatchObject({
      name: 'cordis:group', group: true, isolate: { imageInputImages: true },
    })
    const tools = imageTools?.config ?? []
    expect(tools.find(row => row.id === 'tool-image-optimize')).toMatchObject({
      name: '@deepseek-ai/dsh-tool-image-optimize',
    })
    expect(tools.find(row => row.id === 'tool-image-optimize')?.disabled).toBeUndefined()
    expect(tools.find(row => row.id === 'tool-image-generate')).toMatchObject({
      name: '@deepseek-ai/dsh-tool-image-generate',
    })
    expect(tools.find(row => row.id === 'tool-image-generate')?.disabled).toBeUndefined()
    expect(tools.findIndex(row => row.id === 'tool-image-optimize'))
      .toBeLessThan(tools.findIndex(row => row.id === 'tool-image-generate'))
    expect(presetManifest.dependencies).toHaveProperty('@deepseek-ai/dsh-tool-image-optimize')
  })
})
