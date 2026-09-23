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
const clientRuntime = await import(CLIENT_RUNTIME_SPECIFIER) as unknown as ClientRuntimeModule
const { ClientRoster, TestClient, bundleRoster, remoteDefaultResponses } = clientRuntime
const clientRosterModule = await import(CLIENT_ROSTER_SPECIFIER) as unknown as ClientRosterModule
const { graphFromRoster } = clientRosterModule
const onboardingClient = await import(ONBOARDING_CLIENT_SPECIFIER) as unknown as ClientPluginModule
const { RemoteMock } = await import(REMOTE_MOCK_SPECIFIER) as unknown as RemoteMockModule
const realFetch = globalThis.fetch.bind(globalThis)
const running = new Set<RunningDesktop>()
const roots = new Set<string>()
let upstreamClientLoad = 0
let upstreamReact: ReactModule | undefined
let upstreamReactDom: ReactDomModule | undefined
const ENV_RESTORATION_PROBE = 'DSH_DESKTOP_WALLPAPER_ENV_RESTORATION_PROBE'
const originalEnvRestorationProbe = process.env[ENV_RESTORATION_PROBE]

type DesktopApplication = Awaited<ReturnType<typeof runProfile>>

interface ClientPluginModule {
  apply(...args: never[]): unknown
}

interface ClientRosterHandle {
  readonly rows: readonly ClientRosterRow[]
  closure(names: readonly string[]): ClientRosterHandle
  without(names: readonly string[]): ClientRosterHandle
}

interface TestClientHandle {
  readonly ctx: {
    get(name: string): unknown
    readonly loader: { readonly internal: unknown }
  }
  dispose(): Promise<void>
}

interface RemoteMockHandle {
  load(table: unknown): RemoteMockHandle
}

interface ClientRuntimeModule {
  readonly ClientRoster: {
    readonly of: (rows: readonly ClientRosterRow[]) => ClientRosterHandle
  }
  readonly TestClient: {
    readonly start: (
      plan: { roster: ClientRosterHandle; provide?: Readonly<Record<string, unknown>> },
      mock: RemoteMockHandle,
    ) => Promise<TestClientHandle>
  }
  readonly bundleRoster: (bundles: readonly string[], anchor: string) => ClientRosterHandle
  readonly remoteDefaultResponses: unknown
}

interface ClientRosterModule {
  readonly graphFromRoster: (rows: readonly ClientRosterRow[]) => unknown
}

interface RemoteMockModule {
  readonly RemoteMock: {
    create(): RemoteMockHandle
  }
}

interface ReactModule {
  createElement(type: unknown): unknown
}

interface ReactRoot {
  render(node: unknown): void
  unmount(): void
}

interface ReactDomModule {
  createRoot(container: Element | DocumentFragment): ReactRoot
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
  readonly component: unknown
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

async function withClientBrowserEnvironment<T>(
  browserFetch: typeof globalThis.fetch,
  operation: () => Promise<T>,
): Promise<T> {
  const disposeDom = installDom()
  const previousFetch = globalThis.fetch
  globalThis.fetch = browserFetch
  try {
    return await operation()
  } finally {
    try {
      globalThis.fetch = previousFetch
    } finally {
      disposeDom()
    }
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
    await import(/* @vite-ignore */ `${pathToFileURL(clientPath).href}?desktop-wallpaper-engine-task-7-${String(++upstreamClientLoad)}`)
  } finally {
    if (previous === undefined) delete target.__ModuleLoader__
    else target.__ModuleLoader__ = previous
  }
  if (factory === undefined) throw new Error('Wallpaper Engine Client artifact did not register its module factory')
  const plugin = factory(name => clientRequire(name))
  upstreamReact = clientRequire('react') as ReactModule
  upstreamReactDom = clientRequire('react-dom/client') as ReactDomModule
  return plugin
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
  await desktop.application.shutdown.shutdown(0)
  running.delete(desktop)
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

function clientRoster(): ClientRosterHandle {
  const roster = bundleRoster(DESKTOP_PROFILE_DEFAULT_BUNDLES, SPEC_PATH)
  return ClientRoster.of(roster.rows.map((row: ClientRosterRow) => row.name === UPSTREAM_CLIENT
    ? { ...row, inject: [] }
    : row)).closure([UPSTREAM_CLIENT, ONBOARDING_CLIENT, SETTINGS_GENERAL_CLIENT])
}

async function cleanupResources(): Promise<void> {
  const errors: unknown[] = []
  for (const desktop of [...running]) {
    try {
      await stopDesktop(desktop)
    } catch (error) {
      errors.push(error)
    }
  }
  if (running.size === 0) {
    for (const root of [...roots]) {
      try {
        await unlinkTreeLinks(root)
        await rm(root, { recursive: true, force: true })
        roots.delete(root)
      } catch (error) {
        errors.push(error)
      }
    }
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) {
    throw new AggregateError(errors, 'Desktop Wallpaper Engine test cleanup failed')
  }
}

afterEach(async () => {
  try {
    await cleanupResources()
  } finally {
    try {
      vi.unstubAllGlobals()
    } finally {
      vi.unstubAllEnvs()
    }
  }
})

describe('Desktop Wallpaper Engine real Loader lifecycle', () => {
  it('restores stubbed environment variables after each test', () => {
    vi.stubEnv(ENV_RESTORATION_PROBE, 'stubbed-by-wallpaper-loader-test')
    expect(process.env[ENV_RESTORATION_PROBE]).toBe('stubbed-by-wallpaper-loader-test')
  })

  it('observes the original environment after the preceding test', () => {
    expect(process.env[ENV_RESTORATION_PROBE]).toBe(originalEnvRestorationProbe)
  })

  it('restores browser globals when Client startup fails', async () => {
    const previousDocument = globalThis.document
    const previousFetch = globalThis.fetch
    const startupError = new Error('simulated Client startup failure')

    await expect(withClientBrowserEnvironment(vi.fn(), async () => {
      throw startupError
    })).rejects.toBe(startupError)

    expect(globalThis.document).toBe(previousDocument)
    expect(globalThis.fetch).toBe(previousFetch)
  })

  it('does not resume Client startup after disposal', async () => {
    let resolveSettings: ((response: Response) => void) | undefined
    const settingsResponse = new Promise<Response>((resolve) => {
      resolveSettings = resolve
    })
    const requests: Array<{ method: string; path: string }> = []

    await withClientBrowserEnvironment(async (input, init) => {
      const value = typeof input === 'string' || input instanceof URL ? String(input) : input.url
      const target = new URL(value, 'http://localhost/')
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
      requests.push({ method, path: target.pathname })
      if (method === 'GET' && target.pathname === '/wallpaper-engine/settings') return settingsResponse
      throw new Error(`Unexpected Wallpaper Engine request ${method} ${target.pathname}`)
    }, async () => {
      const mock = RemoteMock.create().load(remoteDefaultResponses)
      const client = await TestClient.start({
        roster: clientRoster(),
        provide: {
          [UPSTREAM_CLIENT]: await loadUpstreamClient(),
          [ONBOARDING_CLIENT]: onboardingClient,
        },
      }, mock)
      expect(requests).toEqual([{ method: 'GET', path: '/wallpaper-engine/settings' }])
      expect(document.body.style.getPropertyValue('--we-glass-alpha')).not.toBe('')

      await client.dispose()
      expect(document.body.style.getPropertyValue('--we-glass-alpha')).toBe('')
      expect(document.body.hasAttribute('data-we-glass-window')).toBe(false)

      resolveSettings!(new Response(JSON.stringify({
        settings: {
          fontCustom: true,
          fontColor: '#123456',
          glassWindow: true,
        },
      }), { headers: { 'content-type': 'application/json' } }))
      await new Promise<void>(resolve => setTimeout(resolve, 0))

      expect(document.body.style.getPropertyValue('--we-glass-alpha')).toBe('')
      expect(document.body.hasAttribute('data-we-glass-window')).toBe(false)
      expect(document.getElementById('we-font-patch')).toBeNull()
      expect(requests).toEqual([{ method: 'GET', path: '/wallpaper-engine/settings' }])
    })
  })

  it('retains shutdown ownership until shutdown succeeds', async () => {
    const shutdownError = new Error('simulated desktop shutdown failure')
    let failShutdown = true
    const desktop = {
      application: {
        shutdown: {
          shutdown: vi.fn(async () => {
            if (failShutdown) throw shutdownError
          }),
        },
      },
      launchUrl: 'http://desktop.invalid/',
    } as unknown as RunningDesktop
    running.add(desktop)

    await expect(stopDesktop(desktop)).rejects.toBe(shutdownError)
    const retained = running.has(desktop)
    failShutdown = false
    if (!retained) running.add(desktop)

    expect(retained).toBe(true)
  })

  it('surfaces cleanup failures and preserves roots owned by a live desktop', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-wallpaper-cleanup-'))
    const marker = join(root, 'marker.txt')
    await writeFile(marker, 'owned')
    roots.add(root)
    const shutdownError = new Error('simulated cleanup shutdown failure')
    let failShutdown = true
    const desktop = {
      application: {
        shutdown: {
          shutdown: vi.fn(async () => {
            if (failShutdown) throw shutdownError
          }),
        },
      },
      launchUrl: 'http://desktop.invalid/',
    } as unknown as RunningDesktop
    running.add(desktop)

    await expect(cleanupResources()).rejects.toBe(shutdownError)
    expect(running.has(desktop)).toBe(true)
    await expect(readFile(marker, 'utf8')).resolves.toBe('owned')

    failShutdown = false
    await cleanupResources()
    expect(running.has(desktop)).toBe(false)
    expect(roots.has(root)).toBe(false)
    await expect(readFile(marker, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

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
    const browserRequests: Array<{ method: string; path: string }> = []
    const browserRequestSettlements: Promise<void>[] = []

    const initialSettings = await route(desktop, '/wallpaper-engine/settings')
    expect(initialSettings.status).toBe(200)
    expect(await initialSettings.json()).toMatchObject({ settings: null })
    const inventory = await route(desktop, '/wallpaper-engine/inventory')
    expect(inventory.status).toBe(200)
    const inventoryBody = await inventory.json() as { wallpapers: unknown; playlists: unknown }
    expect(Array.isArray(inventoryBody.wallpapers)).toBe(true)
    expect(Array.isArray(inventoryBody.playlists)).toBe(true)

    const routedBrowserFetch = (input: string | URL | Request, init?: RequestInit) => {
      const value = typeof input === 'string' || input instanceof URL ? String(input) : input.url
      const target = new URL(value, activeDesktop.origin)
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
      browserRequests.push({ method, path: target.pathname })
      const response = route(activeDesktop, `${target.pathname}${target.search}`, init)
      browserRequestSettlements.push(response.then(() => undefined))
      return response
    }
    await withClientBrowserEnvironment(routedBrowserFetch, async () => {
      const mock = RemoteMock.create().load(remoteDefaultResponses)
      const persistFlushes: Array<() => void> = []
      const browserWindow = document.defaultView
      if (browserWindow === null) throw new Error('Wallpaper Engine Client test omitted its browser window')
      const browserSetTimeout = browserWindow.setTimeout.bind(browserWindow)
      const persistTimerSpy = vi.spyOn(browserWindow, 'setTimeout').mockImplementation((handler, timeout, ...args) => {
        if (timeout === 200 && typeof handler === 'function' && handler.name === 'flushPersist') {
          persistFlushes.push(() => { handler(...args) })
          return browserSetTimeout(() => undefined, 0) as unknown as ReturnType<typeof globalThis.setTimeout>
        }
        return browserSetTimeout(handler, timeout, ...args) as unknown as ReturnType<typeof globalThis.setTimeout>
      })
      let settingsRoot: ReactRoot | undefined
      let client: TestClientHandle | undefined
      try {
        client = await TestClient.start({
          roster: clientRoster(),
          provide: {
            [UPSTREAM_CLIENT]: await loadUpstreamClient(),
            [ONBOARDING_CLIENT]: onboardingClient,
          },
        }, mock)
        let slots = client.ctx.get('slots') as Slots
        await vi.waitFor(() => {
          expect(slots.entries('settings.section').map(entry => entry.options.id)).toContain('wallpaper-engine')
          expect(slots.entries('settings.onboarding').map(entry => entry.options.id)).toContain('wallpaper-engine-setup')
        })
        await vi.waitFor(() => {
          expect(browserRequests).toContainEqual({ method: 'GET', path: '/wallpaper-engine/settings' })
          expect(browserRequests).toContainEqual({ method: 'GET', path: '/wallpaper-engine/inventory' })
        })
        await Promise.all(browserRequestSettlements.splice(0))
        await new Promise<void>(resolve => browserSetTimeout(resolve, 0))
        expect(persistFlushes).toEqual([])
        const settingsAfterBoot = await route(desktop, '/wallpaper-engine/settings')
        expect(settingsAfterBoot.status).toBe(200)
        expect(await settingsAfterBoot.json()).toMatchObject({ settings: null })
        expect(document.querySelectorAll(STYLE_SELECTOR)).toHaveLength(1)
        const settings = slots.entries('settings.section')
          .find(entry => entry.options.id === 'wallpaper-engine')
        if (settings === undefined || upstreamReact === undefined || upstreamReactDom === undefined) {
          throw new Error('Wallpaper Engine settings section omitted its render runtime')
        }
        const settingsHost = document.body.appendChild(document.createElement('div'))
        settingsRoot = upstreamReactDom.createRoot(settingsHost)
        settingsRoot.render(upstreamReact.createElement(settings.component))
        let refresh: HTMLButtonElement | undefined
        await vi.waitFor(() => {
          refresh = [...settingsHost.querySelectorAll('button')]
            .find(button => button.textContent === '刷新')
          expect(refresh).toBeDefined()
        })
        const inventoryLoadsBeforeRefresh = browserRequests
          .filter(request => request.method === 'GET' && request.path === '/wallpaper-engine/inventory').length
        refresh!.click()
        await vi.waitFor(() => {
          expect(browserRequests.filter(request => (
            request.method === 'GET' && request.path === '/wallpaper-engine/inventory'
          ))).toHaveLength(inventoryLoadsBeforeRefresh + 1)
        })
        await Promise.all(browserRequestSettlements.splice(0))
        await new Promise<void>(resolve => browserSetTimeout(resolve, 0))
        expect(persistFlushes).toEqual([])
        const settingsAfterRefresh = await route(desktop, '/wallpaper-engine/settings')
        expect(settingsAfterRefresh.status).toBe(200)
        expect(await settingsAfterRefresh.json()).toMatchObject({ settings: null })
        settingsRoot.unmount()
        settingsRoot = undefined
        persistTimerSpy.mockRestore()
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
        browserRequests.length = 0
        await client.dispose()
        client = undefined
        client = await TestClient.start({
          roster: clientRoster(),
          provide: {
            [UPSTREAM_CLIENT]: await loadUpstreamClient(),
            [ONBOARDING_CLIENT]: onboardingClient,
          },
        }, mock)
        slots = client.ctx.get('slots') as Slots
        await vi.waitFor(() => {
          expect(browserRequests).toContainEqual({ method: 'GET', path: '/wallpaper-engine/settings' })
          expect(browserRequests).toContainEqual({ method: 'GET', path: '/wallpaper-engine/inventory' })
        })
        await Promise.all(browserRequestSettlements.splice(0))
        await new Promise<void>(resolve => browserSetTimeout(resolve, 0))
        await vi.waitFor(() => {
          expect(browserRequests).toContainEqual({ method: 'PUT', path: '/wallpaper-engine/settings' })
        })
        await Promise.all(browserRequestSettlements.splice(0))
        const restored = await route(desktop, '/wallpaper-engine/settings')
        expect(restored.status).toBe(200)
        expect(await restored.json()).toMatchObject({
          settings: { ...savedBody.settings, rotationSeeded: true },
        })
        await expect(onboarding.inject().probe(new AbortController().signal))
          .resolves.toEqual({ kind: 'configured' })

        const disabledRoster = clientRoster().without([UPSTREAM_CLIENT, ONBOARDING_CLIENT])
        const modules = client.ctx.loader.internal as {
          entries: { sync(graph: unknown): Promise<void> }
        }
        await modules.entries.sync(graphFromRoster(disabledRoster.rows))
        expect(document.querySelectorAll(STYLE_SELECTOR)).toHaveLength(0)
        expect(slots.entries('settings.section').map(entry => entry.options.id)).not.toContain('wallpaper-engine')
        expect(slots.entries('settings.onboarding').map(entry => entry.options.id)).not.toContain('wallpaper-engine-setup')
      } finally {
        try {
          settingsRoot?.unmount()
          await client?.dispose()
        } finally {
          persistTimerSpy.mockRestore()
        }
      }
    })

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
