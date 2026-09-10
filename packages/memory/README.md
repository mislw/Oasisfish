# memory/ - durable memory capability

English | [中文](README.zh.md)

| Package | Role | ctx key |
|---|---|---|
| [`memory/`](memory/README.md) | Defines provider-neutral records and operations | `ctx.memory` |
| [`memory-local/`](memory-local/README.md) | Persists bounded user and project records locally | registers on `ctx.memory` |
| [`tool-memory/`](tool-memory/README.md) | Exposes memory management and logged context to the model | registers on `ctx.tools` |
