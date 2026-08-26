import { existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { harnessDeployArguments, materializeStagedLinks } from './harness-deployment.mjs'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(desktopRoot, '..', '..')
const buildResourcesRoot = join(desktopRoot, 'build-resources')
const harnessRoot = join(buildResourcesRoot, 'harness')
const runtimeManifest = 'apps/desktop-runtime/package.json'

function assertManagedPath(path) {
  const normalized = resolve(path)
  const managedRoot = `${resolve(desktopRoot)}\\`
  if (!normalized.startsWith(managedRoot)) throw new Error(`Refusing to modify unmanaged path: ${path}`)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? { ...process.env, CI: 'true' },
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${String(result.status)}):\n${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`)
  }
  return `${result.stdout}${result.stderr}`.trim()
}

async function main() {
  const builtCli = join(repoRoot, 'apps', 'cli', 'lib', 'bin.js')
  const builtWeb = join(repoRoot, 'apps', 'web', 'dist', 'index.html')
  const bundledNode = join(buildResourcesRoot, 'runtime', 'node', 'node.exe')
  if (!existsSync(builtCli) || !existsSync(builtWeb)) {
    throw new Error('Harness and Web artifacts are missing. Run `pnpm run build` before desktop deployment.')
  }
  if (!existsSync(bundledNode)) {
    throw new Error('Bundled Node is missing. Run `pnpm run runtime:prepare` before Harness deployment.')
  }
  const stagingRoot = join(buildResourcesRoot, `.harness-${process.pid}-${Date.now()}`)
  assertManagedPath(stagingRoot)
  assertManagedPath(harnessRoot)
  await mkdir(buildResourcesRoot, { recursive: true })
  try {
    run(process.env.ComSpec ?? 'cmd.exe', [
      '/d',
      '/s',
      '/c',
      'pnpm.cmd',
      'exec',
      'tsx',
      'scripts/verify-runtime-closure.ts',
      '--manifest',
      runtimeManifest,
    ])
    run(process.env.ComSpec ?? 'cmd.exe', [
      '/d',
      '/s',
      '/c',
      'pnpm.cmd',
      ...harnessDeployArguments(stagingRoot),
    ])
    await materializeStagedLinks(join(stagingRoot, 'node_modules'))
    const stagedCli = join(stagingRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    const version = run(bundledNode, [stagedCli, '--version'], { cwd: stagingRoot })
    await rm(harnessRoot, { recursive: true, force: true })
    await rename(stagingRoot, harnessRoot)
    process.stdout.write(`prepare-harness: ${version} ready at ${harnessRoot}\n`)
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true })
    throw error
  }
}

await main()
