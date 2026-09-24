---
description: "Provider-neutral durable memory (ctx.memory) for hosts and maintainers composing, calling, or debugging user- and project-scoped records."
kind: "package-reference"
---

# @deepseek-ai/dsh-memory

English | [中文](README.zh.md)

## Summary

Use this package when Providers and consumers need one API for durable user and project notes. Callers can list visible records, add or replace content, remove records idempotently, and change the effective enable state without knowing which backend persists them. One effect-owned Provider serves each process; absent or duplicate registration fails with a stable `MemoryError` code. Cancellation rejects before dispatch or before a queued local write begins, without exposing the abort reason.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the Service Definition, then mount exactly one Provider such as [`@deepseek-ai/dsh-memory-local`](../memory-local/README.md); the service alone rejects operations because no durable backend is registered.

### When to choose it

Choose this package when several host consumers need the same immutable records and failure categories while persistence policy remains replaceable. Skip it when a feature owns only ephemeral process state, or when its data belongs in the Session event log rather than non-session storage.

### Minimal configuration

The Service Definition has no configuration:

```yaml
- name: '@deepseek-ai/dsh-memory'
```

A Provider registers on `ctx.memory` from its own composition row. Registering a second Provider fails with `MEMORY_DUPLICATE_PROVIDER`; disposing the contributing fiber releases the slot, and operations without a Provider fail with `MEMORY_PROVIDER_UNAVAILABLE`.

### Scope, mutation, and cancellation

User records are visible in every caller context. Project records are visible only when their stored project identity matches the caller's normalized `cwd`; creating project memory without a working directory fails with `MEMORY_PROJECT_UNAVAILABLE`. Every returned record and snapshot is immutable, remove is idempotent, and an aborted operation rejects with a sanitized `AbortError` before the Provider starts new durable work.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals - click to expand</summary>

`MemoryService` owns one Provider registration and delegates the five public operations after checking cancellation. The Service Definition owns requests, results, branded `MemoryId` values, Remote management methods, and stable errors; Providers own storage, capacity, and content policy, while consumers own rendering and model-visible behavior.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Service entry, Provider registration, cancellation, and Remote methods |
| [`src/types.ts`](src/types.ts) | Records, requests, results, Provider interface, branded id, and `MemoryError` |
| - | No runtime invariant companion is published; provider presence and uniqueness are enforced synchronously by `MemoryService`, and registration disposal is owned by the contributing effect. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Memory package map](../README.md) - the Service Definition and local Provider split.
- [Local memory Provider](../memory-local/README.md) - bounded persistence and content policy.
- [Capability seams](../../../docs/capability-seams.md) - Service Definition, Provider, and Consumer ownership.
- [Session package](../../core/session/README.md) - owns the branded Session id stored as mutation source metadata.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through consumers that select records and own all model-visible rendering; this package registers no tools, prompts, or Session events.

#### KV Cache effect

None directly; a consumer owns any request-prefix change and cache invalidation.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

This limit defines when composition needs another Provider-selection mechanism.

- **One Provider per process** - registering a second Provider fails instead of selecting one implicitly; provider selection remains deferred until two production backends exist.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers - click to expand</summary>

None.

</details>
