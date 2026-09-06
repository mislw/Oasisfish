import { describe, expect, it, vi } from 'vitest'
import type { DesktopUpdateState } from '../src/update-protocol.ts'
import { DESKTOP_UPDATE_CHANNELS } from '../src/update-ipc.ts'
import { createOasisfishUpdateBridge } from '../src/preload-bridge.ts'

describe('createOasisfishUpdateBridge', () => {
  it('exposes only typed commands and a removable state subscription', async () => {
    const state: DesktopUpdateState = Object.freeze({ phase: 'idle', currentVersion: '1.2.3' })
    let eventListener: ((_event: unknown, next: DesktopUpdateState) => void) | undefined
    const ipcRenderer = {
      invoke: vi.fn<(channel: string) => Promise<DesktopUpdateState>>(async () => state),
      on: vi.fn((_channel: string, listener: (_event: unknown, next: DesktopUpdateState) => void) => {
        eventListener = listener
      }),
      removeListener: vi.fn(),
    }
    const bridge = createOasisfishUpdateBridge(ipcRenderer)

    expect(Object.keys(bridge).sort()).toEqual(['check', 'download', 'getState', 'install', 'subscribe'])
    await bridge.getState()
    await bridge.check()
    await bridge.download()
    await bridge.install()
    expect(ipcRenderer.invoke.mock.calls.map(call => call[0])).toEqual([
      DESKTOP_UPDATE_CHANNELS.getState,
      DESKTOP_UPDATE_CHANNELS.check,
      DESKTOP_UPDATE_CHANNELS.download,
      DESKTOP_UPDATE_CHANNELS.install,
    ])

    const listener = vi.fn()
    const dispose = bridge.subscribe(listener)
    eventListener!({}, state)
    expect(listener).toHaveBeenCalledWith(state)
    dispose()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(DESKTOP_UPDATE_CHANNELS.state, eventListener)
  })
})
