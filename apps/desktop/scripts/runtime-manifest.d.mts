export type RuntimeArtifactFormat = 'file' | 'zip' | 'self-extracting-7z' | 'sevenzip'

export interface RuntimeArtifact {
  name: string
  version: string
  url: string
  sha256: string
  format: RuntimeArtifactFormat
  destination: string
  requiredFiles: string[]
  stripComponents: 0 | 1
  fileName?: string
}

export interface RuntimeManifest {
  schemaVersion: 1
  platform: 'win32-x64'
  artifacts: RuntimeArtifact[]
}

export const REQUIRED_RUNTIME_NAMES: readonly string[]

export function validateRuntimeManifest(value: unknown): RuntimeManifest

export function readRuntimeManifest(path: string): Promise<RuntimeManifest>
