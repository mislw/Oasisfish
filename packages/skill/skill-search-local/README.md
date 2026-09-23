---
description: "The local directory Skill-search provider for deployments configuring private SQLite indexes and verified on-device embedding models."
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-search-local

English | [中文](README.zh.md)

## Summary

Agents can search Markdown and text resources stored beside a Skill without sending source text or queries to a remote service. The provider confines discovery to declared directory roots, chunks documents with source locations, and combines SQLite full-text ranking with vectors from a verified local Transformers.js model. Choose it for bounded local corpora that need durable indexes and deterministic hybrid retrieval. It requires a writable database path and a complete local model directory before the plugin can load.

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

Mount the provider after `dsh-skill-search`, and point it at a writable SQLite file and an immutable local model directory.

### When to choose it

Choose this provider when searchable Skill resources use a directory resource base, all indexing must stay local, and exact cosine over a bounded corpus is acceptable. Use another `ctx.skillSearch` provider for URL or opaque resources, remote indexes, approximate nearest-neighbor search, or provider-managed repositories.

### Minimal configuration

`modelRoot` directly contains `model-manifest.json` and every file named by that manifest. The manifest's `modelId` is persistent model identity, not another path segment.

```yaml
- name: '@deepseek-ai/dsh-skill-search-local'
  config:
    databasePath: .dsh/cache/skill-search.sqlite
    modelRoot: .dsh/models/skill-search
```

| Field | Default | Meaning |
|---|---|---|
| `providerName` | `local` | Unique provider name within one search-service scope layer |
| `databasePath` | required | Writable SQLite database path |
| `modelRoot` | required | Local directory containing the verified model manifest and files |
| `manifestFile` | `<modelRoot>/model-manifest.json` | Optional alternate manifest path |
| `defaultResultCount` | `5` | Result count when the caller omits `limit` |
| `maxResultCount` | `10` | Maximum accepted result count; cannot exceed 10 |

Chunk sizes, embedding batches, candidate bounds, reciprocal-rank fusion, score boosts, and maximal marginal relevance are also validated configuration fields. The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-skill-search-local) is the exhaustive source for accepted fields.

### Indexing, privacy, and failures

The plugin verifies the model manifest, disables remote model downloads, checks SQLite FTS5 support, opens the store, and only then registers the provider. Failure during setup closes every resource; duplicate registration also drains the provider, store, and model. Normal teardown unregisters first so no new search can enter, aborts active searches, waits for their settlement, and attempts both the store and model teardown even when either one fails.

The store initializes schema version 1 transactionally only when a version-zero database has no user schema objects. A populated version-zero database or any unsupported version fails without adopting or replacing its schema.

Refresh compares document metadata and SHA-256 values, embeds changed chunks only, and commits sources, lexical rows, vectors, removals, and model identity in one transaction. Discovery, chunking, embedding, cancellation, or write failure leaves the preceding complete revision available. A changed embedding identity rebuilds the cached vectors.

Source text, lexical tokens, vectors, queries, and SQLite rows remain local. Discovery rejects roots that escape the Skill resource directory and rejects directory reparse points. Each source file is read through one handle; the provider checks file identity and containment before and after the read, then applies file and corpus limits to the bytes actually read. Diagnostics omit query and source text.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the local indexing pipeline; the provider-neutral request and result types live in the [Skill subsystem reference](../../../docs/subsystems/skills.md#skill-corpus-retrieval).

### Design concept

Each search discovers the declared roots, chunks Markdown by heading and text by bounded code-point windows, refreshes one corpus revision, and retrieves lexical and vector candidates. Reciprocal-rank fusion combines the candidate lists, exact heading and path matches add bounded boosts, and maximal marginal relevance selects the final passages. The corpus identity and embedding-model identity determine whether stored rows remain reusable.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin configuration, resource creation, registration, rollback, and teardown |
| [`src/provider.ts`](src/provider.ts) | Provider lifecycle and one-search orchestration |
| [`src/corpus.ts`](src/corpus.ts) | Confined directory discovery and source limits |
| [`src/chunk.ts`](src/chunk.ts) | Heading-aware Markdown and bounded text chunking |
| [`src/embedder.ts`](src/embedder.ts) | Manifest verification and local Transformers.js feature extraction |
| [`src/store.ts`](src/store.ts) | SQLite schema, transactional refresh, and persistent model identity |
| [`src/retrieval.ts`](src/retrieval.ts) | Hybrid ranking and diversity selection |
| — | No runtime invariant companion is published; transactions and search results directly observe the index state that the package owns. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages for the service this provider implements, the Skill resources it accepts, and the consumer that renders results.

- [Skill subsystem reference](../../../docs/subsystems/skills.md) — corpus declarations, provider-neutral requests, and results.
- [skill-search package](../skill-search/README.md) — provider registration, scope selection, and error codes.
- [skill package](../skill/README.md) — directory resource bases and model invocation policy.
- [tool-skill-search package](../tool-skill-search/README.md) — model-facing search schema and citations.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through consumers such as `dsh-tool-skill-search` that render the provider's ranked passages.

#### KV Cache effect

The provider adds no model context itself; a consumer owns whether retrieved passages append to retained history.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define the corpora and retrieval scale that this local implementation supports.

- **Directory resources only** — URL and opaque Skill resource bases require another search provider.
- **Bounded exact vector search** — retrieval computes exact cosine over configured candidates; approximate vector indexes and learned rerankers are not included.
- **Search-driven refresh** — the provider refreshes a corpus when it is searched and exposes no background rebuild or status API.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
