import { OasisUiProgressStore } from './progress-store.ts'

/** Composer actions captured for one launcher invocation. */
export interface OasisUiInputActions {
  setDraft(text: string): void
  submit(): void
}

/** Active conversation state required by the workflow overlay. */
export interface OasisUiLaunchTarget {
  readonly sessionId: string
  readonly inputActions: OasisUiInputActions
  readonly draft: string
  readonly addFiles: (files: readonly File[]) => string | null
  readonly progress: OasisUiProgressStore
}

/** Launcher input before the session-scoped progress store is attached. */
export type OasisUiOpenTarget = Omit<OasisUiLaunchTarget, 'progress'>

/** Observable overlay visibility and its current conversation target. */
export interface OasisUiLauncherSnapshot {
  readonly open: boolean
  readonly target: OasisUiLaunchTarget | null
}

/** Process-local overlay state with one persisted progress store per session. */
export class OasisUiLauncherStore {
  private snapshot: OasisUiLauncherSnapshot = { open: false, target: null }
  private readonly listeners = new Set<() => void>()
  private readonly progressBySession = new Map<string, OasisUiProgressStore>()

  /**
   * Read the current overlay state.
   * @returns the current overlay snapshot.
   */
  readonly getSnapshot = (): OasisUiLauncherSnapshot => this.snapshot

  /**
   * Subscribe to overlay visibility changes.
   * @param listener - notified synchronously after a launcher state change.
   * @returns a disposer that removes the listener.
   */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Open the workflow for one conversation and reuse its progress store.
   * @param target - current composer actions, draft, and attachment intake.
   */
  open(target: OasisUiOpenTarget): void {
    let progress = this.progressBySession.get(target.sessionId)
    if (progress === undefined) {
      progress = new OasisUiProgressStore(target.sessionId)
      this.progressBySession.set(target.sessionId, progress)
    }
    this.snapshot = { open: true, target: { ...target, progress } }
    this.emit()
  }

  /** Close the workflow overlay without changing persisted progress. */
  close(): void {
    if (!this.snapshot.open && this.snapshot.target === null) return
    this.snapshot = { open: false, target: null }
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}
