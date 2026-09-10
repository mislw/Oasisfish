# Agent Note: Native durable memory

Status: implemented

English | [中文](2026-09-10-native-memory.zh.md)

## Problem

Oasisfish could search prior Session logs, but it had no small durable store for stable user preferences and project facts. Repeating those facts in every conversation wasted attention, while copying arbitrary history into prompts would mix transient work, secrets, and unrelated projects.

## Decision

The Harness provides native durable memory as a complete plugin capability. `@deepseek-ai/dsh-memory` owns provider-neutral records, branded ids, typed operations, and the Host Remote. `@deepseek-ai/dsh-memory-local` persists one bounded `native_memory` storage-domain document. `@deepseek-ai/dsh-tool-memory` owns the model-facing `memory_manage` tool, fixed write policy, and per-turn context injection. The Web client exposes records through `@deepseek-ai/dsh-client-ui-settings-memory`.

Memory has two scopes. User records are visible across projects. Project records are keyed by the SHA-256 digest of the normalized absolute Session `cwd` and are unavailable without a `cwd`. Add and update reject duplicate content within the effective scope, enforce item and Unicode code-point budgets, and refuse credential-like content, temporary paths, and raw logs before persistence. Disabling memory preserves all records and management access while suppressing record-snapshot injection.

On the first accepted step of each turn, the tool Consumer reads a fresh snapshot and prepends enabled records as a sourced `UserMessage`. The source is `native-memory-context`, so AgentLoop appends the exact model-visible snapshot to the Session log before deriving the request. Later steps in that turn add no second snapshot. Tool or Settings mutations affect the next turn and never rewrite prior requests.

The current conversation model chooses explicit `memory_manage` writes. The Harness does not run a background extractor, summarizer, reviewer, or second model request. The existing `session_search` family remains responsible for workspace-authorized prior-session history; Web and desktop keep its derived SQLite index under the Harness home and open it on the first search.

## Verification

Service and provider tests cover provider lifecycle, project isolation, durable reopen, concurrent mutations, immutable results, duplicates, exact limits, Unicode counting, sensitive-content categories, monotonic updates, idempotent removal, and enablement. Tool tests cover schema actions, owner context, provenance, sourced first-step injection, disabled and empty states, rejection, and disposal. Browser tests cover section registration, loading, locale changes, toggling, grouped records, add, edit, removal, and retained drafts after failures.

A keyless Loader snapshot boots the real service, JSON storage, local Provider, Agent loop, and tool Consumer. Its deterministic conversation model stores one project record in the first turn, receives the committed tool result, and observes one logged `native-memory-context` message containing that record in the next turn.

## Alternatives considered

**Background extraction after every turn.** Rejected because it adds hidden model requests, latency, cost, failure handling, and uncertain deletion or conflict behavior. The active conversation model already has enough context to make an explicit tool call.

**Treat Session search as long-term memory.** Rejected because search returns historical events rather than a small maintained set of current facts. It remains useful for investigation, while native memory carries only explicit durable records.

**Store memory inside each Session log.** Rejected because global preferences would be duplicated and project records would require scanning unrelated logs. A separate bounded domain gives Settings one inspectable current state while model-visible snapshots remain logged.

**Use semantic vectors in version 1.** Rejected because the configured limits make exact scoped listing sufficient, and embeddings would add a provider, derived-index lifecycle, and another credential path before retrieval quality requires them.

## Consequences

- Oasisfish remembers stable user preferences globally and stable repository facts per Session working directory.
- Every model-visible memory snapshot is reconstructable from the Session log.
- Users can inspect, edit, delete, disable, and re-enable records without deleting data or editing configuration files.
- Pattern-based safety checks can reject benign text that resembles a secret or raw log; Settings reports the failure and retains the draft.
- Cross-window changes converge on the next page load or Session selection change; a dedicated revision event is deferred.
