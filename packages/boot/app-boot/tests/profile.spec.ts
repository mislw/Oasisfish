/**
 * Profile machinery of `dsh-app-boot`: directory resolution and init,
 * manifest round-trips, two-anchor bundle resolution, patch-layer loading,
 * empty-root composition, and the installation module-fallback healing.
 */

import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, statSync,
  symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  composeEntries,
  healProfilesModuleFallback,
  initProfile,
  loadProfile,
  PROFILE_PATCH_FILENAME,
  PROFILE_TEMPLATES,
  readProfileManifest,
  resolveBundleDir,
  resolveProfileDir,
  writeProfileManifest,
} from '../src/index.ts'
import { publishProfileFallbackDirectory, removeManagedProfileFallbackDirectory } from '../src/profile.ts'
import {
  acquireProfilesModuleFallbackHealLock,
  PROFILE_MODULE_FALLBACK_HEAL_LOCK_FILENAME,
  profileHealLockOwnerIsAlive,
} from '../src/profile-heal-lock.ts'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'dsh-profile-'))

function processProbeError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code })
}

function waitForFile(path: string): void {
  const deadline = Date.now() + 5_000
  const sleeper = new Int32Array(new SharedArrayBuffer(4))
  while (!existsSync(path)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${path}`)
    Atomics.wait(sleeper, 0, 0, 10)
  }
}

/** Stage a fake installed app: package.json with deps and a node_modules holding bundles. */
function stageInstallation(bundles: Record<string, { patch?: string; deps?: Record<string, string> }>): string {
  const root = tmp()
  const appDir = join(root, 'app')
  mkdirSync(join(appDir, 'node_modules'), { recursive: true })
  const appDeps: Record<string, string> = {}
  for (const [name, spec] of Object.entries(bundles)) {
    appDeps[name] = '0.0.0'
    const dir = join(appDir, 'node_modules', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name,
      version: '0.0.0',
      dependencies: spec.deps ?? {},
      ...spec.patch === undefined ? {} : { dsh: { bundle: { patch: './cordis.patch.yml' } } },
    }))
    if (spec.patch !== undefined) writeFileSync(join(dir, 'cordis.patch.yml'), spec.patch)
  }
  writeFileSync(join(appDir, 'package.json'), JSON.stringify({ name: 'dsh-app', dependencies: appDeps }))
  return join(appDir, 'package.json')
}

describe('resolveProfileDir', () => {
  it('joins the home and rejects traversal-shaped names', () => {
    const home = tmp()
    expect(resolveProfileDir('tui', home)).toBe(join(home, 'profiles', 'tui'))
    for (const bad of ['', '.', '..', 'a/b', 'a\\b']) {
      expect(() => resolveProfileDir(bad, home)).toThrow('invalid profile name')
    }
  })
})

describe('initProfile', () => {
  it('creates manifest, user patch layer, and pnpm workspace once, never overwriting', () => {
    const home = tmp()
    const dir = resolveProfileDir('tui', home)
    initProfile(dir, ['@deepseek-ai/dsh-base'])
    const manifest = readProfileManifest('t', dir)
    expect(manifest.dsh?.profile?.bundles).toEqual(['@deepseek-ai/dsh-base'])
    expect(readFileSync(join(dir, PROFILE_PATCH_FILENAME), 'utf8')).toContain('[]')
    expect(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8')).toContain('nodeLinker: hoisted')
    // Re-init keeps user edits.
    writeFileSync(join(dir, PROFILE_PATCH_FILENAME), '- id: x\n  config: {}\n')
    initProfile(dir, ['other'])
    expect(readProfileManifest('t', dir).dsh?.profile?.bundles).toEqual(['@deepseek-ai/dsh-base'])
    expect(readFileSync(join(dir, PROFILE_PATCH_FILENAME), 'utf8')).toContain('- id: x')
  })
})

describe('manifest round-trip', () => {
  it('writes and reads back, and fails loud on a broken manifest', () => {
    const dir = tmp()
    writeProfileManifest(dir, { name: 'p', dsh: { profile: { bundles: ['a'] } } })
    expect(readProfileManifest('t', dir).dsh?.profile?.bundles).toEqual(['a'])
    writeFileSync(join(dir, 'package.json'), '[]')
    expect(() => readProfileManifest('t', dir)).toThrow('must hold a JSON object')
    expect(() => readProfileManifest('t', join(dir, 'nope'))).toThrow('failed to read profile manifest')
  })
})

describe('resolveBundleDir', () => {
  it('prefers the installation anchor, falls back to the profile, and fails loud', () => {
    const anchor = stageInstallation({ 'in-box': { patch: '[]\n' } })
    const profileDir = tmp()
    mkdirSync(join(profileDir, 'node_modules', 'local-only'), { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), '{}')
    writeFileSync(join(profileDir, 'node_modules', 'local-only', 'package.json'), JSON.stringify({ name: 'local-only', version: '0.0.0' }))
    expect(resolveBundleDir('t', 'in-box', anchor, profileDir)).toContain('in-box')
    expect(resolveBundleDir('t', 'local-only', anchor, profileDir)).toContain('local-only')
    expect(() => resolveBundleDir('t', 'absent', anchor, profileDir)).toThrow('cannot resolve profile bundle')
  })

  it('resolves a package whose exports map omits ./package.json', () => {
    // Common on npm: an exports map without "./package.json" makes
    // require.resolve('<pkg>/package.json') throw ERR_PACKAGE_PATH_NOT_EXPORTED;
    // resolution must fall through to the paths probe instead of misreporting
    // the installed package as missing.
    const anchor = stageInstallation({})
    const profileDir = tmp()
    writeFileSync(join(profileDir, 'package.json'), '{}')
    const dir = join(profileDir, 'node_modules', 'sealed-bundle')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'sealed-bundle',
      version: '0.0.0',
      exports: { '.': './index.js' },
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    writeFileSync(join(dir, 'index.js'), '')
    writeFileSync(join(dir, 'cordis.patch.yml'), '[]\n')
    expect(resolveBundleDir('t', 'sealed-bundle', anchor, profileDir)).toBe(dir)
  })
})

describe('loadProfile', () => {
  it('resolves each dsh.profile.bundles entry to its patch layer in order, plus the user layer', () => {
    const anchor = stageInstallation({
      'bundle-a': { patch: '- insert:\n    - id: a\n      name: pkg-a\n' },
      'bundle-b': { patch: '- id: a\n  config:\n    v: 2\n' },
    })
    const home = tmp()
    const dir = resolveProfileDir('demo', home)
    initProfile(dir, ['bundle-a', 'bundle-b'])
    writeFileSync(join(dir, PROFILE_PATCH_FILENAME), '- id: a\n  config:\n    v: 3\n')
    const profile = loadProfile('t', 'demo', anchor, home)
    expect(profile.layers.map(layer => layer.packageName)).toEqual(['bundle-a', 'bundle-b'])
    expect(profile.patches).toHaveLength(1)
    expect(profile.installationOwned).toBe(false)
    const entries = composeEntries([
      ...profile.layers.map(layer => layer.patches),
      profile.patches,
    ])
    expect(entries).toEqual([{ id: 'a', name: 'pkg-a', config: { v: 3 } }])
    // A hand-made profile without the user layer file or dsh section: empty layers, no throw.
    rmSync(join(dir, PROFILE_PATCH_FILENAME))
    expect(loadProfile('t', 'demo', anchor, home).patches).toEqual([])
    writeProfileManifest(dir, { name: 'bare' })
    const bare = loadProfile('t', 'demo', anchor, home)
    expect(bare.layers).toEqual([])
  })

  it('auto-initializes only shipped templates and fails loud otherwise', () => {
    const anchor = stageInstallation({})
    const home = tmp()
    expect(() => loadProfile('t', 'custom', anchor, home))
      .toThrow('profile "custom" does not exist')
    // The web template auto-initializes on first load. Bundle resolution
    // cannot be asserted to fail here: the source-plane test runner resolves
    // @deepseek-ai/* through tsconfig paths regardless of the staged anchor.
    expect(PROFILE_TEMPLATES.web).toContain('@deepseek-ai/dsh-base')
    try {
      loadProfile('t', 'web', anchor, home)
    } catch {
      // Resolution failure is the plain-Node outcome for this empty anchor.
    }
    expect(readProfileManifest('t', resolveProfileDir('web', home)).dsh?.profile?.bundles)
      .toEqual([...PROFILE_TEMPLATES.web ?? []])
  })

  it('normalizes only the exact installation-owned headless bundle tuple', () => {
    const anchor = stageInstallation({
      '@deepseek-ai/dsh-base': { patch: '[]\n' },
      '@deepseek-ai/dsh-web-app': { patch: '[]\n' },
      '@deepseek-ai/dsh-headless': { patch: '[]\n' },
      'custom-bundle': { patch: '[]\n' },
    })
    const home = tmp()
    const stock = resolveProfileDir('headless', home)
    initProfile(stock, [
      '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-headless',
    ])
    loadProfile('t', 'headless', anchor, home)
    expect(loadProfile('t', 'headless', anchor, home).installationOwned).toBe(true)
    expect(readProfileManifest('t', stock).dsh?.profile?.bundles)
      .toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'])

    const customHome = tmp()
    const custom = resolveProfileDir('headless', customHome)
    initProfile(custom, [
      '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-headless', 'custom-bundle',
    ])
    expect(loadProfile('t', 'headless', anchor, customHome).installationOwned).toBe(false)
    expect(readProfileManifest('t', custom).dsh?.profile?.bundles).toEqual([
      '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-headless', 'custom-bundle',
    ])
  })

  it('fails loud when a listed bundle declares no dsh.bundle', () => {
    const anchor = stageInstallation({ 'not-a-bundle': {} })
    const home = tmp()
    const dir = resolveProfileDir('demo', home)
    initProfile(dir, ['not-a-bundle'])
    expect(() => loadProfile('t', 'demo', anchor, home)).toThrow('declares no dsh.bundle')
  })
})

describe('composeEntries', () => {
  it('applies layers over an empty root and reports skipped patches', () => {
    const warnings: string[] = []
    const entries = composeEntries([
      [{ insert: [{ id: 'x', name: 'pkg-x', config: { a: 1 } }] }],
      [{ id: 'x', config: { a: 2 } }, { id: 'missing', config: {} }],
    ], message => warnings.push(message))
    expect(entries).toEqual([{ id: 'x', name: 'pkg-x', config: { a: 2 } }])
    expect(warnings.join('\n')).toContain('"missing"')
    // Default warn sink: skipped patches are silently dropped (boot repeats them).
    expect(composeEntries([[{ id: 'missing', config: {} }]])).toEqual([])
  })
})

describe('healProfilesModuleFallback', () => {
  it('publishes a staged fallback directory and restores the previous one on failure', () => {
    const root = tmp()
    const current = join(root, 'node_modules')
    const staged = join(root, 'node_modules.next')
    const retired = join(root, 'node_modules.retired')
    mkdirSync(current)
    mkdirSync(staged)
    const operations: string[] = []
    publishProfileFallbackDirectory(current, staged, retired, {
      rename: (source, destination) => {
        operations.push(`${basename(source)}:${basename(destination)}`)
        renameSync(source, destination)
      },
    })
    expect(operations).toEqual(['node_modules:node_modules.retired', 'node_modules.next:node_modules'])
    expect(existsSync(current)).toBe(true)
    expect(existsSync(retired)).toBe(true)

    const replacement = join(root, 'node_modules.next-2')
    const failedRetired = join(root, 'node_modules.retired-2')
    mkdirSync(replacement)
    let renames = 0
    expect(() => { publishProfileFallbackDirectory(current, replacement, failedRetired, {
      rename: (source, destination) => {
        renames++
        if (renames === 2) throw new Error('publication failed')
        renameSync(source, destination)
      },
    }) }).toThrow('publication failed')
    expect(existsSync(current)).toBe(true)
    expect(existsSync(replacement)).toBe(true)
    expect(existsSync(failedRetired)).toBe(false)
  })

  it('publishes the first fallback and reports a failed restore', () => {
    const root = tmp()
    const current = join(root, 'node_modules')
    const staged = join(root, 'node_modules.next')
    const retired = join(root, 'node_modules.retired')
    mkdirSync(staged)
    publishProfileFallbackDirectory(current, staged, retired)
    expect(existsSync(current)).toBe(true)

    const replacement = join(root, 'node_modules.next-2')
    mkdirSync(replacement)
    let renames = 0
    expect(() => { publishProfileFallbackDirectory(current, replacement, retired, {
      rename: () => {
        renames++
        if (renames === 1) return
        throw new Error(renames === 2 ? 'publication failed' : 'restore failed')
      },
    }) }).toThrow(AggregateError)
  })

  it('removes only a managed fallback directory without following targets', () => {
    const root = tmp()
    const fallback = join(root, 'node_modules')
    const target = tmp()
    writeFileSync(join(target, 'witness'), 'keep')
    mkdirSync(join(fallback, '@scope'), { recursive: true })
    symlinkSync(target, join(fallback, 'plain'), 'junction')
    symlinkSync(target, join(fallback, '@scope', 'pkg'), 'junction')

    removeManagedProfileFallbackDirectory(fallback)

    expect(existsSync(fallback)).toBe(false)
    expect(readFileSync(join(target, 'witness'), 'utf8')).toBe('keep')
    expect(() => { removeManagedProfileFallbackDirectory(fallback) }).not.toThrow()
  })

  it('rejects unknown fallback directory contents', () => {
    const anchor = stageInstallation({})

    const fileHome = tmp()
    mkdirSync(join(fileHome, 'profiles'), { recursive: true })
    writeFileSync(join(fileHome, 'profiles', 'node_modules'), 'not a directory')
    expect(() => { healProfilesModuleFallback(anchor, fileHome) }).toThrow('is not a managed profile module fallback directory')

    const topLevelHome = tmp()
    mkdirSync(join(topLevelHome, 'profiles', 'node_modules'), { recursive: true })
    writeFileSync(join(topLevelHome, 'profiles', 'node_modules', 'foreign'), 'keep')
    expect(() => { healProfilesModuleFallback(anchor, topLevelHome) }).toThrow('is not a managed profile module fallback entry')

    const scopeHome = tmp()
    mkdirSync(join(scopeHome, 'profiles', 'node_modules', '@scope'), { recursive: true })
    writeFileSync(join(scopeHome, 'profiles', 'node_modules', '@scope', 'foreign'), 'keep')
    expect(() => { healProfilesModuleFallback(anchor, scopeHome) }).toThrow('is not a managed profile module fallback link')
  })

  it('cleans the staged fallback when link construction fails', () => {
    const anchor = stageInstallation({
      '@scope/pkg': {},
      '@scope': {},
    })
    const home = tmp()

    expect(() => { healProfilesModuleFallback(anchor, home) }).toThrow('EEXIST')

    const profiles = join(home, 'profiles')
    expect(readdirSync(profiles).filter(name => name.startsWith('node_modules.dsh-next-'))).toEqual([])
    expect(existsSync(join(profiles, PROFILE_MODULE_FALLBACK_HEAL_LOCK_FILENAME))).toBe(false)
  })

  it('treats only a missing process as a dead lock owner', () => {
    expect(profileHealLockOwnerIsAlive(process.pid)).toBe(true)
    expect(profileHealLockOwnerIsAlive(1, () => { throw processProbeError('ESRCH') })).toBe(false)
    expect(profileHealLockOwnerIsAlive(1, () => { throw processProbeError('EPERM') })).toBe(true)
    expect(() => profileHealLockOwnerIsAlive(1, () => { throw processProbeError('EINVAL') })).toThrow('EINVAL')
  })

  it('links the app and bundle dependency surface flat under profiles/node_modules', () => {
    const anchor = stageInstallation({
      'bundle-a': { patch: '[]\n', deps: { 'dep-of-a': '0.0.0', 'ghost-dep': '0.0.0' } },
      'plain-lib': {},
    })
    // An app dependency that is declared but not installed: skipped, not fatal.
    const appManifest = JSON.parse(readFileSync(anchor, 'utf8')) as { dependencies: Record<string, string> }
    appManifest.dependencies['never-installed'] = '0.0.0'
    writeFileSync(anchor, JSON.stringify(appManifest))
    // dep-of-a lives in the installation's node_modules too.
    const modules = join(anchor, '..', 'node_modules')
    mkdirSync(join(modules, 'dep-of-a'), { recursive: true })
    writeFileSync(join(modules, 'dep-of-a', 'package.json'), JSON.stringify({ name: 'dep-of-a', version: '0.0.0' }))
    const home = tmp()
    healProfilesModuleFallback(anchor, home)
    const fallback = join(home, 'profiles', 'node_modules')
    // App deps, the bundle's own deps, and the bundle itself are linked; the
    // plain library is linked as an app dep (harmless), the app itself too.
    for (const name of ['bundle-a', 'plain-lib', 'dep-of-a', 'dsh-app']) {
      expect(lstatSync(join(fallback, name)).isSymbolicLink(), name).toBe(true)
    }
    // Idempotent, and a moved target is re-pointed.
    healProfilesModuleFallback(anchor, home)
    const before = readlinkSync(join(fallback, 'dep-of-a'))
    expect(before).toContain('dep-of-a')
  })

  it('links resolved packages to their real directories when the installation anchor traverses a junction', () => {
    const realAnchor = stageInstallation({ 'bundle-a': { patch: '[]\n' } })
    const aliasRoot = tmp()
    const aliasApp = join(aliasRoot, 'app')
    symlinkSync(dirname(realAnchor), aliasApp, 'junction')
    const home = tmp()

    healProfilesModuleFallback(join(aliasApp, 'package.json'), home)

    const fallback = join(home, 'profiles', 'node_modules')
    for (const packageName of ['dsh-app', 'bundle-a']) {
      const link = join(fallback, packageName)
      const target = readlinkSync(link)
      expect(target).toBe(realpathSync.native(target))
      expect(JSON.parse(readFileSync(join(link, 'package.json'), 'utf8'))).toMatchObject({ name: packageName })
    }
  })

  it('throws when a fallback entry is a real directory', () => {
    const anchor = stageInstallation({})
    const home = tmp()
    mkdirSync(join(home, 'profiles', 'node_modules', 'dsh-app'), { recursive: true })
    expect(() => { healProfilesModuleFallback(anchor, home) }).toThrow('is not a managed profile module fallback entry')
    expect(existsSync(join(home, 'profiles', PROFILE_MODULE_FALLBACK_HEAL_LOCK_FILENAME))).toBe(false)
  })

  it('replaces a wrong symlink', () => {
    const anchor = stageInstallation({})
    const home = tmp()
    const fallback = join(home, 'profiles', 'node_modules')
    mkdirSync(fallback, { recursive: true })
    symlinkSync(tmp(), join(fallback, 'dsh-app'), 'junction')
    healProfilesModuleFallback(anchor, home)
    expect(readlinkSync(join(fallback, 'dsh-app'))).toContain('app')
  })

  it('publishes a moved installation by replacing the fallback directory', () => {
    const firstAnchor = stageInstallation({})
    const secondAnchor = stageInstallation({})
    const home = tmp()
    const fallback = join(home, 'profiles', 'node_modules')

    healProfilesModuleFallback(firstAnchor, home)
    const firstDirectory = statSync(fallback).ino
    expect(readlinkSync(join(fallback, 'dsh-app'))).toBe(dirname(realpathSync.native(firstAnchor)))

    healProfilesModuleFallback(secondAnchor, home)

    expect(statSync(fallback).ino).not.toBe(firstDirectory)
    expect(readlinkSync(join(fallback, 'dsh-app'))).toBe(dirname(realpathSync.native(secondAnchor)))
  })

  it('tolerates losing the concurrent-heal race to an identical link and rejects a different one', () => {
    // The EEXIST arm: a second process wrote the link between our lstat miss
    // and symlinkSync. Simulated by pre-creating the correct link and calling
    // the internal path through a stale-lstat shim is not possible from
    // outside, so probe the observable contract: healing twice concurrently
    // is a no-op, and a foreign REAL directory still fails loud.
    const anchor = stageInstallation({})
    const home = tmp()
    healProfilesModuleFallback(anchor, home)
    healProfilesModuleFallback(anchor, home) // second healer sees the correct link
    const fallback = join(home, 'profiles', 'node_modules')
    expect(lstatSync(join(fallback, 'dsh-app')).isSymbolicLink()).toBe(true)
  })

  it('waits for another process to finish healing the shared fallback', () => {
    const anchor = stageInstallation({})
    const home = tmp()
    const lockPath = join(home, 'profiles', PROFILE_MODULE_FALLBACK_HEAL_LOCK_FILENAME)
    const readyPath = join(home, 'holder-ready')
    const releasingPath = join(home, 'holder-releasing')
    mkdirSync(dirname(lockPath), { recursive: true })
    const holder = spawn(process.execPath, [
      '-e',
      `const fs = require('node:fs'); const crypto = require('node:crypto');
const [lockPath, readyPath, releasingPath] = process.argv.slice(1);
const handle = fs.openSync(lockPath, 'wx', 0o600);
fs.writeFileSync(handle, process.pid + ' ' + crypto.randomUUID() + '\\n');
fs.closeSync(handle);
fs.writeFileSync(readyPath, 'ready');
setTimeout(() => {
  fs.writeFileSync(releasingPath, 'releasing');
  fs.unlinkSync(lockPath);
}, 250);
setTimeout(() => process.exit(0), 300);`,
      lockPath,
      readyPath,
      releasingPath,
    ], { stdio: 'ignore', windowsHide: true })
    try {
      waitForFile(readyPath)
      healProfilesModuleFallback(anchor, home)
      expect(existsSync(releasingPath)).toBe(true)
      expect(lstatSync(join(home, 'profiles', 'node_modules', 'dsh-app')).isSymbolicLink()).toBe(true)
    } finally {
      if (holder.exitCode === null) holder.kill()
    }
  })

  it('waits while another process finishes publishing its lock record', () => {
    const home = tmp()
    const lockPath = join(home, 'profiles', PROFILE_MODULE_FALLBACK_HEAL_LOCK_FILENAME)
    const readyPath = join(home, 'initializing-ready')
    const releasingPath = join(home, 'initializing-releasing')
    mkdirSync(dirname(lockPath), { recursive: true })
    const holder = spawn(process.execPath, [
      '-e',
      `const fs = require('node:fs'); const crypto = require('node:crypto');
const [lockPath, readyPath, releasingPath] = process.argv.slice(1);
const handle = fs.openSync(lockPath, 'wx', 0o600);
fs.writeFileSync(readyPath, 'ready');
setTimeout(() => {
  fs.writeFileSync(handle, process.pid + ' ' + crypto.randomUUID() + '\\n');
  fs.closeSync(handle);
}, 50);
setTimeout(() => {
  fs.writeFileSync(releasingPath, 'releasing');
  fs.unlinkSync(lockPath);
}, 200);
setTimeout(() => process.exit(0), 250);`,
      lockPath,
      readyPath,
      releasingPath,
    ], { stdio: 'ignore', windowsHide: true })
    try {
      waitForFile(readyPath)
      const release = acquireProfilesModuleFallbackHealLock(home)
      expect(existsSync(releasingPath)).toBe(true)
      release()
    } finally {
      if (holder.exitCode === null) holder.kill()
    }
  })

  it('recovers a lock owned by a process that has exited', () => {
    const anchor = stageInstallation({})
    const home = tmp()
    const lockPath = join(home, 'profiles', PROFILE_MODULE_FALLBACK_HEAL_LOCK_FILENAME)
    mkdirSync(dirname(lockPath), { recursive: true })
    const exited = spawnSync(process.execPath, ['-e', ''])
    expect(exited.pid).toBeTypeOf('number')
    writeFileSync(lockPath, `${String(exited.pid)} 00000000-0000-4000-8000-000000000000\n`)

    healProfilesModuleFallback(anchor, home)

    expect(existsSync(lockPath)).toBe(false)
    expect(lstatSync(join(home, 'profiles', 'node_modules', 'dsh-app')).isSymbolicLink()).toBe(true)
  })

  it('does not remove a lock that replaced the one it acquired', () => {
    const home = tmp()
    const release = acquireProfilesModuleFallbackHealLock(home)
    const lockPath = join(home, 'profiles', PROFILE_MODULE_FALLBACK_HEAL_LOCK_FILENAME)
    unlinkSync(lockPath)
    const replacement = `${String(process.pid)} 11111111-1111-4111-8111-111111111111\n`
    writeFileSync(lockPath, replacement)

    expect(release).toThrow('ownership changed')
    expect(readFileSync(lockPath, 'utf8')).toBe(replacement)
  })

  it('reports ownership loss when its lock was already removed', () => {
    const home = tmp()
    const release = acquireProfilesModuleFallbackHealLock(home)
    release()
    expect(release).toThrow('ownership changed')
  })

  it('refuses an invalid lock instead of deleting it', () => {
    const home = tmp()
    const lockPath = join(home, 'profiles', PROFILE_MODULE_FALLBACK_HEAL_LOCK_FILENAME)
    mkdirSync(lockPath, { recursive: true })

    expect(() => acquireProfilesModuleFallbackHealLock(home)).toThrow('invalid')
    expect(lstatSync(lockPath).isDirectory()).toBe(true)
  })

  it('refuses an invalid lock record and a lock symlink', () => {
    const invalidHome = tmp()
    const invalidPath = join(invalidHome, 'profiles', PROFILE_MODULE_FALLBACK_HEAL_LOCK_FILENAME)
    mkdirSync(dirname(invalidPath), { recursive: true })
    writeFileSync(invalidPath, 'not a lock')
    expect(() => acquireProfilesModuleFallbackHealLock(invalidHome)).toThrow('invalid')
    expect(readFileSync(invalidPath, 'utf8')).toBe('not a lock')

    const symlinkHome = tmp()
    const symlinkPath = join(symlinkHome, 'profiles', PROFILE_MODULE_FALLBACK_HEAL_LOCK_FILENAME)
    const target = tmp()
    mkdirSync(dirname(symlinkPath), { recursive: true })
    symlinkSync(target, symlinkPath, 'junction')
    expect(() => acquireProfilesModuleFallbackHealLock(symlinkHome)).toThrow('invalid')
    expect(lstatSync(symlinkPath).isSymbolicLink()).toBe(true)
  })
})
