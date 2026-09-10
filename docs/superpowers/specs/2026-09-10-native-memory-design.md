# Native Memory Design

English | [中文](2026-09-10-native-memory-design.zh.md)

## Purpose

Oasisfish needs durable, inspectable memory without an external memory provider or a second model call. The active agent receives stable user and project facts, may maintain them through a model-facing tool, and can search prior session history through the existing session-query capability.

## Scope

Version 1 adds two durable scopes:

- `user` stores communication preferences and stable working habits across projects.
- `project` stores stable rules and environment facts for the current session `cwd` only.

The feature adds a provider-neutral `ctx.memory` Service Definition, a JSON-domain local provider, a `memory_manage` tool Consumer, and a Web Settings section. Existing `session_search` and `session_event_search` remain the only history-search tools.

The feature does not add semantic memory search, background extraction, cloud synchronization, message-vector indexing, automatic deletion, or imported Hermes file formats.

## Data Model

Each record contains an opaque branded id, scope, content, timestamps, and optional provenance:

```ts
type MemoryId = string & { readonly __brand: 'MemoryId' }
type SessionId = string & { readonly __brand: 'SessionId' }

interface MemoryRecord {
  id: MemoryId
  scope: 'user' | 'project'
  projectKey?: string
  projectLabel?: string
  content: string
  sourceSessionId?: SessionId
  createdAt: number
  updatedAt: number
}
```

`projectKey` is the SHA-256 digest of the normalized absolute `cwd`, encoded as lower-case hex. `projectLabel` is the path basename for Settings display only. Project records are unavailable when a session has no `cwd`. User records never carry project fields.

Every material mutation returns a complete immutable record. Update and remove require the current record id; updates preserve `createdAt` and advance `updatedAt` monotonically.

## Provider Contract

`ctx.memory` exposes `list`, `add`, `update`, and `remove`. Callers provide a `MemoryContext` containing the current `cwd`, optional source Session id, and optional cancellation signal. The Service Definition owns request and result types; the local provider owns persistence, validation, limits, deduplication, and project-key derivation.

The local provider stores one `native-memory.json` storage-domain unit. Mutations are serialized per effective scope. Records survive provider and process restarts. A duplicate normalized content string in the same effective scope is rejected; the same content may exist once globally and once in a project.

Deployment configuration requires these explicit limits:

- `maxUserItems: 80`
- `maxProjectItems: 120`
- `maxItemChars: 1200`
- `maxUserChars: 12000`
- `maxProjectChars: 18000`

Character limits count Unicode code points. Whitespace is trimmed and internal whitespace is preserved.

## Safety

The provider rejects content that resembles credentials or secret material, including private-key blocks, bearer tokens, common API-key assignments, password assignments, and long opaque token strings. It also rejects temporary filesystem paths, raw log dumps, and content that exceeds the configured limits. Diagnostics state the rejected category without echoing the submitted content.

Safety is enforced at the provider mutation boundary so Host RPC, model tools, and future Consumers cannot bypass it. Settings never returns hidden credential values because memory records cannot contain them.

## Model Experience

At the first accepted step of every turn, a memory context plugin reads user records plus records for the session `cwd`. It prepends one sourced `UserMessage` with plugin source `native-memory-context`. AgentLoop therefore commits the exact snapshot to the Session log before request derivation. A rejected or failed pre-step records nothing.

The snapshot contains only current records, grouped as `User preferences` and `Project memory`. Empty groups are omitted. When both groups are empty, no message is injected. Each new turn receives a fresh snapshot so Settings or tool mutations affect the next turn without retroactively changing prior requests.

The `memory_manage` tool supports `list`, `add`, `update`, and `remove`. The system-prompt guidance tells the model to save only durable, reusable facts; prefer project scope for repository facts; never store secrets, raw logs, transient task state, or facts already present; and use updates instead of accumulating contradictory entries. Tool results identify committed ids and scopes without narrating hidden implementation details.

Automatic memory uses the current conversation model choosing this tool. It does not invoke a reviewer, summarizer, or background model.

## Session History

The shipped standard agent preset includes the existing `tool-session-query`. The Web/desktop assembly changes `session-query-sqlite` from `:memory:` to `dshHomePath('session-search.sqlite')` with `openAt: first-search`. Searches remain workspace-authorized and return logged Session events; native memory does not copy search results into its own store unless the model explicitly calls `memory_manage`.

## Settings Experience

The Web client adds a `Memory` Settings section. Its Host half exposes typed Remote methods backed by `ctx.memory`: list effective user/project records, add, edit, remove, and read/update an `enabled` preference. The section provides an enable toggle, separate user/project groups, inline add/edit controls, and a delete confirmation. It shows validation failures without dropping the current draft.

Disabling memory suppresses record-snapshot injection but retains stored records, `memory_manage`, and Settings management. Re-enabling restores the next-turn injection.

## Errors

Expected business failures use stable codes: `MEMORY_INVALID_SCOPE`, `MEMORY_PROJECT_UNAVAILABLE`, `MEMORY_NOT_FOUND`, `MEMORY_DUPLICATE`, `MEMORY_ITEM_LIMIT`, `MEMORY_CHAR_LIMIT`, `MEMORY_CONTENT_REJECTED`, and `MEMORY_DISABLED`. Storage and lifecycle failures propagate as infrastructure errors.

## Verification

Unit tests cover types, project isolation, durability, concurrent mutations, duplicate detection, safety categories, exact limits, Unicode counting, update/remove semantics, enable state, tool schemas/results, injection timing, logging, and disposal. A Loader-composed keyless snapshot proves the standard agent receives the memory guidance, may call `memory_manage`, and observes the committed result. Client tests cover registration, loading, toggling, add/edit/delete, error retention, and locale changes.

The final verification runs focused coverage for the changed packages, the keyless snapshot, generated catalog checks, `typecheck`, `build`, `doc-sync`, desktop runtime staging tests, and `git diff --check`. No real model provider is called.
