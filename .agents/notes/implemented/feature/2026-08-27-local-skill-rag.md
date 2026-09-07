# Agent Note: Local retrieval for declared Skill corpora

Status: implemented

English | [中文](2026-08-27-local-skill-rag.zh.md)

## Problem

Directory-backed Skills can carry substantial API and workflow references, but loading an entire knowledge directory into one model turn wastes context and makes source selection opaque. The packaged Windows application also has to work on a fresh machine without an embedding endpoint, a separate runtime, or disclosure of Skill content to a model relay.

## Decision

Skill knowledge retrieval is an explicit local capability with three plugin roles. `dsh-skill-search` owns `ctx.skillSearch`, corpus declarations, Skill resolution, provider selection, cancellation, and structured errors. `dsh-skill-search-local` owns confined directory discovery, heading-aware chunking, a persistent SQLite index, local embeddings, and hybrid ranking. `dsh-tool-skill-search` owns the scoped model-facing `skill_search` tool and its durable tool result.

Corpora are deployment declarations rather than inferred Skill contents. Each declaration names one Skill, optional provider, relative roots, extensions, and resource limits. The Windows desktop declares the bundled `oasis-wiki` and `ai-image-prompts` `references` directories with separate limits. The provider resolves every source beneath the loaded Skill's directory resource base and rejects path traversal, reparse points, unsupported resource kinds, and configured limits. The immutable Skill snapshots are not modified to enable search.

The local provider stores original excerpts, CJK-aware FTS5 terms, and normalized embeddings in one transactional SQLite index. Refreshes prepare a complete changed batch before committing it, so cancellation, parsing failure, or model failure preserves the last complete revision. Retrieval combines bounded BM25 and exact cosine rankings through reciprocal-rank fusion, applies bounded heading and path boosts, and uses maximal marginal relevance to reduce redundant results. Exact cosine remains appropriate because corpus byte and chunk limits bound the supported data set.

The desktop packages a pinned quantized ONNX model and disables remote Transformers.js model loading. `modelRoot` names the directory that directly contains the manifest and its declared files; the manifest `modelId` remains the persistent identity and is not appended to that path. Source text, query text, tokens, embeddings, and the index stay local and never reuse provider or relay credentials. The first query creates or refreshes the index under desktop user data; later launches reuse compatible committed data.

`skill_search` is explicit rather than injected before each model request. Its calls and results use ordinary `tool/call` and `tool/result` Session events, including relative paths and one-based line ranges. A model can load the Skill, search when an API or factual question requires its references, and cite the returned source without adding a new agent-loop path or a synthetic context event.

## Verification

Unit tests cover confined discovery, Markdown and text chunking, CJK lexical terms, local model validation, transactional refresh, cancellation, hybrid ranking, provider disposal, and structured tool errors. A keyless assembled snapshot loads both bundled Skills and records real `skill_search` calls and results for the Oasis references and the image-prompt visual recipes. Desktop staging verifies the pinned model manifest and hashes, while the packaged smoke launches the application, performs a Chinese Oasis query with the real ONNX model, restarts with the same user-data directory, and confirms the persisted index remains usable.

## Alternatives considered

**Scan every Skill resource directory automatically.** Rejected because Skill packages may contain scripts, tests, assets, credentials, or unrelated files. An explicit declaration gives deployment owners a reviewable corpus and enforceable limits.

**Send embeddings to the configured model relay.** Rejected because it adds endpoint compatibility, credentials, quota, network availability, and a new content disclosure. It also prevents the desktop application from being self-contained.

**Use lexical search alone.** Rejected because exact API names work well with BM25, while Chinese paraphrases and related concepts require semantic retrieval. Lexical search remains one ranked input to the hybrid result.

**Inject retrieval automatically before every model request.** Rejected because query selection and irrelevant context would become hidden model-visible behavior requiring additional durable events. An explicit tool keeps retrieval observable and cancellable.

**Add a learned reranker or approximate nearest-neighbor index.** Rejected because the bounded Skill corpus does not justify another model, index format, or lifecycle. Reciprocal-rank fusion, exact cosine, and maximal marginal relevance provide deterministic local ranking within the declared limits.

## Consequences

Packaged agents can search the Oasis knowledge base and image-prompt visual recipes without a separate service, network download, or relay disclosure, and every returned passage remains source-addressable in the durable transcript. Deployments must declare each searchable corpus and provide immutable model resources plus mutable cache storage. The first query pays local indexing cost, the installer grows by the pinned model size, and unsupported or oversized corpora fail explicitly rather than degrading into an implicit full-directory scan.
