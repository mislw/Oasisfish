import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'

const require = createRequire(import.meta.url)

describe('desktop wallpaper engine bundle', () => {
  test('uses the Client module id as the stylesheet owner', () => {
    const client = readFileSync(require.resolve('dsh-plugin-wallpaper-engine/client'), 'utf8')

    expect(client).toContain('tag.dataset.plugin = "dsh-plugin-wallpaper-engine"')
    expect(client).not.toContain('tag.dataset.plugin = "dsh-wallpaper-engine"')
  })
})
