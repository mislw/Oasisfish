# 原生记忆

[English](memory.md) | 中文

原生记忆子系统保存由对话模型明确选择、或由用户在 Settings 中编辑的简短持久事实。用户记录全局可见。项目记录仅在 Session 具有工作目录时可见，并使用其规范化项目标识。[dsh-memory](../../packages/memory/memory) 定义与提供方无关的服务，[dsh-memory-local](../../packages/memory/memory-local) 持久化一个带版本的存储域值，[dsh-tool-memory](../../packages/memory/tool-memory) 提供面向模型的管理与上下文注入。

## 记录与作用域

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

项目标识由规范化的 Session `cwd` 派生，调用方不能直接提供项目 key。没有 `cwd` 的项目操作以 `MEMORY_PROJECT_UNAVAILABLE` 失败。关闭记忆会保留已存记录，并停止后续上下文注入；它不会删除数据。

## 操作

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

本地提供方在提交原子存储更新前校验容量、重复内容、项目可见性与疑似密钥的内容。诊断不会回显被拒绝的敏感内容。

## 失败

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

服务只接受一个提供方。缺少提供方或重复注册都会明确失败；当目标记录不在调用方有效的“用户记录加项目记录”视图中时，记录变更也会失败。

## 模型上下文

在每轮第一个被接受的 step，工具插件读取有效快照。当记忆已启用且存在记录时，它注入一条带来源的 `native-memory-context` 用户消息。该消息在模型请求前追加到 Session 日志，因此每个模型可见的记忆快照都能从持久事件重建。模型将记忆作为上下文使用，写入仍需显式调用 `memory_manage` 工具。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
