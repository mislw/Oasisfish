/** Materialize the complete production runtime before publishing Desktop resources. */

import { spawn, execFile } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { delimiter, isAbsolute, join, relative, resolve, sep } from 'node:path'
import * as yaml from 'js-yaml'
import { desktopNodeEnvironment } from '../src/node-environment.ts'
import { createRuntimeProjectMetadata } from '../src/project-manager.ts'
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../src/host-protocol.ts'
import { parseDesktopRelease, type DesktopRelease } from '../src/release.ts'
import {
  DESKTOP_HOST_PACKAGE,
  DESKTOP_HOST_RUNTIME_FILES,
  DESKTOP_PACKAGES_DIR,
  DESKTOP_PACKAGE_SET_FILE,
  readDesktopCorePackageSet,
  verifyDesktopCoreLockfile,
} from '../src/core-package-set.ts'
import { smokePrimaryRuntime } from './prepare-primary-runtime.ts'
import { smokeDesktopRuntime } from './smoke-runtime.ts'
import { writeDesktopRuntime, verifyDesktopRuntime } from '../src/runtime-tree.ts'
import {
  resolveDesktopAppId,
  resolveMacOSSigningEnvironment,
} from './desktop-release-environment.mjs'
import {
  signMacOSRuntime,
} from './macos-runtime.ts'
import { resolveDesktopBuildTarget, resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { desktopRuntimeFileExclusion } from './runtime-file-policy.ts'
import { selectOfficeEngine } from '../../../scripts/libreoffice-engine.ts'

const APP_ROOT = resolve(import.meta.dirname, '..')
const REPOSITORY_ROOT = resolve(APP_ROOT, '..', '..')
const WALLPAPER_ENGINE_PACKAGE = 'dsh-plugin-wallpaper-engine@0.7.5'
const WALLPAPER_ENGINE_PATCH_FILE = `patches/${WALLPAPER_ENGINE_PACKAGE}.patch`
const WALLPAPER_ENGINE_PATCH_HASH = 'c072d3bab81f7d5983a6939ef13eb452ba6b4971786eb412215b6741fe5e79ce'
const WALLPAPER_ENGINE_RUNTIME_VERSIONS = {
  'dsh-plugin-wallpaper-engine': '0.7.5',
  'jpeg-js': '0.4.4',
  '@shaderfrog/glsl-parser': '7.0.1',
} as const

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Copy the reviewed upstream patch and declare it in one temporary runtime workspace.
 * @param buildRoot - Private runtime installation root.
 * @returns Nothing.
 */
export function prepareWallpaperEngineRuntimePatch(buildRoot: string): void {
  const patchDirectory = join(buildRoot, 'patches')
  mkdirSync(patchDirectory, { recursive: true, mode: 0o700 })
  copyFileSync(join(REPOSITORY_ROOT, WALLPAPER_ENGINE_PATCH_FILE), join(buildRoot, WALLPAPER_ENGINE_PATCH_FILE))
  const workspacePath = join(buildRoot, 'pnpm-workspace.yaml')
  const workspace = readFileSync(workspacePath, 'utf8')
  writeFileSync(workspacePath,
    `${workspace}patchedDependencies:\n  ${WALLPAPER_ENGINE_PACKAGE}: ${WALLPAPER_ENGINE_PATCH_FILE}\n`, { mode: 0o600 })
}

/**
 * Require pnpm to record the reviewed patch hash before production installation.
 * @param body - Generated `pnpm-lock.yaml` contents.
 * @returns Nothing.
 */
export function verifyWallpaperEngineRuntimeLockfile(body: string): void {
  const lockfile = yaml.load(body) as unknown
  const patchedDependencies = record(lockfile) ? lockfile.patchedDependencies : undefined
  if (!record(patchedDependencies) || patchedDependencies[WALLPAPER_ENGINE_PACKAGE] !== WALLPAPER_ENGINE_PATCH_HASH) {
    throw new Error('desktop runtime: generated lockfile has wrong wallpaper engine patch hash')
  }
}

/**
 * Resolve the complete wallpaper package set strictly from signed runtime resources.
 * @param root - Materialized Desktop runtime root.
 * @param releaseVersion - Expected version of both first-party packages.
 * @returns Nothing.
 */
export function verifyWallpaperEngineRuntimePackages(root: string, releaseVersion: string): void {
  const modules = join(root, 'node_modules')
  const require = createRequire(join(root, 'package.json'))
  const expected = {
    '@deepseek-ai/dsh-desktop-wallpaper-engine': releaseVersion,
    '@deepseek-ai/dsh-client-ui-wallpaper-engine-onboarding': releaseVersion,
    ...WALLPAPER_ENGINE_RUNTIME_VERSIONS,
  }
  for (const [name, version] of Object.entries(expected)) {
    const manifestPath = require.resolve(`${name}/package.json`)
    const installedPath = relative(modules, manifestPath)
    if (installedPath === '..' || installedPath.startsWith(`..${sep}`) || isAbsolute(installedPath)) {
      throw new Error(`desktop runtime: ${name}@${version} resolved outside application resources`)
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: unknown; version?: unknown }
    if (manifest.name !== name || manifest.version !== version) {
      throw new Error(`desktop runtime: expected ${name}@${version} in application resources`)
    }
  }
}

function manifestVersion(path: string, subject: string): string {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown }
  if (typeof manifest.version !== 'string') throw new Error(`desktop runtime: ${subject} has no version`)
  return manifest.version
}

function desktopRelease(runtimeRoot: string): DesktopRelease {
  const version = manifestVersion(join(APP_ROOT, 'package.json'), 'desktop package')
  const dshVersion = manifestVersion(resolve(APP_ROOT, '..', '..', 'package.json'), 'root dsh package')
  if (version !== dshVersion) {
    throw new Error(`desktop runtime: Electron ${version} must bind the same version of @deepseek-ai/dsh, found ${dshVersion}`)
  }
  const runtime = JSON.parse(readFileSync(join(runtimeRoot, 'versions.json'), 'utf8')) as Record<string, unknown>
  return parseDesktopRelease({
    schemaVersion: 1,
    version,
    hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
    nodeVersion: runtime.node,
    pnpmVersion: runtime.pnpm,
  })
}

function runPnpm(
  buildRoot: string,
  storeRoot: string,
  args: readonly string[],
  paths: ReturnType<typeof resolveDesktopTargetBuildPaths>,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const [command, ...commandArgs] = args
    if (command === undefined) throw new Error('desktop runtime: pnpm command is required')
    const config = join(paths.dshPnpm, 'config')
    const userConfig = join(config, 'npmrc')
    const node = join(paths.electron, process.platform === 'win32' ? 'electron.exe' : 'Electron.app/Contents/MacOS/Electron')
    const pnpm = join(paths.runtime, 'pnpm', 'bin', 'pnpm.mjs')
    mkdirSync(config, { recursive: true })
    writeFileSync(userConfig, '')
    const child = spawn(node, [
      '--expose-internals',
      pnpm,
      '--config.registry=https://registry.npmjs.org/',
      `--config.store-dir=${storeRoot}`,
      '--config.enable-global-virtual-store=false',
      `--config.userconfig=${userConfig}`,
      command,
      ...commandArgs,
    ], {
      cwd: buildRoot,
      env: {
        ...Object.fromEntries(Object.entries(process.env).filter(([name]) => (
          name !== 'NODE_OPTIONS' && name !== 'NODE_PATH' && !/^DSH_DESKTOP_/u.test(name) && !/^(?:npm|pnpm|corepack)_/iu.test(name)
        ))),
        NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/',
        NPM_CONFIG_STORE_DIR: storeRoot,
        NPM_CONFIG_USERCONFIG: userConfig,
        ...desktopNodeEnvironment(node, join(paths.runtime, 'bin'), {}),
        PATH: `${join(paths.runtime, 'bin')}${delimiter}${process.env.PATH ?? ''}`,
        XDG_CACHE_HOME: join(paths.dshPnpm, 'cache'),
        XDG_CONFIG_HOME: config,
        XDG_STATE_HOME: join(paths.dshPnpm, 'state'),
      },
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`desktop runtime: pnpm exited with ${String(code ?? signal)}`))
    })
  })
}

async function main(): Promise<void> {
  const paths = resolveDesktopTargetBuildPaths()
  const dshOutputRoot = paths.dsh
  const runtimeRoot = paths.runtime
  const pnpmBuildState = paths.dshPnpm
  const packageSetRoot = paths.packageSet
  const node = join(paths.electron, process.platform === 'win32' ? 'electron.exe' : 'Electron.app/Contents/MacOS/Electron')
  const buildRoot = mkdtempSync(join(tmpdir(), 'dsh-desktop-runtime-'))
  const storeRoot = join(buildRoot, 'store')
  rmSync(dshOutputRoot, { recursive: true, force: true })
  rmSync(pnpmBuildState, { recursive: true, force: true })
  mkdirSync(storeRoot, { recursive: true })
  try {
    const release = desktopRelease(runtimeRoot)
    copyFileSync(join(packageSetRoot, DESKTOP_PACKAGE_SET_FILE), join(buildRoot, DESKTOP_PACKAGE_SET_FILE))
    cpSync(join(packageSetRoot, DESKTOP_PACKAGES_DIR), join(buildRoot, DESKTOP_PACKAGES_DIR), { recursive: true })
    createRuntimeProjectMetadata(buildRoot, release)
    prepareWallpaperEngineRuntimePatch(buildRoot)
    await runPnpm(buildRoot, storeRoot, ['install', '--lockfile-only'], paths)
    const lockfile = readFileSync(join(buildRoot, 'pnpm-lock.yaml'), 'utf8')
    verifyDesktopCoreLockfile(
      lockfile,
      readDesktopCorePackageSet(buildRoot, release.version),
    )
    verifyWallpaperEngineRuntimeLockfile(lockfile)
    await runPnpm(buildRoot, storeRoot, ['install', '--prod', '--frozen-lockfile', '--trust-lockfile'], paths)
    const packageSet = readDesktopCorePackageSet(buildRoot, release.version)
    const targetName = resolveDesktopBuildTarget()
    const target = { platform: process.platform, arch: targetName.endsWith('arm64') ? 'arm64' : 'x64' }
    const modules = join(buildRoot, 'node_modules')
    const officeManifest = JSON.parse(readFileSync(join(modules, '@deepseek-ai/libreoffice-kit/package.json'), 'utf8'))
    const officeEngine = selectOfficeEngine(officeManifest, target)
    mkdirSync(dshOutputRoot, { recursive: true })
    cpSync(modules, join(dshOutputRoot, 'node_modules'), {
      recursive: true, dereference: true,
      filter: source => desktopRuntimeFileExclusion(relative(modules, source), target, officeEngine) === undefined,
    })
    writeFileSync(join(dshOutputRoot, 'package.json'), `${JSON.stringify({
      name: '@deepseek-ai/dsh-desktop-runtime', private: true, version: release.version, type: 'module',
      dependencies: Object.fromEntries(packageSet.packages.map(entry => [entry.name, entry.version])),
    }, undefined, 2)}\n`)
    verifyWallpaperEngineRuntimePackages(dshOutputRoot, release.version)
    for (const file of DESKTOP_HOST_RUNTIME_FILES) {
      if (!existsSync(join(dshOutputRoot, 'node_modules', DESKTOP_HOST_PACKAGE, file))) {
        throw new Error(`desktop runtime: missing private Host file ${file}`)
      }
    }
    if (!existsSync(join(dshOutputRoot, 'node_modules', '@deepseek-ai', `libreoffice-kit-${officeEngine}`, 'prebuilds.json'))) {
      throw new Error(`desktop runtime: missing required LibreOffice engine ${officeEngine}`)
    }
    if (process.platform === 'darwin') {
      await signMacOSRuntime(dshOutputRoot, resolveDesktopAppId(process.env), resolveMacOSSigningEnvironment(process.env))
      await signMacOSRuntime(join(runtimeRoot, 'primary-runtime'), resolveDesktopAppId(process.env), resolveMacOSSigningEnvironment(process.env))
    }
    smokePrimaryRuntime(join(runtimeRoot, 'primary-runtime'))
    writeDesktopRuntime(dshOutputRoot, release, packageSet.packages.map(entry => entry.name), target)
    const descriptor = await verifyDesktopRuntime(dshOutputRoot, release.version, target)
    await new Promise<void>((accept, reject) => {
      execFile(node, ['--expose-internals', join(APP_ROOT, 'tests/fixtures/runtime-payload-smoke.mjs'), dshOutputRoot],
        { timeout: 120_000, env: desktopNodeEnvironment(node, join(runtimeRoot, 'bin'), { ...process.env, NODE_OPTIONS: '' }) }, (error, stdout, stderr) => {
          if (error !== null) reject(new Error(`desktop native payload smoke failed: ${stderr}`, { cause: error }))
          else { process.stdout.write(stdout); accept() }
        })
    })
    await smokeDesktopRuntime(dshOutputRoot, node, descriptor)
    await verifyDesktopRuntime(dshOutputRoot, release.version, target)
  } catch (error) {
    rmSync(dshOutputRoot, { recursive: true, force: true })
    throw error
  } finally {
    rmSync(buildRoot, { recursive: true, force: true })
    rmSync(pnpmBuildState, { recursive: true, force: true })
  }
}

if (import.meta.main) await main()
