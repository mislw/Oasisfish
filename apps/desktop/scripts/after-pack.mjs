import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyHarnessResources } from './harness-deployment.mjs'
import { createPortableInventory } from './portable-inventory.mjs'
import { PACKAGED_REQUIRED_FILES, verifyStagedProduct } from './staged-inventory.mjs'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const harnessRoot = join(desktopRoot, 'build-resources', 'harness')

/** Copy and verify the complete Harness closure after electron-builder's file filtering. */
export default async function afterPack(context) {
  const resourcesRoot = join(context.appOutDir, 'resources')
  await copyHarnessResources(harnessRoot, resourcesRoot)
  await createPortableInventory(context.appOutDir, context.packager.appInfo.version)
  await verifyStagedProduct(resourcesRoot, PACKAGED_REQUIRED_FILES)
}
