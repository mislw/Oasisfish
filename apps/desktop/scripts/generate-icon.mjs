import { mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(desktopRoot, '..', 'web', 'public', 'favicon.svg')
const destination = resolve(desktopRoot, 'build', 'icon.png')
const background = Buffer.from(`
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="8" width="240" height="240" rx="52" fill="#101216"/>
</svg>
`)

const mark = await sharp(await readFile(source))
  .resize(174, 174)
  .negate({ alpha: false })
  .png()
  .toBuffer()

await mkdir(dirname(destination), { recursive: true })
await sharp({
  create: {
    width: 256,
    height: 256,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([
    { input: background },
    { input: mark, left: 41, top: 41 },
  ])
  .png()
  .toFile(destination)

console.log(`generate-icon: ${destination}`)
