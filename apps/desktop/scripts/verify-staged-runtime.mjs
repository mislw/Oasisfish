import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyStagedProduct } from './staged-inventory.mjs'

const resourcesRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'build-resources')
await verifyStagedProduct(resourcesRoot)
process.stdout.write(`verify-staged-runtime: complete product at ${resourcesRoot}\n`)
