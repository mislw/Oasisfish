---
description: "The memory package group: provider-neutral durable notes and the local storage provider for readers composing or navigating user and project memory."
kind: "package-group"
---

# memory/ - durable user and project memory

English | [中文](README.zh.md)

## Summary

The memory family lets a host keep durable notes at user or project scope. The `memory` package defines the shared operations, records, ids, and failures; `memory-local` stores one bounded document through the storage-domain facility. Model tools, UI, and shipped composition remain separate consumers, so mounting this family alone adds no prompt content or model-visible tools.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

The Service Definition and local Provider can be composed independently from their consumers.

| Package | Role | ctx key |
|---|---|---|
| [`memory`](memory/README.md) | Defines provider-neutral durable-memory records and operations | `ctx.memory` |
| [`memory-local`](memory-local/README.md) | Persists bounded user and project records in the `native_memory` domain | registers on `ctx.memory` |

<a id="related-documentation"></a>
## Related documentation

- [Storage subsystem](../../docs/subsystems/storage.md) - owns storage backends, domain declarations, atomic writes, and domain lifecycle.
- [Capability seams](../../docs/capability-seams.md) - explains the Service Definition, Provider, and Consumer roles used by this family.

<a id="dev-note"></a>
## Dev Note

None.
