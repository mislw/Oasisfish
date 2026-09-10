# @deepseek-ai/dsh-tool-memory

English | [中文](README.zh.md)

Registers `memory_manage`, durable-memory guidance, and a first-step `agent/pre-step` snapshot. Accepted snapshots are sourced as `native-memory-context`, so AgentLoop appends the exact model-visible text to the Session log before request derivation.

## Model Experience

### Durable-memory guidance

#### What the model sees

The model receives one fixed policy section while the plugin is visible.

##### Memory policy

```markdown
Use memory_manage only for durable, reusable facts that will help future work. Prefer project scope for repository rules and environment facts. Never store secrets, raw logs, or transient task state. Do not duplicate facts already present; update a record when a stable fact changes.
```

#### Token effect

One fixed concise section is present on each request.

#### KV Cache effect

Prefix-stable while the plugin and policy text are unchanged.

### Tool schema and results

#### What the model sees

The model sees the generated [`memory_manage` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-memory). Results identify listed records or the committed record id and scope without exposing storage internals.

#### Token effect

One fixed schema is sent while visible; result text is data-dependent and remains in logged tool history until compaction.

#### KV Cache effect

Tool results append after the reusable request prefix and do not invalidate earlier cache entries.

### Per-turn memory snapshot

#### What the model sees

On the first accepted step of each turn, enabled user records and records matching the Session `cwd` are grouped under `User preferences` and `Project memory`. Empty groups produce no message. The exact sourced message is logged as `native-memory-context` before request derivation.

#### Token effect

Conditional and bounded by the Provider's item and character limits. Every new turn reads a fresh snapshot; later steps in the same turn add nothing.

#### KV Cache effect

The fixed prompt and schema remain reusable. A changed snapshot changes the request suffix for the next turn without rewriting earlier logged requests.

## Known Limitations and Deferred Work

- **Model-chosen writes** — the current conversation model decides when to call `memory_manage`; background extraction and semantic recall are intentionally absent.
- **No automatic conflict resolution** — changed stable facts require an explicit `update`; the tool does not merge contradictory records.
