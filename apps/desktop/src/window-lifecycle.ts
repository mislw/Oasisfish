/** A BrowserWindow subset used by the desktop window lifecycle policy. */
export interface DesktopWindowHandle {
  focus(): void
  hide(): void
  isDestroyed(): boolean
  isMinimized(): boolean
  restore(): void
  show(): void
}

/** A BrowserWindow event whose default action may be cancelled. */
export interface PreventableWindowEvent {
  preventDefault(): void
}

/** Dependencies for the desktop window lifecycle policy. */
export interface WindowLifecycleOptions {
  readonly window: DesktopWindowHandle
  readonly confirmCloseToBackground: () => Promise<boolean>
  readonly quit: () => void
}

/** Window actions shared by title-bar controls and the system tray. */
export interface WindowLifecycle {
  handleClose(event: PreventableWindowEvent): Promise<void>
  handleMinimize(): void
  requestQuit(): void
  showWindow(): void
}

/** A system-tray menu item understood by Electron's menu builder. */
export interface TrayMenuEntry {
  readonly click?: () => void
  readonly label?: string
  readonly type?: 'separator'
}

/**
 * Builds the system-tray commands for reopening or explicitly exiting Oasisfish.
 *
 * @param lifecycle Window actions owned by the desktop lifecycle policy.
 * @returns the ordered system-tray menu entries.
 */
export function createTrayMenuTemplate(lifecycle: WindowLifecycle): TrayMenuEntry[] {
  return [
    { label: '打开 Oasisfish', click: () => { lifecycle.showWindow() } },
    { type: 'separator' },
    { label: '退出 Oasisfish', click: () => { lifecycle.requestQuit() } },
  ]
}

/**
 * Dispatches the private parent-process command used by packaged smoke tests.
 *
 * @param message Value received from Node.js process IPC.
 * @param lifecycle Desktop lifecycle that owns the normal quit path.
 * @returns whether the message was the supported command.
 */
export function handleParentControlMessage(message: unknown, lifecycle: WindowLifecycle): boolean {
  if (
    typeof message !== 'object'
    || message === null
    || Array.isArray(message)
    || Object.keys(message).length !== 1
    || (message as Record<string, unknown>).type !== 'oasisfish.quit'
  ) return false

  lifecycle.requestQuit()
  return true
}

/**
 * Keeps title-bar actions resident in the tray while reserving process exit for
 * the explicit tray command.
 *
 * @param options BrowserWindow operations, close confirmation, and quit request.
 * @returns handlers for the BrowserWindow and system tray.
 */
export function createWindowLifecycle(options: WindowLifecycleOptions): WindowLifecycle {
  let quitRequested = false
  let closeConfirmation: Promise<void> | undefined

  return {
    handleMinimize() {
      options.window.hide()
    },
    handleClose(event) {
      if (quitRequested) return Promise.resolve()
      event.preventDefault()
      closeConfirmation ??= options.confirmCloseToBackground()
        .then((confirmed) => {
          if (confirmed && !quitRequested && !options.window.isDestroyed()) options.window.hide()
        })
        .finally(() => {
          closeConfirmation = undefined
        })
      return closeConfirmation
    },
    requestQuit() {
      quitRequested = true
      options.quit()
    },
    showWindow() {
      if (options.window.isDestroyed()) return
      if (options.window.isMinimized()) options.window.restore()
      options.window.show()
      options.window.focus()
    },
  }
}
