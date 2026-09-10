import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  MemoryId, MemoryRecord, MemoryRemoteAddRequest, MemoryRemoteListRequest,
  MemoryRemoteRemoveRequest, MemoryRemoteSetEnabledRequest, MemoryRemoteUpdateRequest,
  MemoryRemoveResult, MemorySnapshot,
} from '@deepseek-ai/dsh-memory/types'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** Remote namespace consumed by the memory Settings page. */
export interface MemoryRemote {
  readonly list: (request: MemoryRemoteListRequest) => Promise<RemoteResult<MemorySnapshot>>
  readonly add: (request: MemoryRemoteAddRequest) => Promise<RemoteResult<MemoryRecord>>
  readonly update: (request: MemoryRemoteUpdateRequest) => Promise<RemoteResult<MemoryRecord>>
  readonly remove: (request: MemoryRemoteRemoveRequest) => Promise<RemoteResult<MemoryRemoveResult>>
  readonly setEnabled: (request: MemoryRemoteSetEnabledRequest) => Promise<RemoteResult<boolean>>
}

/** Current Settings-page memory projection. */
export interface MemorySettingsState {
  readonly status: 'idle' | 'loading' | 'error' | 'ready'
  readonly records: readonly MemoryRecord[]
  readonly enabled: boolean
  readonly operation: string | undefined
  readonly failure: string | undefined
}

const INITIAL: MemorySettingsState = {
  status: 'idle', records: [], enabled: true, operation: undefined, failure: undefined,
}

function remoteContext(cwd: string | undefined): { cwd?: string } {
  return cwd === undefined ? {} : { cwd }
}

/** Owns lazy Remote reads and optimistic-free mutation results for the page. */
export class MemorySettingsStore {
  /** Observable page state bound by the Settings renderer. */
  readonly store: SnapshotStore<MemorySettingsState> = createSnapshotStore(INITIAL)
  private loadToken = 0

  constructor(private readonly remote: MemoryRemote) {}

  /**
   * Load records visible to the selected project directory.
   * @param cwd - Active Session directory, or undefined for user-only records.
   */
  async load(cwd: string | undefined): Promise<void> {
    const token = ++this.loadToken
    const current = this.store.getSnapshot()
    this.store.set({ ...current, status: 'loading', failure: undefined })
    try {
      const result = await this.remote.list(remoteContext(cwd))
      if (token !== this.loadToken) return
      if (!result.ok) {
        this.store.set({ ...current, status: 'error', failure: result.error.message })
        return
      }
      this.store.set({
        status: 'ready', enabled: result.value.enabled, records: result.value.records,
        operation: undefined, failure: undefined,
      })
    } catch {
      if (token === this.loadToken) this.store.set({ ...current, status: 'error', failure: undefined })
    }
  }

  /**
   * Add one record and retain the last good snapshot on failure.
   * @param request - Scope and normalized durable content.
   * @param cwd - Active Session directory used for project scope.
   * @returns Whether the Host committed the record.
   */
  add(request: Pick<MemoryRemoteAddRequest, 'scope' | 'content'>, cwd: string | undefined): Promise<boolean> {
    return this.mutate('add', () => this.remote.add({ ...request, ...remoteContext(cwd) }), (state, record) => ({
      ...state, records: [...state.records, record],
    }))
  }

  /**
   * Replace one visible record.
   * @param id - Visible record id to update.
   * @param content - Replacement durable content.
   * @param cwd - Active Session directory used for project scope.
   * @returns Whether the Host committed the replacement.
   */
  update(id: MemoryId, content: string, cwd: string | undefined): Promise<boolean> {
    return this.mutate('update', () => this.remote.update({ id, content, ...remoteContext(cwd) }), (state, record) => ({
      ...state, records: state.records.map(current => current.id === record.id ? record : current),
    }))
  }

  /**
   * Remove one visible record.
   * @param id - Visible record id to remove.
   * @param cwd - Active Session directory used for project scope.
   * @returns Whether the Host committed the removal.
   */
  remove(id: MemoryId, cwd: string | undefined): Promise<boolean> {
    return this.mutate('remove', () => this.remote.remove({ id, ...remoteContext(cwd) }), state => ({
      ...state, records: state.records.filter(record => record.id !== id),
    }))
  }

  /**
   * Change whether records are injected into future model requests.
   * @param enabled - Requested memory-context enable state.
   * @param cwd - Active Session directory associated with the preference.
   * @returns Whether the Host committed the preference.
   */
  setEnabled(enabled: boolean, cwd: string | undefined): Promise<boolean> {
    return this.mutate('setEnabled', () => this.remote.setEnabled({ enabled, ...remoteContext(cwd) }), state => ({
      ...state, enabled,
    }))
  }

  private async mutate<T>(
    operation: string,
    run: () => Promise<RemoteResult<T>>,
    commit: (state: MemorySettingsState, value: T) => MemorySettingsState,
  ): Promise<boolean> {
    const current = this.store.getSnapshot()
    if (current.status !== 'ready' || current.operation !== undefined) return false
    this.store.set({ ...current, operation, failure: undefined })
    try {
      const result = await run()
      const latest = this.store.getSnapshot()
      if (!result.ok) {
        this.store.set({ ...current, operation: undefined, failure: result.error.message })
        return false
      }
      const ready = latest.status === 'ready' ? latest : current
      this.store.set({ ...commit(ready, result.value), operation: undefined, failure: undefined })
      return true
    } catch {
      this.store.set({ ...current, operation: undefined, failure: 'unavailable' })
      return false
    }
  }
}
