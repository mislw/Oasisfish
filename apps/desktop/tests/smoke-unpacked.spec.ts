import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  resolveUnpackedRootArgument,
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
  })

  it('ignores the pnpm argument separator before a custom unpacked directory', () => {
    expect(resolveUnpackedRootArgument(['--', 'C:\\release\\win-unpacked'], 'C:\\default')).toBe(
      'C:\\release\\win-unpacked',
    )
  })
})
