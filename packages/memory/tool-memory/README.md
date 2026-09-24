---
description: "Durable memory tools and logged first-step context for agents that need reusable user preferences and project facts across turns."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-memory

English | [中文](README.zh.md)

## Summary

`dsh-tool-memory` lets an agent list and maintain durable user preferences and project facts through `memory_manage`. It also adds enabled records to the first accepted step of each turn as a sourced user message, so the exact model-visible text is retained in the Session log. Choose it when future turns should reuse bounded facts from a configured memory Provider. It does not extract facts automatically or resolve conflicts between records.

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

Mount the memory Service Definition, one Provider, and this package in the same composition. The shipped base bundle supplies the service, while the Web bundle supplies the local Provider and tool.

### When to choose it

Choose this package when an agent should carry explicit reusable facts across turns and every model-visible snapshot must remain reconstructable from the Session log. Avoid it when context should be transient, inferred automatically, or retrieved semantically; those behaviors are outside this package.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-memory'
- name: '@deepseek-ai/dsh-memory-local'
- name: '@deepseek-ai/dsh-tool-memory'
```

This package has no configuration fields. A mounted memory Provider is required before `memory_manage` executes or a turn requests its snapshot.

### Tool operations

`memory_manage` supports `list`, `add`, `update`, and `remove`. User records apply across projects; project records apply only when their stored project identity matches the owning Session `cwd`. Writes include the owning Session id in Provider metadata, and remove is idempotent.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin registers one prompt section, one tool, and one prepended `agent/pre-step` waterfall listener. The listener always delegates first, preserves the accepted decision fields, and appends a snapshot only for an enabled, non-empty first step. AgentLoop then commits that message before deriving the model request. The Provider remains responsible for capacity, sensitivity checks, project identity, and persistence.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Prompt guidance, tool registration, record rendering, and logged first-step injection |
| [`tests/tool.spec.ts`](tests/tool.spec.ts) | Tool operations, lifecycle disposal, waterfall behavior, and multi-step Session logging |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [memory service](../memory/README.md) — Provider-neutral operations and typed Remote methods.
- [memory-local](../memory-local/README.md) — the bounded local storage Provider used by shipped Web composition.
- [Agent turn flow](../../../docs/architecture.md#turn-flow) — the `agent/pre-step` admission and logging order.
- [Generated tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-memory) — the exact `memory_manage` schema.

-----

<a id="model-experience"></a>
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

<a id="known-limitations-and-deferred-work"></a>

These limits define when the tool is a poor fit.

- **Model-chosen writes** — the current conversation model decides when to call `memory_manage`; background extraction and semantic recall are intentionally absent.
- **No automatic conflict resolution** — changed stable facts require an explicit `update`; the tool does not merge contradictory records.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No runtime invariant companion is published; the package owns no independent state projection, while the tool registry, prompt registry, memory service, and Session log own the observable relations it composes.
