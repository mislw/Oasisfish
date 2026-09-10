# @deepseek-ai/dsh-memory

English | [中文](README.zh.md)

Provider-neutral Service Definition for durable user and project memory. `ctx.memory` selects one effect-owned Provider and exposes `list`, `add`, `update`, `remove`, and `setEnabled`; a missing or duplicate Provider fails with a stable `MemoryError` code. Records use opaque `MemoryId` values, project access resolves from the caller's Session `cwd`, and every returned record is immutable.

This package owns records, requests, results, branded ids, and errors. Providers own persistence and policy. Model tools and UI own presentation.

## Model Experience

Indirectly, through `@deepseek-ai/dsh-tool-memory`, which selects effective records and owns their logged model-facing rendering.

#### KV Cache effect

None directly; the Consumer owns request-prefix changes.

## Known Limitations and Deferred Work

- **One Provider per process** — registering a second Provider fails instead of selecting one implicitly; provider selection is deferred until two production backends exist.
