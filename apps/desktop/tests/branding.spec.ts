import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('desktop branding', () => {
  it('ships a 256 pixel Windows icon', async () => {
    const icon = await readFile(new URL('../build/icon.png', import.meta.url))

    expect(icon.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect(icon.readUInt32BE(16)).toBe(256)
    expect(icon.readUInt32BE(20)).toBe(256)
  })
})
