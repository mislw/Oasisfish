/** Immutable metadata for the one embedding model shipped by the desktop application. */
export interface ModelResourceManifest {
  schemaVersion: 1
  modelId: 'Xenova/bge-small-zh-v1.5'
  upstreamModelId: 'BAAI/bge-small-zh-v1.5'
  revision: '75c43b069aac4d136ba6bc1122f995fedcfd2781'
  license: 'MIT'
  transformersJsVersion: '4.2.0'
  files: Readonly<Record<string, string>>
}

export const MODEL_RESOURCE_FILES: readonly string[]

/** Read and require the one approved local embedding model manifest. */
export function readModelManifest(path: string): Promise<ModelResourceManifest>

/** Verify the approved model manifest, license, file types, and every pinned digest. */
export function verifyModelResources(root: string): Promise<ModelResourceManifest>
