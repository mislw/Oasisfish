import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  OASIS_UI_STAGES, type OasisUiLaunchRequest, type OasisUiMode, type OasisUiSource,
} from './workflow.ts'

/** User-confirmed lifecycle state for one workflow stage. */
export type OasisUiProgressStatus = 'ready' | 'awaiting_confirmation' | 'complete'

/** Persisted workflow state isolated by conversation session. */
export interface OasisUiProgressState {
  readonly mode: OasisUiMode | null
  readonly currentStage: number
  readonly status: OasisUiProgressStatus
  readonly taskName: string
  readonly request: OasisUiLaunchRequest | null
}

const INITIAL_PROGRESS: OasisUiProgressState = {
  mode: null,
  currentStage: 0,
  status: 'ready',
  taskName: '',
  request: null,
}

/** Session-scoped workflow progress persisted in browser localStorage. */
export class OasisUiProgressStore {
  private readonly store: SnapshotStore<OasisUiProgressState>

  constructor(sessionId: string) {
    this.store = createSnapshotStore(INITIAL_PROGRESS, {
      persist: { name: `dsh.oasis-ui.workflow.${sessionId}` },
    })
    if (!isProgressState(this.store.getSnapshot())) this.store.set(INITIAL_PROGRESS)
  }

  /**
   * Read the current workflow progress.
   * @returns the current persisted progress snapshot.
   */
  readonly getSnapshot = (): OasisUiProgressState => this.store.getSnapshot()

  /**
   * Subscribe to progress changes.
   * @param listener - notified synchronously after a state change.
   * @returns a disposer that removes the listener.
   */
  readonly subscribe = (listener: () => void): (() => void) => this.store.subscribe(listener)

  /**
   * Select the interaction mode before the first stage starts.
   * @param mode - text-guided or full desktop input.
   */
  selectMode(mode: OasisUiMode): void {
    const current = this.store.getSnapshot()
    if (current.status !== 'ready' || current.currentStage !== 0 || current.request !== null) return
    this.store.set({ ...current, mode })
  }

  /**
   * Mark the current stage as submitted and awaiting user confirmation.
   * @param request - required task context for the first stage; later stages reuse it.
   */
  startStage(request?: OasisUiLaunchRequest): void {
    const current = this.store.getSnapshot()
    if (current.mode === null || current.status !== 'ready') return
    if (current.currentStage === 0 && request === undefined) return
    const storedRequest = request ?? current.request
    if (storedRequest === null) return
    this.store.set({
      ...current,
      status: 'awaiting_confirmation',
      taskName: storedRequest.pageName.trim(),
      request: storedRequest,
    })
  }

  /** Confirm the submitted stage and unlock the next stage or complete the workflow. */
  confirmStage(): void {
    const current = this.store.getSnapshot()
    if (current.status !== 'awaiting_confirmation') return
    if (current.currentStage === OASIS_UI_STAGES.length - 1) {
      this.store.set({ ...current, status: 'complete' })
      return
    }
    this.store.set({ ...current, currentStage: current.currentStage + 1, status: 'ready' })
  }

  /** Reset this conversation to the initial mode-selection state. */
  reset(): void {
    this.store.set(INITIAL_PROGRESS)
  }
}

function isProgressState(value: unknown): value is OasisUiProgressState {
  if (typeof value !== 'object' || value === null) return false
  const state = value as Partial<OasisUiProgressState>
  return (state.mode === null || state.mode === 'text' || state.mode === 'desktop')
    && typeof state.currentStage === 'number'
    && Number.isInteger(state.currentStage)
    && state.currentStage >= 0
    && state.currentStage < OASIS_UI_STAGES.length
    && (state.status === 'ready' || state.status === 'awaiting_confirmation' || state.status === 'complete')
    && typeof state.taskName === 'string'
    && (state.request === null || isLaunchRequest(state.request))
}

function isLaunchRequest(value: unknown): value is OasisUiLaunchRequest {
  if (typeof value !== 'object' || value === null) return false
  const request = value as Partial<OasisUiLaunchRequest>
  return isSource(request.source)
    && typeof request.pageName === 'string'
    && typeof request.purpose === 'string'
    && typeof request.references === 'string'
    && typeof request.constraints === 'string'
}

function isSource(value: unknown): value is OasisUiSource {
  return value === 'generate' || value === 'existing' || value === 'continue'
}
