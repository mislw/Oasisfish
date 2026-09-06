import type { DesktopUpdateState } from './update-protocol.ts'

/** Fixed IPC channels accepted by the desktop update bridge. */
export const DESKTOP_UPDATE_CHANNELS = Object.freeze({
  getState: 'oasisfish-update:get-state',
  check: 'oasisfish-update:check',
  download: 'oasisfish-update:download',
  install: 'oasisfish-update:install',
  state: 'oasisfish-update:state',
})

/** Controller operations exposed through the fixed IPC handlers. */
export interface DesktopUpdateIpcController {
  getState(): DesktopUpdateState
  check(): Promise<DesktopUpdateState>
  download(): Promise<DesktopUpdateState>
  install(): Promise<DesktopUpdateState>
  subscribe(listener: (state: DesktopUpdateState) => void): () => void
}

/** Electron IpcMain subset used by the update registration. */
export interface DesktopIpcMain {
  handle(channel: string, handler: () => Promise<DesktopUpdateState>): void
  removeHandler(channel: string): void
}

/** Browser-window messaging subset used by state broadcasts. */
export interface DesktopUpdateWebContents {
  isDestroyed(): boolean
  send(channel: string, state: DesktopUpdateState): void
}

/** Dependencies for the desktop update IPC registration. */
export interface DesktopUpdateIpcOptions {
  readonly ipcMain: DesktopIpcMain
  readonly controller: DesktopUpdateIpcController
  readonly windows: () => Iterable<DesktopUpdateWebContents>
}

/** Register the complete desktop update IPC allowlist and return its disposer. */
export function registerDesktopUpdateIpc(options: DesktopUpdateIpcOptions): () => void {
  const handlers = [
    [DESKTOP_UPDATE_CHANNELS.getState, async () => options.controller.getState()],
    [DESKTOP_UPDATE_CHANNELS.check, async () => options.controller.check()],
    [DESKTOP_UPDATE_CHANNELS.download, async () => options.controller.download()],
    [DESKTOP_UPDATE_CHANNELS.install, async () => options.controller.install()],
  ] as const
  for (const [channel, handler] of handlers) options.ipcMain.handle(channel, handler)

  const unsubscribe = options.controller.subscribe((state) => {
    for (const webContents of options.windows()) {
      if (!webContents.isDestroyed()) webContents.send(DESKTOP_UPDATE_CHANNELS.state, state)
    }
  })

  return () => {
    unsubscribe()
    for (const [channel] of handlers) options.ipcMain.removeHandler(channel)
  }
}
