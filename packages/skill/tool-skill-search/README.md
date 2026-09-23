---
description: "The model-facing skill_search tool for agents querying declared Skill corpora and citing ranked source passages."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-skill-search

English | [中文](README.zh.md)

## Summary

Agents can query a loaded Skill's declared corpus and receive ranked excerpts with relative source citations. The `skill_search` tool accepts an exact Skill name, a natural-language or symbol query, and an optional result limit; it preserves structured search failures and presents completed hits as file-and-line matches. Choose it when models need targeted facts from references that are too large to load with the Skill body. It requires a configured `ctx.skillSearch` service and provider.

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

Mount the plugin in an agent composition after the tool registry and Skill-search service are available.

### When to choose it

Choose this consumer when a model should search declared Skill references on demand and cite the returned relative path and line range. Skip it when the full Skill body contains all required information or when search is only a host or user workflow that should not be model-callable.

### Minimal configuration

The plugin has no configuration fields. Its dependencies provide corpus declarations, search providers, and the tool registry.

```yaml
- name: '@deepseek-ai/dsh-tool-skill-search'
```

### Call and result behavior

The tool requires a non-empty exact Skill `name` and non-empty `query`. `limit` defaults to 5 and must be an integer from 1 through 10. Calls inherit the agent's cwd, scope, and cancellation signal. Successful hits include rank, score, relative path, heading trail, one-based start and end lines, and excerpt; rendered citations use `path:start-end`. An empty result recommends a narrower or synonymous query.

`SkillSearchError` remains a structured tool failure with its stable code. The presenter exposes a generic pending search and groups completed replayable metadata by relative file and starting line.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the consumer adapter; the generated [tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-skill-search) owns the exact schema.

### Design concept

The plugin registers one typed tool on `ctx.tools`. Execution validates caller-owned inputs, borrows the current agent context for scoped search, and maps provider-neutral hits into stable structured output. Text rendering and presentation metadata derive from that same output, so replay does not need the live search provider.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Tool schema, validation, search delegation, text rendering, and pure presentation metadata |
| — | No runtime invariant companion is published; the core tool registry owns registration, execution, and disposal. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages for the search service, local provider, and the Skill-loading workflow that precedes a search.

- [Skill subsystem reference](../../../docs/subsystems/skills.md) — provider-neutral search vocabulary and generated service API.
- [skill-search package](../skill-search/README.md) — corpus declarations, scope selection, and structured errors.
- [skill-search-local package](../skill-search-local/README.md) — the local index and retrieval provider.
- [tool-skill package](../tool-skill/README.md) — the catalog and `skill` loader tool used before searching references.

-----

<a id="model-experience"></a>
## Model Experience

### Tool schema

#### What the model sees

The model sees the generated [`skill_search` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-skill-search). Its description tells the model to search a loaded Skill's declared corpus for factual or API questions and cite relative paths and line ranges.

#### Token effect

The visible tool adds a fixed schema cost to each request.

#### KV Cache effect

The stable schema preserves an already-reusable request prefix while the tool definition and scoped visibility remain unchanged. A visibility change alters the request tool list from that request onward.

### Tool result

#### What the model sees

Each successful call appends ranked citations and excerpts, or the stable empty-result guidance. Structured failures preserve the `SkillSearchError` name, code, and diagnostic.

#### Token effect

Result cost is append-only and grows with the selected hit count and excerpt lengths.

#### KV Cache effect

Each durable `tool/result` appends a new suffix without replacing earlier reusable tokens. A different query, limit, corpus revision, or ranking changes that suffix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define the search workflow exposed to the model.

- **One Skill per call** — the tool does not aggregate or compare several declared Skill corpora in one invocation.
- **No automatic retrieval** — the model must load the Skill and call `skill_search`; the plugin does not inject passages or start background indexing.
- **Provider-owned citations** — useful relative paths and line ranges depend on the selected provider preserving source locations.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
