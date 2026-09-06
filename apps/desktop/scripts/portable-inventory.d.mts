export const PORTABLE_INVENTORY_PATH: 'resources/oasisfish-portable-inventory.json'

export interface PortableDirectoryEntry {
  path: string
  kind: 'directory'
}

export interface PortableFileEntry {
  path: string
  kind: 'file'
  size: number
  sha256: string
}

export interface PortableInventory {
  schemaVersion: 1
  product: 'Oasisfish'
  version: string
  entries: Array<PortableDirectoryEntry | PortableFileEntry>
}

export function validatePortableInventory(value: unknown): PortableInventory
export function createPortableInventory(root: string, version: string): Promise<PortableInventory>
export function verifyPortableTree(
  root: string,
  input: unknown,
): Promise<{ ok: true } | { ok: false; reason: string }>
