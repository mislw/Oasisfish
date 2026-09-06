import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(desktopRoot, 'assets', 'oasisfish-icon.png')
const destination = resolve(desktopRoot, 'build', 'icon.png')

await mkdir(dirname(destination), { recursive: true })
await sharp(source)
  .resize(256, 256)
  .png()
  .toFile(destination)

console.log(`generate-icon: ${destination}`)
