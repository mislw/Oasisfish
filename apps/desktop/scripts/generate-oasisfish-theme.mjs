import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(desktopRoot, '..', '..')
const mascotSource = resolve(desktopRoot, 'assets', 'oasisfish-mascot-source.png')
const seascapeSource = resolve(desktopRoot, 'assets', 'oasisfish-seascape-source.webp')
const publicRoot = resolve(repositoryRoot, 'apps', 'web', 'public')
const mascotDestination = resolve(publicRoot, 'oasisfish-mascot.webp')
const seascapeDestination = resolve(publicRoot, 'oasisfish-seascape.webp')

const mascotMask = Buffer.from(`
  <svg width="900" height="720" viewBox="0 0 900 720" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="feather" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="34" />
      </filter>
    </defs>
    <ellipse cx="465" cy="350" rx="395" ry="292" fill="white" filter="url(#feather)" />
    <ellipse cx="465" cy="350" rx="350" ry="254" fill="white" />
  </svg>
`)

await mkdir(publicRoot, { recursive: true })

await sharp(mascotSource)
  .resize(900, 720, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .ensureAlpha()
  .composite([{ input: mascotMask, blend: 'dest-in' }])
  .webp({ quality: 92, alphaQuality: 100 })
  .toFile(mascotDestination)

await copyFile(seascapeSource, seascapeDestination)

console.log(`generate-oasisfish-theme: ${mascotDestination}`)
console.log(`generate-oasisfish-theme: ${seascapeDestination}`)
