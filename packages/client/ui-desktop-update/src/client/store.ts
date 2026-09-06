import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { DesktopUpdateState, OasisfishUpdateBridge } from '../protocol.ts'

/** Settings-page projection of the Electron update bridge. */
export type DesktopUpdateViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly update: DesktopUpdateState }
  | { readonly status: 'error' }

/** Owns renderer update state and forwards only explicit user commands. */
export class DesktopUpdateStore {
  /** Observable Settings projection consumed by the update section. */
  readonly store: SnapshotStore<DesktopUpdateViewState> = createSnapshotStore({ status: 'loading' })
  readonly #bridge: OasisfishUpdateBridge
  readonly #unsubscribe: () => void
  #load: Promise<void> | undefined

  constructor(bridge: OasisfishUpdateBridge) {
    this.#bridge = bridge
    this.#unsubscribe = bridge.subscribe((update) => {
      this.store.set({ status: 'ready', update })
    })
  }

  /** Read the current updater state when the Settings section first mounts. */
  load(): Promise<void> {
    if (this.#load !== undefined) return this.#load
    const pending = this.#bridge.getState().then(
      (update) => { this.store.set({ status: 'ready', update }) },
      () => { this.store.set({ status: 'error' }) },
    ).finally(() => { this.#load = undefined })
    this.#load = pending
    return pending
  }

  /** Request a provider check after a user click. */
  check(): Promise<void> {
    return this.#command(() => this.#bridge.check())
  }

  /** Download the available release after a user click. */
  download(): Promise<void> {
    return this.#command(() => this.#bridge.download())
  }

  /** Restart into the validated installer after a user click. */
  install(): Promise<void> {
    return this.#command(() => this.#bridge.install())
  }

  /** Stop listening when the browser plugin unloads. */
  dispose(): void {
    this.#unsubscribe()
  }

  async #command(command: () => Promise<DesktopUpdateState>): Promise<void> {
    try {
      this.store.set({ status: 'ready', update: await command() })
    } catch {
      this.store.set({ status: 'error' })
    }
  }
}
