import { describe, expect, it, vi } from 'vitest'
import type { DesktopUpdateState } from '../src/update-protocol.ts'
import { DESKTOP_UPDATE_CHANNELS, registerDesktopUpdateIpc } from '../src/update-ipc.ts'

class FakeIpcMain {
  readonly handlers = new Map<string, () => Promise<DesktopUpdateState> | DesktopUpdateState>()

  handle(channel: string, handler: () => Promise<DesktopUpdateState> | DesktopUpdateState): void {
    this.handlers.set(channel, handler)
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel)
  }
}

describe('registerDesktopUpdateIpc', () => {
  it('registers only the fixed command channels and broadcasts safe states', async () => {
    const state: DesktopUpdateState = Object.freeze({ phase: 'idle', currentVersion: '1.2.3' })
    let listener: ((next: DesktopUpdateState) => void) | undefined
    const controller = {
      getState: vi.fn(() => state),
      check: vi.fn(async () => ({ ...state, phase: 'up-to-date' as const })),
      download: vi.fn(async () => ({ ...state, phase: 'downloaded' as const, availableVersion: '1.3.0' })),
      install: vi.fn(async () => ({ ...state, phase: 'installing' as const, availableVersion: '1.3.0' })),
      subscribe: vi.fn((next: (value: DesktopUpdateState) => void) => {
        listener = next
        return vi.fn()
      }),
    }
    const ipcMain = new FakeIpcMain()
    const live = { isDestroyed: () => false, send: vi.fn() }
    const destroyed = { isDestroyed: () => true, send: vi.fn() }

    const dispose = registerDesktopUpdateIpc({ ipcMain, controller, windows: () => [live, destroyed] })

    expect([...ipcMain.handlers.keys()].sort()).toEqual([
      DESKTOP_UPDATE_CHANNELS.check,
      DESKTOP_UPDATE_CHANNELS.download,
      DESKTOP_UPDATE_CHANNELS.getState,
      DESKTOP_UPDATE_CHANNELS.install,
    ].sort())
    await expect(ipcMain.handlers.get(DESKTOP_UPDATE_CHANNELS.getState)!()).resolves.toEqual(state)
    await expect(ipcMain.handlers.get(DESKTOP_UPDATE_CHANNELS.check)!()).resolves.toMatchObject({ phase: 'up-to-date' })
    await expect(ipcMain.handlers.get(DESKTOP_UPDATE_CHANNELS.download)!()).resolves.toMatchObject({ phase: 'downloaded' })
    await expect(ipcMain.handlers.get(DESKTOP_UPDATE_CHANNELS.install)!()).resolves.toMatchObject({ phase: 'installing' })

    const available: DesktopUpdateState = Object.freeze({
      phase: 'available',
      currentVersion: '1.2.3',
      availableVersion: '1.3.0',
    })
    listener!(available)
    expect(live.send).toHaveBeenCalledWith(DESKTOP_UPDATE_CHANNELS.state, available)
    expect(destroyed.send).not.toHaveBeenCalled()

    dispose()
    expect(ipcMain.handlers.size).toBe(0)
  })
})
