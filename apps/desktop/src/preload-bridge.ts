import type { DesktopUpdateState } from './update-protocol.ts'
import { DESKTOP_UPDATE_CHANNELS } from './update-ipc.ts'

/** IpcRenderer subset required by the sandboxed update bridge. */
export interface DesktopIpcRenderer {
  invoke(channel: string): Promise<DesktopUpdateState>
  on(channel: string, listener: (event: unknown, state: DesktopUpdateState) => void): void
  removeListener(channel: string, listener: (event: unknown, state: DesktopUpdateState) => void): void
}

/** Methods exposed as `window.oasisfishUpdate` by the Electron preload. */
export interface OasisfishUpdateBridge {
  getState(): Promise<DesktopUpdateState>
  check(): Promise<DesktopUpdateState>
  download(): Promise<DesktopUpdateState>
  install(): Promise<DesktopUpdateState>
  subscribe(listener: (state: DesktopUpdateState) => void): () => void
}

/** Build the fixed renderer API without exposing Electron's generic IPC object. */
export function createOasisfishUpdateBridge(ipcRenderer: DesktopIpcRenderer): OasisfishUpdateBridge {
  return Object.freeze({
    getState: () => ipcRenderer.invoke(DESKTOP_UPDATE_CHANNELS.getState),
    check: () => ipcRenderer.invoke(DESKTOP_UPDATE_CHANNELS.check),
    download: () => ipcRenderer.invoke(DESKTOP_UPDATE_CHANNELS.download),
    install: () => ipcRenderer.invoke(DESKTOP_UPDATE_CHANNELS.install),
    subscribe(listener: (state: DesktopUpdateState) => void) {
      const receive = (_event: unknown, state: DesktopUpdateState): void => { listener(state) }
      ipcRenderer.on(DESKTOP_UPDATE_CHANNELS.state, receive)
      return () => { ipcRenderer.removeListener(DESKTOP_UPDATE_CHANNELS.state, receive) }
    },
  })
}
