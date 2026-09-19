import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertManifestComplete } from './gen-tool-catalog.ts'

describe('tool catalog package discovery', () => {
  it('ignores build residue for a deleted tool package', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'dsh-tool-catalog-'))
    try {
      const shipped = join(fixture, 'packages/example/tool-shipped')
      const residue = join(fixture, 'packages/example/tool-residue/lib')
      mkdirSync(shipped, { recursive: true })
      mkdirSync(residue, { recursive: true })
      writeFileSync(join(shipped, 'package.json'), '{"name":"tool-shipped"}\n')

      expect(() => assertManifestComplete([{ dir: 'tool-shipped' }], fixture)).not.toThrow()
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })
})
