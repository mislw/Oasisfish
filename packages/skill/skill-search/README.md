---
description: "The provider-neutral Skill corpus search service for deployments declaring searchable resources and maintainers implementing scoped search providers."
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-search

English | [中文](README.zh.md)

## Summary

Agents can search a loaded Skill's explicitly declared resource corpus without depending on one indexing implementation. Deployments choose which Skill resources are searchable and set byte and chunk ceilings; providers handle storage and ranking, while consumers decide how results reach a model or user. Choose this package when several search backends or consumers need one scope-aware API. It does not read files, build indexes, or register a tool by itself.

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

Mount the service with explicit corpus declarations, then mount at least one provider and one consumer for successful searches.

### When to choose it

Choose this service when a deployment needs searchable Skill references with stable errors, scoped provider selection, and provider-neutral result fields. Skip it when loading the complete Skill body is sufficient; `dsh-skill` already owns discovery and loading. Use `dsh-skill-search-local` when the searchable resources are local directories and a local SQLite index is appropriate.

### Minimal configuration

Mount the Skill registry first, then declare each searchable corpus on this service. Roots are relative to the winning Skill's resource base.

```yaml
- name: '@deepseek-ai/dsh-skill'
- name: '@deepseek-ai/dsh-skill-search'
  config:
    corpora:
      - skill: api-guide
        roots: [references]
        extensions: [.md, .txt]
        maxFileBytes: 1048576
        maxCorpusBytes: 16777216
        maxChunks: 10000
```

| Field | Default | Meaning |
|---|---|---|
| `corpora` | `[]` | Explicit searchable Skill declarations |
| `corpora[].provider` | any winning provider | Optional `ctx.skills` provider required for the declaration |
| `corpora[].roots` | required | Relative resource roots included in the corpus |
| `corpora[].extensions` | required | Accepted lower-case extensions, including the leading dot |
| `corpora[].maxFileBytes` | required | Maximum bytes accepted from one source file |
| `corpora[].maxCorpusBytes` | required | Maximum aggregate source bytes accepted by the corpus |
| `corpora[].maxChunks` | required | Maximum chunks retained for the corpus |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-skill-search) is the exhaustive source for accepted fields.

### Search behavior and failures

`ctx.skillSearch.search()` rejects an explicit `limit` unless it is a safe integer from 1 through 10, then resolves the winning Skill for the caller's cwd and scope, requires model invocation permission, selects the matching declaration, and calls the first visible provider that supports the resolved resource base. Results contain provider-ranked excerpts with relative paths, heading trails, and one-based line ranges; the service caps complete results at the requested count or 10 when omitted. Cancellation races provider work, so a provider that ignores the signal cannot delay the caller.

`SkillSearchError` preserves a stable `code` in tool failure metadata. The codes distinguish an unknown or non-model-invocable Skill, an undeclared corpus, an unsupported resource base, corpus limits, unreadable sources, an unavailable model, and cancellation. Diagnostics do not include the query or source text.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains provider routing and corpus resolution; exact signatures are generated in the [Skill subsystem reference](../../../docs/subsystems/skills.md#cordis-surface).

### Design concept

Provider registrations live in host and per-scope layers. `registerProvider(name, provider)` contributes a borrowed provider through a Cordis effect, so disposing the contributing fiber removes exactly that registration. A search loads the Skill through `ctx.skills`, derives a branded corpus identity from the winning definition and declaration, merges the visible provider layers, and delegates one complete request to the first supporting provider.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Service, corpus declarations, provider routing, cancellation, result bounds, and structured errors |
| [`src/brand.ts`](src/brand.ts) | Branded corpus identities and provider names |
| — | No runtime invariant companion is published; provider routes are private registry state with no independent observation that can diverge. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages from the Skill definition registry through a concrete provider and model-facing consumer.

- [Skill subsystem reference](../../../docs/subsystems/skills.md) — shared Skill and corpus-search vocabulary.
- [skill package](../skill/README.md) — the Skill registry resolved before every search.
- [skill-search-local package](../skill-search-local/README.md) — the directory-backed SQLite and embedding provider.
- [tool-skill-search package](../tool-skill-search/README.md) — the model-facing `skill_search` consumer.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through consumers such as `dsh-tool-skill-search` that render search schemas and results.

#### KV Cache effect

The service adds no model context itself; a consumer owns the placement and lifetime of retrieved passages.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the service needs another declaration or provider capability.

- **Corpora are deployment-owned** — Skill frontmatter cannot opt resources into indexing; every searchable corpus needs an explicit service declaration.
- **Provider selection stops at the first match** — one search does not aggregate or rerank results from several providers.
- **No provider status API** — callers observe readiness and failures through searches; the service exposes no inventory or background-index status.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
