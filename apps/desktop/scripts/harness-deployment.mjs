import { cp, lstat, readdir, realpath, rm } from 'node:fs/promises'
import { join, sep } from 'node:path'

/**
 * Build pnpm arguments for a hoisted desktop runtime deployment.
 * @param {string} stagingRoot - Absolute deployment destination.
 * @returns {string[]} Arguments after `pnpm.cmd`.
 */
export function harnessDeployArguments(stagingRoot) {
  return [
    '--config.inject-workspace-packages=true',
    '--config.ignore-scripts=true',
    '--config.node-linker=hoisted',
    '--filter',
    'dsh-desktop-runtime-pkg',
    'deploy',
    '--prod',
    stagingRoot,
  ]
}

async function findStagedLink(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    const metadata = await lstat(path)
    if (metadata.isSymbolicLink()) return path
    if (!metadata.isDirectory()) continue
    const nested = await findStagedLink(path)
    if (nested !== undefined) return nested
  }
  return undefined
}

/**
 * Replace pnpm package links with package files and remove generated binary links.
 * @param {string} nodeModules - Absolute staged `node_modules` directory.
 */
export async function materializeStagedLinks(nodeModules) {
  let remaining = await findStagedLink(nodeModules)
  while (remaining !== undefined) {
    const segments = remaining.slice(nodeModules.length + 1).split(sep)
    const binIndex = segments.lastIndexOf('.bin')
    if (binIndex >= 0) {
      await rm(join(nodeModules, ...segments.slice(0, binIndex + 1)), { recursive: true, force: true })
      remaining = await findStagedLink(nodeModules)
      continue
    }
    const source = await realpath(remaining)
    const nestedNodeModules = join(source, 'node_modules')
    await rm(remaining, { recursive: true, force: true })
    await cp(source, remaining, {
      recursive: true,
      dereference: true,
      filter: path => path !== nestedNodeModules && !path.startsWith(nestedNodeModules + sep),
    })
    remaining = await findStagedLink(nodeModules)
  }
}

/**
 * Copy the complete Harness closure after electron-builder's node_modules filtering.
 * @param {string} source - Symlink-free staged Harness root.
 * @param {string} resourcesRoot - Packaged Electron resources directory.
 */
export async function copyHarnessResources(source, resourcesRoot) {
  const destination = join(resourcesRoot, 'harness')
  await rm(destination, { recursive: true, force: true })
  await cp(source, destination, { recursive: true, dereference: true })
}
