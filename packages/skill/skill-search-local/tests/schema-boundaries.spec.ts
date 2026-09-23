import { describe, expect, it, vi } from 'vitest'

const denied = Object.assign(new Error('permission denied'), { code: 'EACCES' })
const fs = vi.hoisted(() => ({
  mkdir: vi.fn(() => Promise.resolve()),
  open: vi.fn(() => Promise.reject(denied)),
}))

vi.mock('node:fs/promises', () => fs)

import { openDatabase } from '../src/schema.ts'

describe('openDatabase file creation', () => {
  it('preserves non-EEXIST creation failures', async () => {
    await expect(openDatabase('C:\\denied\\index.sqlite')).rejects.toBe(denied)
  })
})
