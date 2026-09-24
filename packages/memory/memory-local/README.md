---
description: "Local native_memory storage provider for hosts and maintainers configuring, sizing, or debugging bounded durable user and project records."
kind: "package-reference"
---

# @deepseek-ai/dsh-memory-local

English | [中文](README.zh.md)

## Summary

Use this package to persist bounded user and project notes through the `native_memory` storage domain. It derives project identity from normalized working directories, serializes mutations, and commits enablement plus records as one atomic global document. Duplicate content, capacity overflow, credential-like text, temporary paths, and raw log dumps are rejected before durability. Cancellation stops queued work before its write begins, while disposal unregisters the Provider and waits for already-started writes and domain close to settle.

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

Mount a storage backend and domain facility before the memory Service Definition and this Provider. The following composition stores `native_memory.json` below the configured private storage root:

```yaml
- name: '@deepseek-ai/dsh-storage'
- name: '@deepseek-ai/dsh-storage-json'
  config:
    root: /var/lib/dsh/data
- name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: json
- name: '@deepseek-ai/dsh-memory'
- name: '@deepseek-ai/dsh-memory-local'
```

### Capacity configuration

Limits count Unicode code points after surrounding whitespace is removed. User totals are global; project totals apply independently to each normalized project identity.

| Field | Default | Meaning |
|---|---:|---|
| `maxUserItems` | `80` | Maximum user records |
| `maxProjectItems` | `120` | Maximum records for one project identity |
| `maxItemChars` | `1200` | Maximum code points in one record |
| `maxUserChars` | `12000` | Maximum code points across user records |
| `maxProjectChars` | `18000` | Maximum code points across one project's records |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-memory-local) is the exhaustive source for accepted fields and JSDoc.

### Failure and lifecycle behavior

Project creation without `cwd` fails before storage. Duplicate or oversized content and content matching the safety patterns fail with stable `MemoryError` codes that do not include the rejected text. A backend write failure leaves both the in-memory snapshot and durable document unchanged. Disposal removes the Provider before waiting for queued durability and closes the domain only after its write chain is quiescent.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals - click to expand</summary>

The Provider keeps one mutation chain above the storage domain so validation and capacity decisions observe the latest committed document. The domain's global handle supplies the commit point: storage durability completes before its in-memory value changes, and a failed write cannot publish a partial record set.

### Durable declaration

`memoryDomainSpec` keeps the released `native_memory` name, version `0`, global schema, and empty table map. The global document stores `enabled` and immutable records with id, scope, optional project identity, content, optional source Session id, and creation/update timestamps. This package declares no successor or migration.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Provider, project identity, limits, content rejection, mutation chain, and lifecycle |
| [`src/spec.ts`](src/spec.ts) | Released `native_memory` version `0` global schema and storage declaration |
| - | No runtime invariant companion is published; storage-domain validates the durable document and owns atomicity, while `MemoryService` owns Provider uniqueness and effect disposal. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Memory Service Definition](../memory/README.md) - provider-neutral operations, records, and failures.
- [Memory package map](../README.md) - the two restored packages and their ownership split.
- [Storage subsystem](../../../docs/subsystems/storage.md) - domain durability, validation, and lifecycle.
- [JSON storage backend](../../storage/storage-json/README.md) - the human-readable single-document medium used in the example.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through consumers that read committed records; this Provider contributes no tools, prompts, schemas, or Session events.

#### KV Cache effect

None directly; storage changes affect a request only when a consumer changes model-visible context.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the local Provider needs different policy or storage coordination.

- **Pattern-based safety classification** - credential-like, temporary-path, and raw-log patterns are rejected conservatively; semantic classification would require another model call.
- **Single-host-process persistence** - the JSON backend provides no cross-process write lock for this single-document domain, so one Harness host must own the configured storage root.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers - click to expand</summary>

None.

</details>
