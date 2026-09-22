/** Real Desktop Wallpaper Engine startup, restart, Client cleanup, and recovery. */

import { lstat, mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadLayeredEnv, loadProfileDirectory } from '@deepseek-ai/dsh-app-boot'
import { JSDOM } from 'jsdom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { populateGlobal } from 'vitest/runtime'
import { runProfile } from '../../cli/src/profile-boot.ts'
import {
  DESKTOP_PROFILE_DEFAULT_BUNDLES,
  DESKTOP_WALLPAPER_BUNDLE,
  DesktopProjectManager,
  createPluginProfile,
  offerDesktopDefaultBundles,
} from '../src/project-manager.ts'
import { resolveDesktopPaths } from '../src/paths.ts'

const REPO_ROOT = process.cwd()
const SPEC_PATH = join(REPO_ROOT, 'apps/desktop/tests/wallpaper-engine.loader.spec.ts')
const OVERLAY = join(REPO_ROOT, 'apps/desktop/tests/wallpaper-engine.overlay.yml')
const DESKTOP_HOST_MANIFEST = join(REPO_ROOT, 'apps/desktop-host/package.json')
const UPSTREAM_CLIENT = 'dsh-plugin-wallpaper-engine'
const ONBOARDING_CLIENT = '@deepseek-ai/dsh-client-ui-wallpaper-engine-onboarding'
const SETTINGS_GENERAL_CLIENT = '@deepseek-ai/dsh-client-ui-settings-general'
const STYLE_SELECTOR = 'style[data-plugin="dsh-plugin-wallpaper-engine"]'
const CLIENT_RUNTIME_SPECIFIER = '@deepseek-ai/dsh-client-test-runtime/src/assembly/' + 'index.ts'
const CLIENT_ROSTER_SPECIFIER = '@deepseek-ai/dsh-client-test-runtime/src/assembly/' + 'roster.ts'
const ONBOARDING_CLIENT_SPECIFIER = '@deepseek-ai/dsh-client-ui-wallpaper-engine-onboarding/' + 'client'
const REMOTE_MOCK_SPECIFIER = '@deepseek-ai/dsh-' + 'remote-mock'
// Host typechecking must not pull Client-face source into tsconfig.host.json.
const { ClientRoster, TestClient, bundleRoster, remoteDefaultResponses } = await import(CLIENT_RUNTIME_SPECIFIER)
const { graphFromRoster } = await import(CLIENT_ROSTER_SPECIFIER)
const onboardingClient = await import(ONBOARDING_CLIENT_SPECIFIER)
const { RemoteMock } = await import(REMOTE_MOCK_SPECIFIER)
const realFetch = globalThis.fetch.bind(globalThis)
const running = new Set<RunningDesktop>()
const roots = new Set<string>()

type DesktopApplication = Awaited<ReturnType<typeof runProfile>>

interface ClientPluginModule {
  apply(...args: never[]): unknown
}

interface ClientRosterRow {
  readonly name: string
  readonly inject: readonly string[]
  readonly immediately: boolean
}

interface RunningDesktop {
  readonly application: DesktopApplication
  readonly launchUrl: string
}

interface AuthenticatedDesktop extends RunningDesktop {
  readonly origin: string
  readonly cookie: string
}

interface SlotEntry {
  readonly options: { readonly id?: string }
  readonly inject?: () => { probe(signal: AbortSignal): Promise<{ kind: string }> }
}

interface Slots {
  entries(name: string): readonly SlotEntry[]
}

function installDom(): () => void {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' })
  const { keys, originals } = populateGlobal(globalThis, dom.window, { bindFunctions: true })
  return () => {
    dom.window.close()
    for (const key of keys) Reflect.deleteProperty(globalThis, key)
    for (const [key, value] of originals) Reflect.set(globalThis, key, value)
  }
}

async function loadUpstreamClient(): Promise<ClientPluginModule> {
  const hostRequire = createRequire(DESKTOP_HOST_MANIFEST)
  const wrapperManifest = hostRequire.resolve('@deepseek-ai/dsh-desktop-wallpaper-engine/package.json')
  const clientPath = createRequire(wrapperManifest).resolve('dsh-plugin-wallpaper-engine/client')
  const clientRequire = createRequire(clientPath)
  let factory: ((require: (name: string) => unknown) => ClientPluginModule) | undefined
  const target = window as typeof window & {
    __ModuleLoader__?: { load(handoff: { id: string; factory: typeof factory }): void }
  }
  const previous = target.__ModuleLoader__
  target.__ModuleLoader__ = {
    load(handoff) {
      if (handoff.id !== UPSTREAM_CLIENT || handoff.factory === undefined) {
        throw new Error(`Unexpected Wallpaper Engine Client module ${handoff.id}`)
      }
      factory = handoff.factory
    },
  }
  try {
    await import(/* @vite-ignore */ `${pathToFileURL(clientPath).href}?desktop-wallpaper-engine-task-6`)
  } finally {
    if (previous === undefined) delete target.__ModuleLoader__
    else target.__ModuleLoader__ = previous
  }
  if (factory === undefined) throw new Error('Wallpaper Engine Client artifact did not register its module factory')
  return factory(name => clientRequire(name))
}

async function startDesktop(profileDir: string): Promise<AuthenticatedDesktop> {
  const profile = loadProfileDirectory('dsh desktop test', profileDir, DESKTOP_HOST_MANIFEST)
  const application = await runProfile({
    environment: loadLayeredEnv('dsh'),
    profile: 'desktop',
    resolutionMode: 'link',
    resolvedProfile: { profile, installAnchor: DESKTOP_HOST_MANIFEST },
    patchFiles: [OVERLAY],
    args: ['--no-open', '--host', '127.0.0.1', '--port', '0'],
  })
  const origin = `http://127.0.0.1:${String(application.ctx.webServer.port)}`
  const launchUrl = application.ctx.connection.authenticatedUrl(origin)
  const started: RunningDesktop = { application, launchUrl }
  running.add(started)
  const exchange = await realFetch(launchUrl, { redirect: 'manual' })
  expect(exchange.status).toBe(303)
  const setCookie = exchange.headers.get('set-cookie')
  if (setCookie === null) throw new Error('Desktop profile token exchange omitted Set-Cookie')
  return {
    ...started,
    origin: new URL(launchUrl).origin,
    cookie: setCookie.split(';', 1)[0]!,
  }
}

async function stopDesktop(desktop: RunningDesktop): Promise<void> {
  running.delete(desktop)
  await desktop.application.shutdown.shutdown(0)
}

async function route(desktop: AuthenticatedDesktop, path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  headers.set('cookie', desktop.cookie)
  return realFetch(`${desktop.origin}${path}`, { ...init, headers })
}

async function unlinkTreeLinks(path: string): Promise<void> {
  let stat
  try {
    stat = await lstat(path)
  } catch {
    return
  }
  if (stat.isSymbolicLink()) {
    await unlink(path)
    return
  }
  if (!stat.isDirectory()) return
  for (const name of await readdir(path)) await unlinkTreeLinks(join(path, name))
}

async function createDesktopProfile(profileDir: string): Promise<void> {
  createPluginProfile(profileDir)
  await offerDesktopDefaultBundles(profileDir, [DESKTOP_WALLPAPER_BUNDLE])
}

function clientRoster() {
  const roster = bundleRoster(DESKTOP_PROFILE_DEFAULT_BUNDLES, SPEC_PATH) as { rows: readonly ClientRosterRow[] }
  return ClientRoster.of(roster.rows.map((row: ClientRosterRow) => row.name === UPSTREAM_CLIENT
    ? { ...row, inject: [] }
    : row)).closure([UPSTREAM_CLIENT, ONBOARDING_CLIENT, SETTINGS_GENERAL_CLIENT])
}

afterEach(async () => {
  vi.unstubAllGlobals()
  for (const desktop of [...running]) {
    try {
      await stopDesktop(desktop)
    } catch {
      // The test failure owns the diagnostic; root cleanup below still removes its private state.
    }
  }
  for (const root of roots) {
    await unlinkTreeLinks(root)
    await rm(root, { recursive: true, force: true })
  }
  roots.clear()
})

describe('Desktop Wallpaper Engine real Loader lifecycle', () => {
  it('restores saved settings across restart and removes the integration during native recovery', { timeout: 240_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-wallpaper-'))
    roots.add(root)
    const dshHome = join(root, '.dsh')
    const userHome = join(root, 'user-home')
    const steamRoot = join(root, 'steam')
    const profileDir = resolveDesktopPaths(dshHome).profile
    vi.stubEnv('DSH_AGENTS_HOME', join(root, '.agents'))
    vi.stubEnv('DSH_HOME', dshHome)
    vi.stubEnv('DSH_TELEMETRY_DISABLED', '1')
    vi.stubEnv('DSH_WE_STEAM_ROOT', steamRoot)
    vi.stubEnv('HOME', userHome)
    vi.stubEnv('USERPROFILE', userHome)
    await mkdir(join(steamRoot, 'steamapps', 'common', 'wallpaper_engine'), { recursive: true })
    await writeFile(join(steamRoot, 'steamapps', 'common', 'wallpaper_engine', 'wallpaper32.exe'), '')
    await createDesktopProfile(profileDir)
    const defaultBundleStatePath = join(profileDir, 'desktop-default-bundles.json')
    const defaultBundleState = await readFile(defaultBundleStatePath, 'utf8')

    let desktop = await startDesktop(profileDir)
    let activeDesktop = desktop
    const browserRequests: string[] = []

    const initialSettings = await route(desktop, '/wallpaper-engine/settings')
    expect(initialSettings.status).toBe(200)
    expect(await initialSettings.json()).toMatchObject({ settings: null })
    const inventory = await route(desktop, '/wallpaper-engine/inventory')
    expect(inventory.status).toBe(200)
    expect(await inventory.json()).toMatchObject({ wallpapers: expect.any(Array), playlists: expect.any(Array) })

    const disposeDom = installDom()
    const browserFetch = globalThis.fetch
    globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
      const value = typeof input === 'string' || input instanceof URL ? String(input) : input.url
      const target = new URL(value, activeDesktop.origin)
      browserRequests.push(target.pathname)
      return route(activeDesktop, `${target.pathname}${target.search}`, init)
    }
    const mock = RemoteMock.create().load(remoteDefaultResponses)
    const client = await TestClient.start({
      roster: clientRoster(),
      provide: {
        [UPSTREAM_CLIENT]: await loadUpstreamClient(),
        [ONBOARDING_CLIENT]: onboardingClient,
      },
    }, mock)
    try {
      const slots = client.ctx.get('slots') as Slots
      await vi.waitFor(() => {
        expect(slots.entries('settings.section').map(entry => entry.options.id)).toContain('wallpaper-engine')
        expect(slots.entries('settings.onboarding').map(entry => entry.options.id)).toContain('wallpaper-engine-setup')
      })
      await vi.waitFor(() => {
        expect(browserRequests).toContain('/wallpaper-engine/settings')
        expect(browserRequests).toContain('/wallpaper-engine/inventory')
      })
      expect(document.querySelectorAll(STYLE_SELECTOR)).toHaveLength(1)
      const onboarding = slots.entries('settings.onboarding')
        .find(entry => entry.options.id === 'wallpaper-engine-setup')
      if (onboarding?.inject === undefined) throw new Error('Wallpaper Engine onboarding entry omitted its injected probe')
      await expect(onboarding.inject().probe(new AbortController().signal))
        .resolves.toEqual({ kind: 'setup-required' })

      const saved = await route(desktop, '/wallpaper-engine/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: '' }),
      })
      expect(saved.status).toBe(200)
      const savedBody = await saved.json() as { settings: Record<string, unknown> }
      expect(savedBody.settings).toMatchObject({ id: '' })
      await stopDesktop(desktop)

      desktop = await startDesktop(profileDir)
      activeDesktop = desktop
      const restored = await route(desktop, '/wallpaper-engine/settings')
      expect(restored.status).toBe(200)
      expect(await restored.json()).toMatchObject({ settings: savedBody.settings })
      await expect(onboarding.inject().probe(new AbortController().signal))
        .resolves.toEqual({ kind: 'configured' })

      const disabledRoster = clientRoster().without([UPSTREAM_CLIENT, ONBOARDING_CLIENT])
      const modules = client.ctx.loader.internal as {
        entries: { sync(graph: ReturnType<typeof graphFromRoster>): Promise<void> }
      }
      await modules.entries.sync(graphFromRoster(disabledRoster.rows))
      expect(document.querySelectorAll(STYLE_SELECTOR)).toHaveLength(0)
      expect(slots.entries('settings.section').map(entry => entry.options.id)).not.toContain('wallpaper-engine')
      expect(slots.entries('settings.onboarding').map(entry => entry.options.id)).not.toContain('wallpaper-engine-setup')
    } finally {
      await client.dispose()
      globalThis.fetch = browserFetch
      disposeDom()
    }

    const configPath = join(userHome, '.dsh-wallpaper-engine', 'config.json')
    const savedConfig = await readFile(configPath, 'utf8')
    await stopDesktop(desktop)
    const manager = new DesktopProjectManager(resolveDesktopPaths(dshHome), { dsh: join(root, 'unused-runtime') })
    await manager.disableAllPlugins()
    expect(await readFile(defaultBundleStatePath, 'utf8')).toBe(defaultBundleState)
    expect(await readFile(configPath, 'utf8')).toBe(savedConfig)

    desktop = await startDesktop(profileDir)
    expect((await route(desktop, '/wallpaper-engine/settings')).status).toBe(404)
    expect((await route(desktop, '/wallpaper-engine/inventory')).status).toBe(404)
    expect(await readFile(configPath, 'utf8')).toBe(savedConfig)
    await stopDesktop(desktop)
  })
})
