import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  resolveUnpackedRootArgument,
  smokeUnpacked,
  verifyBundledTools,
} from '../scripts/smoke-unpacked.mjs'

describe('unpacked desktop smoke checks', () => {
  it('executes every bundled coding tool from the staged runtime', async () => {
    const tools = await verifyBundledTools(fileURLToPath(new URL('../build-resources/runtime', import.meta.url)))

    expect(Object.fromEntries(tools.map(tool => [tool.name, tool.version]))).toEqual({
      node: '24.19.0',
      pnpm: '11.7.0',
      python: '3.14.7',
      pip: '26.2.1',
      git: '2.55.0.windows.5',
      bash: '5.3.15',
      powershell: '7.6.5',
      ssh: '10.5p1',
      ripgrep: '15.2.0',
      fd: '10.4.2',
      jq: '1.8.2',
      curl: '8.21.0',
      sevenzip: '26.02',
    })
  }, 60_000)

  it('ignores the pnpm argument separator before a custom unpacked directory', () => {
    expect(resolveUnpackedRootArgument(['--', 'C:\\release\\win-unpacked'], 'C:\\default')).toBe(
      'C:\\release\\win-unpacked',
    )
  })

  it('runs real Oasis Skill search and reuses its persisted index after restart', async () => {
    const unpackedRoot = process.env.DSH_DESKTOP_UNPACKED_ROOT === undefined
      ? fileURLToPath(new URL('../release/win-unpacked', import.meta.url))
      : resolve(process.env.DSH_DESKTOP_UNPACKED_ROOT)

    const result = await smokeUnpacked(unpackedRoot)

    expect(result.search).toMatchObject({
      skill: 'oasis-wiki',
      query: '如何用 UGCAskQ 读取 DataTable？',
      count: 1,
    })
    const hit = result.search.hits[0]
    expect(hit?.path).toMatch(/^references\//u)
    expect(typeof hit?.startLine).toBe('number')
    expect(typeof hit?.endLine).toBe('number')
    expect(result.restartSearch).toEqual(result.search)
    expect(result.cacheReused).toBe(true)
    expect(result.backgroundClosePreserved).toBe(true)
    expect(result.profileModuleFallbackPreserved).toBe(true)
  }, 720_000)
})
