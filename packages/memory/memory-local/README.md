# @deepseek-ai/dsh-memory-local

English | [中文](README.zh.md)

Local `ctx.memory` Provider over the `native_memory` storage domain. It persists enablement plus bounded user/project records, derives project identity from normalized absolute Session `cwd` values, serializes mutations, rejects duplicates, and blocks credential-like, temporary-path, and raw-log content before durability. Item and aggregate limits count Unicode code points.

## Configuration

| Key | Default | Meaning |
| --- | ---: | --- |
| `maxUserItems` | `80` | Maximum global user records |
| `maxProjectItems` | `120` | Maximum records for one project identity |
| `maxItemChars` | `1200` | Maximum Unicode code points in one record |
| `maxUserChars` | `12000` | Maximum Unicode code points across user records |
| `maxProjectChars` | `18000` | Maximum Unicode code points across one project's records |

## Model Experience

Indirectly, through `@deepseek-ai/dsh-tool-memory`; this Provider contributes no prompt text or schema.

#### KV Cache effect

None directly; storage changes affect a request only when a Consumer reads them.

## Known Limitations and Deferred Work

- **Pattern-based safety classification** — credential-like, temporary-path, and raw-log patterns are rejected conservatively; semantic classification is deferred because it would require another model call.
- **Single-host-process persistence** — the JSON storage backend supplies no cross-process write locking, so one Harness host must own the configured storage root.
