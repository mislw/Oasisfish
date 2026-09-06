import { describe, expect, it, vi } from 'vitest'
import { DesktopUpdateStore } from '../src/client/store.ts'
import type { DesktopUpdateState, OasisfishUpdateBridge } from '../src/protocol.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function bridge(overrides: Partial<OasisfishUpdateBridge> = {}) {
  let listener: ((state: DesktopUpdateState) => void) | undefined
  const unsubscribe = vi.fn()
  const idle: DesktopUpdateState = { phase: 'idle', currentVersion: '1.2.3' }
  const upToDate: DesktopUpdateState = { phase: 'up-to-date', currentVersion: '1.2.3' }
  const downloaded: DesktopUpdateState = {
    phase: 'downloaded',
    currentVersion: '1.2.3',
    availableVersion: '1.3.0',
  }
  const installing: DesktopUpdateState = {
    phase: 'installing',
    currentVersion: '1.2.3',
    availableVersion: '1.3.0',
  }
  const getState = vi.fn(async () => idle)
  const check = vi.fn(async () => upToDate)
  const download = vi.fn(async () => downloaded)
  const install = vi.fn(async () => installing)
  const subscribe = vi.fn((next: (state: DesktopUpdateState) => void) => { listener = next; return unsubscribe })
  const value = {
    getState,
    check,
    download,
    install,
    subscribe,
    ...overrides,
  } satisfies OasisfishUpdateBridge
  return { value, getState, check, download, install, subscribe, unsubscribe, push: (state: DesktopUpdateState) => { listener?.(state) } }
}

describe('DesktopUpdateStore', () => {
  it('loads once per active read and accepts pushed state', async () => {
    const pending = deferred<DesktopUpdateState>()
    const getState = vi.fn(() => pending.promise)
    const b = bridge({ getState })
    const store = new DesktopUpdateStore(b.value)

    const first = store.load()
    const second = store.load()
    expect(first).toBe(second)
    expect(getState).toHaveBeenCalledOnce()
    pending.resolve({ phase: 'idle', currentVersion: '1.2.3' })
    await first
    expect(store.store.getSnapshot()).toEqual({
      status: 'ready',
      update: { phase: 'idle', currentVersion: '1.2.3' },
    })

    b.push({ phase: 'available', currentVersion: '1.2.3', availableVersion: '1.3.0' })
    expect(store.store.getSnapshot()).toEqual({
      status: 'ready',
      update: { phase: 'available', currentVersion: '1.2.3', availableVersion: '1.3.0' },
    })
    store.dispose()
    expect(b.unsubscribe).toHaveBeenCalledOnce()
  })

  it('can retry after an initial state read fails', async () => {
    const idle: DesktopUpdateState = { phase: 'idle', currentVersion: '1.2.3' }
    const getState = vi.fn()
      .mockRejectedValueOnce(new Error('ipc failed'))
      .mockResolvedValueOnce(idle)
    const b = bridge({ getState })
    const store = new DesktopUpdateStore(b.value)

    await store.load()
    expect(store.store.getSnapshot()).toEqual({ status: 'error' })
    await store.load()
    expect(store.store.getSnapshot()).toEqual({
      status: 'ready',
      update: { phase: 'idle', currentVersion: '1.2.3' },
    })
  })

  it('forwards each explicit command and publishes its returned state', async () => {
    const b = bridge()
    const store = new DesktopUpdateStore(b.value)

    await store.check()
    expect(store.store.getSnapshot()).toEqual({
      status: 'ready',
      update: { phase: 'up-to-date', currentVersion: '1.2.3' },
    })
    await store.download()
    expect(store.store.getSnapshot()).toMatchObject({ status: 'ready', update: { phase: 'downloaded' } })
    await store.install()
    expect(store.store.getSnapshot()).toMatchObject({ status: 'ready', update: { phase: 'installing' } })
    expect(b.check).toHaveBeenCalledOnce()
    expect(b.download).toHaveBeenCalledOnce()
    expect(b.install).toHaveBeenCalledOnce()
  })

  it('projects a rejected command as a renderer-safe local error', async () => {
    const b = bridge({ check: vi.fn(async () => { throw new Error('C:\\private\\token.txt') }) })
    const store = new DesktopUpdateStore(b.value)

    await store.check()

    expect(store.store.getSnapshot()).toEqual({ status: 'error' })
  })
})
