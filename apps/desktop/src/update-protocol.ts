/** Renderer-safe phases published by the desktop update controller. */
export type DesktopUpdatePhase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'unsupported'
  | 'error'

/** Download counters projected without provider or filesystem details. */
export interface DesktopUpdateProgress {
  readonly percent?: number
  readonly transferred: number
  readonly total?: number
  readonly bytesPerSecond?: number
}

/** Immutable update state sent from Electron to the renderer. */
export interface DesktopUpdateState {
  readonly phase: DesktopUpdatePhase
  readonly currentVersion: string
  readonly availableVersion?: string
  readonly progress?: DesktopUpdateProgress
  readonly message?: string
}
