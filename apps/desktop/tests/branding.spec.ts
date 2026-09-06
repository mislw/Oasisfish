import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

describe('desktop branding', () => {
  it('packages the Oasisfish product identity', async () => {
    const config = await readFile(new URL('../electron-builder.yml', import.meta.url), 'utf8')
    const main = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8')

    expect(config).toContain('appId: ai.deepseek.harness.desktop')
    expect(config).toContain('productName: Oasisfish')
    expect(config).toContain('artifactName: Oasisfish-${version}-${arch}.${ext}')
    expect(config).toContain('shortcutName: Oasisfish')
    expect(config).toContain('from: build/icon.png')
    expect(config).toContain('to: icon.png')
    expect(main).toContain("app.setPath('userData', resolveDesktopDataRoot(app.getPath('appData')))")
  })

  it('ships a 256 pixel Windows icon', async () => {
    const icon = await readFile(new URL('../build/icon.png', import.meta.url))

    expect(icon.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect(icon.readUInt32BE(16)).toBe(256)
    expect(icon.readUInt32BE(20)).toBe(256)
  })

  it('ships the approved seascape without re-encoding it', async () => {
    const source = await readFile(new URL('../assets/oasisfish-seascape-source.webp', import.meta.url))
    const publicAsset = await readFile(new URL('../../web/public/oasisfish-seascape.webp', import.meta.url))
    const metadata = await sharp(publicAsset).metadata()

    expect(publicAsset).toEqual(source)
    expect(metadata.width).toBe(1920)
    expect(metadata.height).toBe(1200)
  })

  it('keeps the transparent icon margin free of the source black backdrop', async () => {
    const iconPath = fileURLToPath(new URL('../assets/oasisfish-icon.png', import.meta.url))
    const { data, info } = await sharp(iconPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const margin = 48
    let opaqueBlackPixels = 0

    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        if (x >= margin && x < info.width - margin && y >= margin && y < info.height - margin) continue
        const offset = (y * info.width + x) * info.channels
        const red = data[offset]!
        const green = data[offset + 1]!
        const blue = data[offset + 2]!
        const alpha = data[offset + 3]!
        if (alpha > 128 && red < 24 && green < 24 && blue < 24) opaqueBlackPixels += 1
      }
    }

    expect(opaqueBlackPixels).toBe(0)
  })
})
