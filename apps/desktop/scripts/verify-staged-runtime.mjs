import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyStagedProduct } from './staged-inventory.mjs'
import { verifyModelResources } from './verify-model-resources.mjs'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const resourcesRoot = join(desktopRoot, 'build-resources')
await verifyStagedProduct(resourcesRoot)
await verifyModelResources(join(desktopRoot, 'bundled-models', 'bge-small-zh-v1.5'))
process.stdout.write(`verify-staged-runtime: complete product at ${resourcesRoot}\n`)
