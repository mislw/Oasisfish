# Local Skill RAG Design

English | [中文](2026-08-27-local-skill-rag-design.zh.md)

## Goal

DeepSeek Harness provides a local retrieval-augmented generation path for knowledge stored inside directory-backed Skills. The Windows desktop distribution enables this path for the bundled `oasis-wiki` Skill without requiring a separate runtime, network download, embedding endpoint, or provider credential.

The first release retrieves source passages through a model-facing `skill_search` tool. It does not inject retrieved text automatically, alter the agent loop, or send Skill content to a relay.

## Capability Roles

The implementation extends the Skill family with three plugin roles instead of placing retrieval logic in the agent loop.

- `skill-search` defines `ctx.skillSearch`, the provider registry, corpus resolution, query and result types, cancellation, and provider selection.
- `skill-search-local` provides directory-backed indexing, local embeddings, hybrid retrieval, and the persistent index.
- `tool-skill-search` registers the model-facing `skill_search` tool and renders source locations and excerpts from `ctx.skillSearch` results.

The search service resolves a Skill through `ctx.skills.get()` using the calling session's working directory and scope. A provider receives the resolved definition and may accept only resource bases it understands. The local provider accepts directory resource bases; unsupported URL or opaque resources fail with a provider-specific diagnostic rather than falling back to an unrelated search mechanism.

## Corpus Declaration

Retrieval is opt-in. A local corpus specification contains the Skill name, relative roots, accepted file extensions, and byte and chunk limits. Every root resolves beneath the Skill's directory resource base after realpath checks; absolute paths, parent traversal, and symbolic-link escapes are rejected.

The desktop composition declares `oasis-wiki` with root `references` and extensions `.md` and `.txt`. The bundled Skill snapshot remains byte-identical to its recorded upstream revision. The service also accepts a typed corpus declaration from a future Skill definition, but it never indexes every resource directory implicitly.

Scripts, tests, assets, credentials, and project files stay outside the Oasis Wiki corpus because no declared root reaches them. A user or deployment can register another Skill corpus through Cordis configuration without changing the search tool.

## Chunking and Source Identity

Markdown files are divided by heading hierarchy, paragraph boundaries, lists, tables, and fenced code blocks. A chunk targets 800 Unicode code points, may grow to 1,200 to keep one fenced block intact, and carries at most 120 code points of overlap from the preceding prose chunk. Plain-text files use paragraph and line boundaries with the same target and overlap limits.

Every chunk records the Skill name, corpus revision, normalized relative path, heading trail, one-based start and end lines, content hash, and text. Chunk identifiers derive from the normalized path, line range, and content hash, so unchanged source passages retain identity across incremental indexing.

The embedding input prefixes the source title and heading trail to the chunk text. The returned excerpt remains the original source text and never contains tokenizer-only material.

## Local Embeddings

The local provider uses a pinned quantized `bge-small-zh-v1.5` ONNX snapshot through the maintained Transformers.js runtime. The desktop build stages the tokenizer, model, configuration, license, upstream revision, and file hashes under immutable application resources. Runtime loading is local-only and rejects a missing or mismatched model; it never downloads a model from the network.

Embeddings are normalized `Float32Array` values. Documents are embedded in bounded batches, while each query is embedded once. Tests use the same embedding interface with a deterministic fixture implementation; desktop staging and smoke verification exercise the packaged ONNX model.

## Persistent Index

The local provider owns one SQLite database under the Harness cache directory. A monotonic schema version covers corpus metadata, source documents, chunks, FTS rows, vectors, and model identity. Vectors are stored as little-endian float blobs. The corpus key includes the Skill provider, Skill name, resolved resource root, corpus specification digest, and embedding model revision, preventing one installation or model from reusing an incompatible index.

Chinese lexical retrieval stores a normalized token stream containing Latin word tokens plus CJK unigrams and bigrams in SQLite FTS5. The original source text remains separate. SQLite and FTS5 availability are checked when the provider loads; missing support fails the plugin configuration loudly.

The first query builds a missing corpus. Later queries compare file size, modification time, and SHA-256 before replacing changed documents. Removed files delete their chunks. New embeddings and FTS rows are committed in one transaction after the complete changed batch succeeds, so cancellation, parsing errors, or model failures preserve the last complete index.

One in-process lock serializes refreshes for the same corpus. Call cancellation stops directory scanning, embedding batches, and query work. Plugin disposal waits for active work to stop before closing the database and model runtime.

## Retrieval and Reranking

Each query produces two bounded candidate lists: SQLite FTS5 BM25 results and cosine similarity over stored normalized vectors. The Oasis Wiki corpus is small enough for exact in-process cosine scoring; the provider enforces configured chunk and byte ceilings instead of silently degrading when a corpus exceeds the supported size.

Reciprocal-rank fusion combines the lexical and semantic lists. A deterministic second pass boosts exact heading and path-term matches, then applies maximal marginal relevance to reduce near-duplicate adjacent chunks. This is a hybrid fusion reranker, not a learned cross-encoder. The default result count is five and the tool accepts values from one through ten.

Each result contains rank, fused score, relative source path, heading trail, line range, and source excerpt. The result ordering is stable for an unchanged index and query.

## Model-Facing Tool

`skill_search` accepts `name`, `query`, and optional `limit`. The tool verifies that the selected Skill is model-invocable, resolves it in the calling agent scope, and delegates to `ctx.skillSearch`. Its presentation intent is `locations`: the call identifies the Skill and query, while the result presents each source location and excerpt without exposing absolute installation paths or index internals.

The complete tool call and result are ordinary durable Session events, so every passage reaching a later model request is reconstructable from the log. The tool adds no synthetic context message. Tool guidance tells the model to load a Skill first, search its declared corpus for factual or API questions, and cite the returned relative path and line range in its answer.

Empty retrieval is a successful result that names the searched Skill and recommends a narrower or synonymous query. Unknown Skills, non-invocable Skills, undeclared corpora, unreadable sources, index limits, model failures, and cancellation remain distinct structured errors.

## Desktop Packaging

The desktop supervisor supplies immutable model and bundled-Skill paths plus a mutable cache path through child-process environment variables. The packaged app includes every model file and native runtime artifact required on Windows x64. It does not modify global `PATH`, install Python packages, or place model files in the user's Skill directory.

Staging validation verifies the model manifest and hashes, the Oasis Wiki corpus declaration, the three retrieval plugins, and the absence of reparse points. The unpacked smoke test launches the packaged app with a fresh user-data directory, loads `oasis-wiki`, performs one Chinese `skill_search`, confirms that every returned source stays under `references`, restarts the app, and confirms that the persistent index remains usable.

## Privacy and Limits

Source text, chunks, embeddings, lexical tokens, and query text remain on the local machine. The retrieval plugins make no HTTP requests and do not reuse the configured chat provider or relay. SQLite files inherit the desktop user's private application-data location; diagnostics never print chunk text, query text, credentials, or absolute Skill paths.

The first release has no settings page, manual rebuild button, learned reranker, approximate nearest-neighbor index, OCR, PDF ingestion, or remote Skill retrieval. Those additions require separate product and lifecycle decisions. Corpus status is available through logs and structured tool errors only.

## Verification

Unit tests cover corpus path confinement, Markdown and text chunking, CJK lexical tokenization, embedding normalization, index replacement, cancellation, BM25 and vector candidate production, fusion ordering, duplicate reduction, result limits, and error distinctions.

Integration tests mount the real Skill registry, filesystem Skill provider, search service, deterministic local search provider, tool registry, and session log. They verify scope-aware Skill resolution, durable tool events, relative citations, incremental updates, and last-complete-index preservation after a failed refresh.

A keyless runnable snapshot loads a fixture Skill and calls `skill_search`, pinning the model-visible tool transcript. Desktop verification exercises the packaged embedding model and the real bundled Oasis Wiki corpus. Relevant typecheck, lint, build, hygiene, documentation, package, and unpacked smoke checks run before a release claim.

## Alternatives Considered

**Relay-provided embeddings.** This keeps the installer smaller but makes retrieval depend on endpoint compatibility, credentials, network access, quota, and a new privacy disclosure. It conflicts with the self-contained desktop requirement.

**Lexical-only search.** Ripgrep or BM25 is useful for exact API names but misses paraphrases and Chinese wording differences. It remains one half of hybrid retrieval rather than the complete implementation.

**Automatic retrieval before every model request.** Automatic injection spends tokens on irrelevant turns and requires new durable context events and query-selection policy. An explicit tool keeps retrieval observable, logged, cancellable, and controlled by the active Skill workflow.

**A general project-document RAG database.** Indexing arbitrary workspaces introduces authorization, project ownership, ignore rules, and deletion semantics beyond the requested Skill knowledge base. The first capability is restricted to declared Skill resources while preserving provider interfaces that can support another corpus type later.
