/** Desktop profile initialization and native recovery. */

import {
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  closeSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { join } from 'node:path'
import {
  DESKTOP_HOST_PACKAGE,
  desktopCorePackageOverrides,
  verifyDesktopCorePackageSet,
} from './core-package-set.ts'
import type { DesktopPaths } from './paths.ts'
import type { DesktopRelease } from './release.ts'
import { readDesktopRuntime } from './runtime-tree.ts'
import {
  initProfile, PROFILE_TEMPLATES, readProfileManifest, sanitizeProfile, type ProfileTemplate,
} from '@deepseek-ai/dsh-app-boot'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { migrateDesktopProfileLinks } from './profile-packages.ts'
import { cleanProfileCorePackages } from './profile-core-cleanup.ts'

const PROJECT_NAME = '@deepseek-ai/dsh-desktop-runtime'
const DSH_PACKAGE = '@deepseek-ai/dsh'
const CORE_BUILD_PACKAGE = '@deepseek-ai/dsh-subprocess-local'
const WEB_PROFILE = PROFILE_TEMPLATES.web as ProfileTemplate
const DEFAULT_BUNDLE_STATE_FILENAME = 'desktop-default-bundles.json'
const WORKSPACE_SETTINGS = 'nodeLinker: hoisted\nautoInstallPeers: false\n'

/** Desktop-only bundle offered in addition to the ordinary Web profile. */
export const DESKTOP_WALLPAPER_BUNDLE = '@deepseek-ai/dsh-desktop-wallpaper-engine'

/** Initial bundle list shared by Desktop development, runtime, and user profiles. */
export const DESKTOP_PROFILE_DEFAULT_BUNDLES: readonly string[] = [
  ...WEB_PROFILE.bundles,
  DESKTOP_WALLPAPER_BUNDLE,
]

/** Versioned record of application defaults already offered to one Desktop profile. */
export interface DesktopDefaultBundleState {
  /** State format version. */
  readonly schemaVersion: 1
  /** Default bundle names whose one-time offer has completed. */
  readonly offeredBundles: readonly string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validate a persisted Desktop default-bundle record.
 * @param value - Parsed JSON from `desktop-default-bundles.json`.
 * @returns A detached validated record.
 */
export function parseDesktopDefaultBundleState(value: unknown): DesktopDefaultBundleState {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.offeredBundles)
    || value.offeredBundles.some(bundle => typeof bundle !== 'string')) {
    throw new Error('desktop default bundles: invalid state')
  }
  const offeredBundles = value.offeredBundles as string[]
  if (new Set(offeredBundles).size !== offeredBundles.length) {
    throw new Error('desktop default bundles: invalid state')
  }
  return { schemaVersion: 1, offeredBundles: [...offeredBundles] }
}

function readDesktopDefaultBundleState(projectDir: string): DesktopDefaultBundleState | undefined {
  const statePath = join(projectDir, DEFAULT_BUNDLE_STATE_FILENAME)
  if (!existsSync(statePath)) return undefined
  try {
    return parseDesktopDefaultBundleState(JSON.parse(readFileSync(statePath, 'utf8')) as unknown)
  } catch (error) {
    if (error instanceof Error && error.message === 'desktop default bundles: invalid state') throw error
    throw new Error(`desktop default bundles: failed to read ${statePath}: ${String(error)}`, { cause: error })
  }
}

/**
 * Append defaults not previously offered and publish the updated offer record.
 * The caller owns the Desktop profile transaction lock.
 * If state publication rejects after a manifest change, the manifest remains
 * committed and a later locked call is expected to retry without appending a duplicate.
 * @param projectDir - Desktop profile package directory.
 * @param defaults - New application defaults eligible for a one-time offer.
 * @returns Resolves after the manifest and offer record are published in that order.
 */
export async function offerDesktopDefaultBundles(
  projectDir: string,
  defaults: readonly string[],
): Promise<void> {
  const statePath = join(projectDir, DEFAULT_BUNDLE_STATE_FILENAME)
  const state = readDesktopDefaultBundleState(projectDir) ?? { schemaVersion: 1, offeredBundles: [] }
  const offered = new Set(state.offeredBundles)
  const pending = defaults.filter((bundle) => {
    if (offered.has(bundle)) return false
    offered.add(bundle)
    return true
  })
  if (pending.length === 0) return

  const manifest = readProfileManifest('desktop project', projectDir)
  const bundles = manifest.dsh?.profile?.bundles
  if (!Array.isArray(bundles) || bundles.some(bundle => typeof bundle !== 'string')) {
    throw new Error('desktop default bundles: profile manifest has invalid dsh.profile.bundles')
  }
  const nextBundles = [...bundles]
  for (const bundle of pending) {
    if (!nextBundles.includes(bundle)) nextBundles.push(bundle)
  }
  if (nextBundles.length !== bundles.length) {
    const nextManifest = {
      ...manifest,
      dsh: {
        ...manifest.dsh,
        profile: {
          ...manifest.dsh?.profile,
          bundles: nextBundles,
        },
      },
    }
    await writeFileAtomic(
      join(projectDir, 'package.json'),
      `${JSON.stringify(nextManifest, undefined, 2)}\n`,
      { mode: 0o600 },
    )
  }
  const nextState: DesktopDefaultBundleState = {
    schemaVersion: 1,
    offeredBundles: [...state.offeredBundles, ...pending],
  }
  await writeFileAtomic(statePath, `${JSON.stringify(nextState, undefined, 2)}\n`, { mode: 0o600 })
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, undefined, 2)}\n`, { mode: 0o600 })
}

function workspaceFile(overrides: Readonly<Record<string, string>> = {}): string {
  const entries = Object.entries(overrides).sort(([left], [right]) => left.localeCompare(right))
  const overrideSection = entries.length === 0
    ? ''
    : `overrides:\n${entries.map(([name, spec]) => `  ${JSON.stringify(name)}: ${JSON.stringify(spec)}`).join('\n')}\n`
  if (entries.length === 0) return `packages:\n  - .\n\n${WORKSPACE_SETTINGS}`
  const coreBuildSpec = overrides[CORE_BUILD_PACKAGE]
  const coreBuildKey = coreBuildSpec === undefined
    ? CORE_BUILD_PACKAGE
    : `${CORE_BUILD_PACKAGE}@${coreBuildSpec.replace('file:./', 'file:')}`
  return `packages:\n  - .\n\n${overrideSection}${WORKSPACE_SETTINGS}allowBuilds:\n  node-pty: true\n  koffi: true\n  fs-ext: true\n  ${JSON.stringify(coreBuildKey)}: true\n  '@google/genai': false\n  protobufjs: false\n  node-addon-require-builtin: false\n`
}

function migrateProfileSettings(projectDir: string): void {
  const path = join(projectDir, 'pnpm-workspace.yaml')
  if (!existsSync(path)) return
  const legacy = `packages:\n  - .\n\n${WORKSPACE_SETTINGS}strictDepBuilds: true\nallowBuilds:\n  node-pty: true\n  koffi: true\n  fs-ext: true\n  "${CORE_BUILD_PACKAGE}": true\n  '@google/genai': false\n  protobufjs: false\n  node-addon-require-builtin: false\n`
  if (readFileSync(path, 'utf8').replaceAll('\r\n', '\n') === legacy) {
    writeFileSync(path, workspaceFile())
  }
}

/** Initializes the Desktop profile and disables third-party bundles during recovery. */
export class DesktopProjectManager {
  /**
   * @param paths - Electron-owned package state and reserved desktop profile paths.
   * @param runtime - location of the bundled application runtime.
   */
  constructor(
    readonly paths: DesktopPaths,
    readonly runtime: { readonly dsh: string },
  ) {}

  /**
   * Back up the profile patch and disable third-party bundles without loading application resources.
   * The caller must stop the Host first.
   * @returns Backup path after the locked profile write, or undefined if the patch was absent.
   */
  async disableAllPlugins(): Promise<string | undefined> {
    return this.withLock(() => sanitizeProfile('dsh', this.paths.profile, WEB_PROFILE.bundles))
  }

  /**
   * Load application metadata and prepare the external plugin profile without installing packages.
   * @param production - Remove application-owned profile packages before packaged Host startup.
   */
  async applyRelease(production = false): Promise<void> {
    await this.withLock(async () => {
      const descriptor = readDesktopRuntime(this.runtime.dsh)
      readDesktopDefaultBundleState(this.paths.profile)
      cleanProfileCorePackages(this.paths.profile, descriptor.sharedPackages.map(entry => entry.name), production)
      migrateProfileSettings(this.paths.profile)
      migrateDesktopProfileLinks(this.paths.profile)
      createPluginProfile(this.paths.profile)
      await offerDesktopDefaultBundles(this.paths.profile, [DESKTOP_WALLPAPER_BUNDLE])
    })
  }

  private async withLock<T>(operation: () => T | Promise<T>): Promise<T> {
    mkdirSync(this.paths.profile, { recursive: true, mode: 0o700 })
    const lockPath = join(realpathSync(this.paths.profile), 'lock')
    let descriptor: number
    try {
      descriptor = openSync(lockPath, 'wx', 0o600)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        const lock = lstatSync(lockPath)
        if (lock.isSymbolicLink() || !lock.isFile()) {
          throw new Error('desktop project: profile lock is not a regular file')
        }
        const owner = Number.parseInt(readFileSync(lockPath, 'utf8').trim(), 10)
        let active = !Number.isSafeInteger(owner) || owner <= 0
        if (!active) {
          try {
            process.kill(owner, 0)
            active = true
          } catch (signalError) {
            active = (signalError as NodeJS.ErrnoException).code !== 'ESRCH'
          }
        }
        if (active) throw new Error('desktop project: another profile operation is active')
        unlinkSync(lockPath)
        descriptor = openSync(lockPath, 'wx', 0o600)
      } else {
        throw error
      }
    }
    try {
      writeSync(descriptor, `${String(process.pid)}\n`)
      fsyncSync(descriptor)
      return await operation()
    } finally {
      closeSync(descriptor)
      unlinkSync(lockPath)
    }
  }
}

/** Create build-only project metadata for materializing the signed runtime. */
export function createRuntimeProjectMetadata(projectDir: string, release: DesktopRelease): void {
  mkdirSync(projectDir, { recursive: true, mode: 0o700 })
  const packageSet = verifyDesktopCorePackageSet(projectDir, release.version)
  const manifest = {
    name: PROJECT_NAME,
    private: true,
    version: '0.0.0',
    dependencies: desktopCorePackageOverrides(packageSet),
    dsh: { profile: { bundles: [...DESKTOP_PROFILE_DEFAULT_BUNDLES] } },
  }
  writeJson(join(projectDir, 'package.json'), manifest)
  writeFileSync(
    join(projectDir, 'pnpm-workspace.yaml'),
    workspaceFile(desktopCorePackageOverrides(packageSet)),
    { mode: 0o600 },
  )
}

/**
 * Create metadata for the unpackaged development project that links the current workspace.
 * @param projectDir - Disposable development profile directory.
 * @param release - Release identity shared by the linked CLI package and Electron shell.
 */
export function createDevelopmentProjectMetadata(projectDir: string, release: DesktopRelease): void {
  mkdirSync(projectDir, { recursive: true, mode: 0o700 })
  const manifest = {
    name: PROJECT_NAME,
    private: true,
    version: '0.0.0',
    dependencies: {
      [DSH_PACKAGE]: release.version,
      [DESKTOP_HOST_PACKAGE]: release.version,
    },
    dsh: { profile: { bundles: [...DESKTOP_PROFILE_DEFAULT_BUNDLES] } },
  }
  writeJson(join(projectDir, 'package.json'), manifest)
  writeFileSync(join(projectDir, 'pnpm-workspace.yaml'), workspaceFile(), { mode: 0o600 })
}

/** Create the first external plugin profile without running a package manager. */
export function createPluginProfile(projectDir: string): void {
  initProfile(projectDir, DESKTOP_PROFILE_DEFAULT_BUNDLES)
}
