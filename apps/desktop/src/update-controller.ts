import type { DesktopUpdateState } from './update-protocol.ts'

/** Update metadata consumed from electron-updater events. */
export interface UpdaterInfo {
  readonly version: string
}

/** Download metadata consumed from electron-updater events. */
export interface UpdaterProgress {
  readonly percent?: number
  readonly transferred: number
  readonly total?: number
  readonly bytesPerSecond?: number
}

/** Minimal updater operations used by the desktop controller. */
export interface UpdaterFacade {
  allowPrerelease: boolean
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  on(event: 'update-available' | 'update-not-available' | 'update-downloaded', listener: (info: UpdaterInfo) => void): this
  on(event: 'download-progress', listener: (progress: UpdaterProgress) => void): this
  on(event: 'error', listener: (error: Error) => void): this
}

/** Runtime facts and install callback owned by the Electron main process. */
export interface DesktopUpdateControllerOptions {
  readonly updater: UpdaterFacade
  readonly currentVersion: string
  readonly isPackaged: boolean
  readonly install: (targetVersion: string) => void | Promise<void>
}

/** Owns manual update state without exposing updater internals to the renderer. */
export class DesktopUpdateController {
  readonly #listeners = new Set<(state: DesktopUpdateState) => void>()
  readonly #options: DesktopUpdateControllerOptions
  #inFlight: Promise<DesktopUpdateState> | undefined
  #state: DesktopUpdateState

  constructor(options: DesktopUpdateControllerOptions) {
    this.#options = options
    options.updater.autoDownload = false
    options.updater.autoInstallOnAppQuit = false
    options.updater.allowPrerelease = options.currentVersion.includes('-')
    this.#state = Object.freeze({
      phase: options.isPackaged ? 'idle' : 'unsupported',
      currentVersion: options.currentVersion,
    })
    options.updater.on('update-available', (info) => {
      this.#publish({ phase: 'available', availableVersion: info.version })
    })
    options.updater.on('update-not-available', () => {
      this.#publish({ phase: 'up-to-date' })
    })
    options.updater.on('download-progress', (progress) => {
      const frozenProgress = Object.freeze({
        ...progress.percent === undefined ? {} : { percent: progress.percent },
        transferred: progress.transferred,
        ...progress.total === undefined ? {} : { total: progress.total },
        ...progress.bytesPerSecond === undefined ? {} : { bytesPerSecond: progress.bytesPerSecond },
      })
      this.#publish({
        phase: 'downloading',
        ...this.#state.availableVersion === undefined ? {} : { availableVersion: this.#state.availableVersion },
        progress: frozenProgress,
      })
    })
    options.updater.on('update-downloaded', (info) => {
      this.#publish({ phase: 'downloaded', availableVersion: info.version })
    })
    options.updater.on('error', () => {
      this.#publishError()
    })
  }

  /** Return the current immutable renderer-safe state. */
  getState(): DesktopUpdateState {
    return this.#state
  }

  /** Subscribe to committed state changes. */
  subscribe(listener: (state: DesktopUpdateState) => void): () => void {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /** Check the configured release provider after an explicit user command. */
  check(): Promise<DesktopUpdateState> {
    if (this.#state.phase === 'unsupported') return Promise.resolve(this.#state)
    if (this.#inFlight !== undefined) return this.#inFlight
    if (!['idle', 'up-to-date', 'available', 'error'].includes(this.#state.phase)) {
      return Promise.reject(new Error(`Cannot check for updates while state is ${this.#state.phase}.`))
    }
    return this.#run(async () => {
      this.#publish({ phase: 'checking' })
      await this.#options.updater.checkForUpdates()
      return this.#state
    })
  }

  /** Download the available installer after an explicit user command. */
  download(): Promise<DesktopUpdateState> {
    if (this.#inFlight !== undefined) return this.#inFlight
    const availableVersion = this.#state.availableVersion
    if (this.#state.phase !== 'available' || availableVersion === undefined) {
      return Promise.reject(new Error('An available update is required before it can be downloaded.'))
    }
    return this.#run(async () => {
      this.#publish({
        phase: 'downloading',
        availableVersion,
        progress: Object.freeze({ transferred: 0 }),
      })
      await this.#options.updater.downloadUpdate()
      return this.#state
    })
  }

  /** Begin installation only after electron-updater has validated the download. */
  install(): Promise<DesktopUpdateState> {
    if (this.#inFlight !== undefined) return this.#inFlight
    const availableVersion = this.#state.availableVersion
    if (this.#state.phase !== 'downloaded' || availableVersion === undefined) {
      return Promise.reject(new Error('A downloaded update is required before installation.'))
    }
    return this.#run(async () => {
      this.#publish({
        phase: 'installing',
        availableVersion,
      })
      await this.#options.install(availableVersion)
      return this.#state
    })
  }

  #publish(next: Omit<DesktopUpdateState, 'currentVersion'>): void {
    this.#state = Object.freeze({
      ...next,
      currentVersion: this.#options.currentVersion,
    })
    for (const listener of this.#listeners) listener(this.#state)
  }

  #publishError(): void {
    this.#publish({
      phase: 'error',
      ...this.#state.availableVersion === undefined ? {} : { availableVersion: this.#state.availableVersion },
      message: 'Unable to complete the update. Try again.',
    })
  }

  #run(operation: () => Promise<DesktopUpdateState>): Promise<DesktopUpdateState> {
    const result = operation()
      .catch(() => {
        this.#publishError()
        return this.#state
      })
      .finally(() => {
        this.#inFlight = undefined
      })
    this.#inFlight = result
    return result
  }
}
