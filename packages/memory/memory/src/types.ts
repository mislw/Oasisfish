/** Public request and result vocabulary for durable memory. @module @deepseek-ai/dsh-memory/types */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Opaque identifier of one durable memory record. */
export type MemoryId = Branded<'MemoryId'>

/** Durable memory visibility. */
export type MemoryScope = 'user' | 'project'

/** Caller identity used to resolve project scope and provenance. */
export interface MemoryContext {
  /** Absolute working directory of the current Session. */
  readonly cwd?: string
  /** Session that requested a material mutation. */
  readonly sourceSessionId?: SessionId
  /** Cooperative cancellation signal. */
  readonly signal?: AbortSignal
}

/** One immutable durable memory record. */
export interface MemoryRecord {
  readonly id: MemoryId
  readonly scope: MemoryScope
  readonly projectKey?: string
  readonly projectLabel?: string
  readonly content: string
  readonly sourceSessionId?: SessionId
  readonly createdAt: number
  readonly updatedAt: number
}

/** Current effective records and enable state. */
export interface MemorySnapshot {
  readonly enabled: boolean
  readonly records: readonly MemoryRecord[]
}

/** Create one record in the selected scope. */
export interface MemoryAddRequest {
  readonly scope: MemoryScope
  readonly content: string
}

/** Replace the content of one visible record. */
export interface MemoryUpdateRequest {
  readonly id: MemoryId
  readonly content: string
}

/** Remove one visible record. */
export interface MemoryRemoveRequest {
  readonly id: MemoryId
}

/** Idempotent remove result. */
export interface MemoryRemoveResult {
  readonly id: MemoryId
  readonly absent: true
}

/** Browser management context supplied by the active Settings page. */
export interface MemoryRemoteContext {
  /** Absolute working directory of the selected Session, when available. */
  readonly cwd?: string
}

/** Remote request for listing records visible to the selected Session. */
export interface MemoryRemoteListRequest extends MemoryRemoteContext {}

/** Remote request for creating one durable record. */
export interface MemoryRemoteAddRequest extends MemoryAddRequest, MemoryRemoteContext {}

/** Remote request for replacing one durable record. */
export interface MemoryRemoteUpdateRequest extends MemoryUpdateRequest, MemoryRemoteContext {}

/** Remote request for removing one durable record. */
export interface MemoryRemoteRemoveRequest extends MemoryRemoveRequest, MemoryRemoteContext {}

/** Remote request for changing memory context injection. */
export interface MemoryRemoteSetEnabledRequest extends MemoryRemoteContext {
  /** Whether future model requests receive durable memory snapshots. */
  readonly enabled: boolean
}

/** Backend contract implemented by one registered memory provider. */
export interface MemoryProvider {
  readonly list: (context: MemoryContext) => Promise<MemorySnapshot>
  readonly add: (request: MemoryAddRequest, context: MemoryContext) => Promise<MemoryRecord>
  readonly update: (request: MemoryUpdateRequest, context: MemoryContext) => Promise<MemoryRecord>
  readonly remove: (request: MemoryRemoveRequest, context: MemoryContext) => Promise<MemoryRemoveResult>
  readonly setEnabled: (enabled: boolean, context: MemoryContext) => Promise<boolean>
}

/** Stable memory failure categories. */
export type MemoryErrorCode =
  | 'MEMORY_PROVIDER_UNAVAILABLE'
  | 'MEMORY_DUPLICATE_PROVIDER'
  | 'MEMORY_INVALID_SCOPE'
  | 'MEMORY_PROJECT_UNAVAILABLE'
  | 'MEMORY_NOT_FOUND'
  | 'MEMORY_DUPLICATE'
  | 'MEMORY_ITEM_LIMIT'
  | 'MEMORY_CHAR_LIMIT'
  | 'MEMORY_CONTENT_REJECTED'
  | 'MEMORY_DISABLED'

/** Structured durable-memory failure. */
export class MemoryError extends Error {
  /**
   * @param code - Stable failure category.
   * @param message - Diagnostic that does not echo rejected sensitive content.
   * @param options - Optional native error options.
   */
  constructor(readonly code: MemoryErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MemoryError'
  }
}
