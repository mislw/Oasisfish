# Native Memory

English | [中文](memory.zh.md)

The native-memory subsystem stores short durable facts chosen explicitly by the conversation model or edited by the user in Settings. User records are global. Project records are visible only when a Session has a working directory and use its normalized project identity. [dsh-memory](../../packages/memory/memory) defines the provider-neutral service, [dsh-memory-local](../../packages/memory/memory-local) persists one versioned storage-domain value, and [dsh-tool-memory](../../packages/memory/tool-memory) supplies model-facing management and context injection.

## Records and Scope

```ts type-equiv
/** Opaque identifier of one durable memory record. */
type MemoryId = Branded<'MemoryId'>
```

```ts type-equiv
/** Durable memory visibility. */
type MemoryScope = 'user' | 'project'
```

```ts type-equiv
/** Caller identity used to resolve project scope and provenance. */
interface MemoryContext {
  /** Absolute working directory of the current Session. */
  readonly cwd?: string
  /** Session that requested a material mutation. */
  readonly sourceSessionId?: SessionId
  /** Cooperative cancellation signal. */
  readonly signal?: AbortSignal
}
```

```ts type-equiv
/** One immutable durable memory record. */
interface MemoryRecord {
  readonly id: MemoryId
  readonly scope: MemoryScope
  readonly projectKey?: string
  readonly projectLabel?: string
  readonly content: string
  readonly sourceSessionId?: SessionId
  readonly createdAt: number
  readonly updatedAt: number
}
```

```ts type-equiv
/** Current effective records and enable state. */
interface MemorySnapshot {
  readonly enabled: boolean
  readonly records: readonly MemoryRecord[]
}
```

Project identity is derived from the normalized Session `cwd`; callers never provide a project key directly. A project operation without `cwd` fails with `MEMORY_PROJECT_UNAVAILABLE`. Disabling memory preserves stored records and stops future context injection; it does not delete data.

## Operations

```ts type-equiv
/** Create one record in the selected scope. */
interface MemoryAddRequest {
  readonly scope: MemoryScope
  readonly content: string
}
```

```ts type-equiv
/** Replace the content of one visible record. */
interface MemoryUpdateRequest {
  readonly id: MemoryId
  readonly content: string
}
```

```ts type-equiv
/** Remove one visible record. */
interface MemoryRemoveRequest {
  readonly id: MemoryId
}
```

```ts type-equiv
/** Idempotent remove result. */
interface MemoryRemoveResult {
  readonly id: MemoryId
  readonly absent: true
}
```

```ts type-equiv
/** Backend contract implemented by one registered memory provider. */
interface MemoryProvider {
  readonly list: (context: MemoryContext) => Promise<MemorySnapshot>
  readonly add: (request: MemoryAddRequest, context: MemoryContext) => Promise<MemoryRecord>
  readonly update: (request: MemoryUpdateRequest, context: MemoryContext) => Promise<MemoryRecord>
  readonly remove: (request: MemoryRemoveRequest, context: MemoryContext) => Promise<MemoryRemoveResult>
  readonly setEnabled: (enabled: boolean, context: MemoryContext) => Promise<boolean>
}
```

The local provider validates capacity, duplicate content, project visibility, and secret-like content before committing an atomic storage update. It never echoes rejected sensitive content in diagnostics.

## Failures

```ts type-equiv
/** Stable memory failure categories. */
type MemoryErrorCode =
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
```

The service accepts exactly one provider. Missing or duplicate providers fail explicitly, and record mutations fail when the target is not visible in the caller's effective user-plus-project view.

## Model Context

On the first accepted step of each turn, the tool plugin reads the effective snapshot. When memory is enabled and records exist, it injects a sourced `native-memory-context` user message. That message is appended to the Session log before the model request, so every model-visible memory snapshot is reconstructable from durable events. The model receives memory as context, while writes remain explicit `memory_manage` tool calls.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxmemory--memoryservice"></a>

### `ctx.memory` — `MemoryService`

Routes memory operations to the one active provider.

```ts cordis-catalog
/**
 * Register the sole provider for this service instance.
 * @param provider - Backend that owns persistence and validation.
 * @returns An async disposer that removes this provider registration.
 */
registerProvider(provider: MemoryProvider): () => Promise<void>

/**
 * List records visible to one caller context.
 * @param context - Project and provenance context used to select records.
 * @returns The effective enable state and visible immutable records.
 */
async list(context: MemoryContext): Promise<MemorySnapshot>

/**
 * Add one record through the active provider.
 * @param request - Scope and durable content to store.
 * @param context - Project and provenance context for the write.
 * @returns The committed immutable record.
 */
async add(request: MemoryAddRequest, context: MemoryContext): Promise<MemoryRecord>

/**
 * Update one visible record through the active provider.
 * @param request - Visible record id and replacement content.
 * @param context - Project and provenance context for the write.
 * @returns The committed immutable record.
 */
async update(request: MemoryUpdateRequest, context: MemoryContext): Promise<MemoryRecord>

/**
 * Remove one visible record through the active provider.
 * @param request - Visible record id to remove.
 * @param context - Project and provenance context for the write.
 * @returns The idempotent removal result.
 */
async remove(request: MemoryRemoveRequest, context: MemoryContext): Promise<MemoryRemoveResult>

/**
 * Change whether memory affects model requests.
 * @param enabled - Whether later turns receive memory context snapshots.
 * @param context - Project context associated with this preference update.
 * @returns The committed enable state.
 */
async setEnabled(enabled: boolean, context: MemoryContext): Promise<boolean>

/**
 * List records visible to the Session selected by the Settings page.
 * @param request - Optional selected Session working directory.
 * @returns The effective enable state and visible immutable records.
 */
@Remote('list') async listRemote(request: MemoryRemoteListRequest): Promise<MemorySnapshot>

/**
 * Add one record from the Settings page without model provenance.
 * @param request - Scope, content, and optional selected Session directory.
 * @returns The committed immutable record.
 */
@Remote('add') async addRemote(request: MemoryRemoteAddRequest): Promise<MemoryRecord>

/**
 * Update one visible record from the Settings page.
 * @param request - Record id, replacement content, and optional Session directory.
 * @returns The committed immutable record.
 */
@Remote('update') async updateRemote(request: MemoryRemoteUpdateRequest): Promise<MemoryRecord>

/**
 * Remove one visible record from the Settings page.
 * @param request - Record id and optional selected Session directory.
 * @returns The idempotent removal result.
 */
@Remote('removeRecord') async removeRemote(request: MemoryRemoteRemoveRequest): Promise<MemoryRemoveResult>

/**
 * Enable or disable memory context injection from the Settings page.
 * @param request - Enable state and optional selected Session directory.
 * @returns The committed enable state.
 */
@Remote('setEnabled') async setEnabledRemote(request: MemoryRemoteSetEnabledRequest): Promise<boolean>
```

Source: [`packages/memory/memory/src/index.ts`](../../packages/memory/memory/src/index.ts)
<!-- END GENERATED cordis-surface -->
