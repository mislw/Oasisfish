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

function imageService(layers: typeof base[]) {
  return composeEntries(layers).find(row => row.id === 'image-generation')
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

  it.each(['standard', 'ptc'])('lets the image service dependency activate the tool in the %s preset', (preset) => {
    const entries = yaml.load(
      readFileSync(join(SHIPPED_PRESET_ROOT, preset, 'agent.cordis.yml'), 'utf8'),
      { schema: entryListSchema },
    ) as readonly { id?: string; name?: string; disabled?: unknown }[]
    expect(entries.find(row => row.id === 'tool-image-generate')).toMatchObject({
      name: '@deepseek-ai/dsh-tool-image-generate',
    })
    expect(entries.find(row => row.id === 'tool-image-generate')?.disabled).toBeUndefined()
  })
})
