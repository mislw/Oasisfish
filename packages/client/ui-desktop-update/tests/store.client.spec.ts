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
  const value: OasisfishUpdateBridge = {
    getState: vi.fn(async () => ({ phase: 'idle', currentVersion: '1.2.3' })),
    check: vi.fn(async () => ({ phase: 'up-to-date', currentVersion: '1.2.3' })),
    download: vi.fn(async () => ({ phase: 'downloaded', currentVersion: '1.2.3', availableVersion: '1.3.0' })),
    install: vi.fn(async () => ({ phase: 'installing', currentVersion: '1.2.3', availableVersion: '1.3.0' })),
    subscribe: vi.fn((next) => { listener = next; return unsubscribe }),
    ...overrides,
  }
  return { value, unsubscribe, push: (state: DesktopUpdateState) => { listener?.(state) } }
}

describe('DesktopUpdateStore', () => {
  it('loads once per active read and accepts pushed state', async () => {
    const pending = deferred<DesktopUpdateState>()
    const b = bridge({ getState: vi.fn(() => pending.promise) })
    const store = new DesktopUpdateStore(b.value)

    const first = store.load()
    const second = store.load()
    expect(first).toBe(second)
    expect(b.value.getState).toHaveBeenCalledOnce()
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
    const getState = vi.fn()
      .mockRejectedValueOnce(new Error('ipc failed'))
      .mockResolvedValueOnce({ phase: 'idle', currentVersion: '1.2.3' })
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
    expect(b.value.check).toHaveBeenCalledOnce()
    expect(b.value.download).toHaveBeenCalledOnce()
    expect(b.value.install).toHaveBeenCalledOnce()
  })

  it('projects a rejected command as a renderer-safe local error', async () => {
    const b = bridge({ check: vi.fn(async () => { throw new Error('C:\\private\\token.txt') }) })
    const store = new DesktopUpdateStore(b.value)

    await store.check()

    expect(store.store.getSnapshot()).toEqual({ status: 'error' })
  })
})
