import { describe, expect, it } from 'vitest'
import { REQUIRED_RUNTIME_NAMES, validateRuntimeManifest } from '../scripts/runtime-manifest.mjs'

const hash = 'a'.repeat(64)

interface TestArtifact {
  name: string
  version: string
  url: string
  sha256: string
  format: string
  destination: string
  requiredFiles: string[]
}

interface TestManifest {
  schemaVersion: number
  platform: string
  artifacts: TestArtifact[]
}

function validManifest(): TestManifest {
  return {
    schemaVersion: 1,
    platform: 'win32-x64',
    artifacts: REQUIRED_RUNTIME_NAMES.map((name, index) => ({
      name,
      version: `1.0.${index}`,
      url: `https://downloads.example.test/${name}.zip`,
      sha256: hash,
      format: 'zip',
      destination: name,
      requiredFiles: [`${name}.exe`],
    })),
  }
}

describe('validateRuntimeManifest', () => {
  it('accepts one complete Windows x64 manifest', () => {
    expect(validateRuntimeManifest(validManifest())).toMatchObject({
      schemaVersion: 1,
      platform: 'win32-x64',
    })
  })

  it.each<[string, (manifest: TestManifest) => void]>([
    ['uses an insecure URL', (manifest) => { manifest.artifacts[0]!.url = 'http://example.test/node.zip' }],
    ['has no pinned checksum', (manifest) => { manifest.artifacts[0]!.sha256 = '' }],
    ['duplicates an artifact name', (manifest) => { manifest.artifacts[1]!.name = manifest.artifacts[0]!.name }],
    ['duplicates a destination', (manifest) => { manifest.artifacts[1]!.destination = manifest.artifacts[0]!.destination }],
    ['uses an unsupported archive format', (manifest) => { manifest.artifacts[0]!.format = 'rar' }],
    ['omits a required runtime artifact', (manifest) => { manifest.artifacts.pop() }],
  ])('rejects a manifest that %s', (_label, mutate) => {
    const manifest = validManifest()
    mutate(manifest)
    expect(() => validateRuntimeManifest(manifest)).toThrow()
  })
})
