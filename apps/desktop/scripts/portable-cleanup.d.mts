import type { PortableInventory } from './portable-inventory.mjs'

export function cleanPortableTree(options: {
  portableRoot: string
  inventory: PortableInventory
  receiptPath: string
  targetVersion: string
}): Promise<{ ok: true } | { ok: false; reason: string }>
