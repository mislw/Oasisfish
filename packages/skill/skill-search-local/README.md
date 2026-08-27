# @deepseek-ai/dsh-skill-search-local

English | [中文](README.zh.md)

Directory-backed local provider for `ctx.skillSearch`. It confines discovery to declared Skill resource roots, chunks Markdown and text with source locations, persists a transactional SQLite FTS/vector index, embeds with a verified local Transformers.js model, and returns deterministic hybrid retrieval results.

## Plugin

The plugin requires explicit `databasePath` and `modelRoot` values. It verifies the model manifest before registration, disables remote model downloads, checks SQLite FTS5 support, and fails plugin loading when those resources are unavailable. The provider accepts only directory-backed Skill resources.

Index refresh compares document metadata and SHA-256 values, embeds only changed chunks, and publishes source rows, lexical rows, vectors, removals, and model identity in one transaction. A failed discovery, chunking, embedding, cancellation, or write leaves the last complete revision intact.

## Config

Chunk target, hard maximum, overlap, embedding batch size, lexical/vector candidate caps, RRF `k`, heading/path boosts, MMR lambda, default result count, and maximum result count are validated configuration fields. `maxResultCount` cannot exceed the model-facing limit of 10. Corpus roots, extensions, file bytes, corpus bytes, and chunk ceilings belong to `@deepseek-ai/dsh-skill-search` declarations.

## Privacy

Source text, lexical tokens, embeddings, queries, and SQLite rows remain local. The provider performs no HTTP request and does not read chat-provider credentials. Diagnostics omit query and source text.

## Model Experience

Indirectly, through a Consumer such as `@deepseek-ai/dsh-tool-skill-search`.

#### KV Cache effect

The provider preserves any reusable prefix because it does not add model context itself. The Consumer controls whether retrieved passages append a new suffix.

## Known Limitations and Deferred Work

- Only directory-backed Markdown and text corpora are supported.
- Retrieval uses exact cosine over bounded corpora; approximate vector indexes and learned rerankers are not included.
- Index status is observable through searches and diagnostics; there is no background rebuild or status API.
