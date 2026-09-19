import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dockerfile = readFileSync(
  new URL('../deploy/nas/Dockerfile', import.meta.url),
  'utf8',
)

describe('NAS Dockerfile runtime permissions', () => {
  it('makes every built runtime output readable before switching users', () => {
    const runtimeUser = dockerfile.indexOf('USER node')
    const buildStage = dockerfile.slice(0, runtimeUser)
    const runtimeOutputs = [
      '/app/apps/*/lib',
      '/app/apps/web/dist',
      '/app/packages/*/*/lib',
      '/app/vendor/*/lib',
      '/app/native/landlock-run/packages/*/lib',
      '/opt/dsh',
    ]

    for (const output of runtimeOutputs) {
      expect(buildStage).toContain(output)
    }
  })
})
