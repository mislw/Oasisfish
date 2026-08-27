# Local Skill RAG Implementation Plan

English | [中文](2026-08-27-local-skill-rag.zh.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fully local, persistent hybrid retrieval capability for declared Skill knowledge corpora and ship it enabled for the desktop-bundled `oasis-wiki` Skill.

**Architecture:** Three Cordis plugin roles implement the capability without changing `agent-loop`: `skill-search` owns the scoped provider registry and public types, `skill-search-local` owns directory indexing and retrieval, and `tool-skill-search` exposes a durable model-facing `skill_search` tool. The Windows desktop stages a pinned Transformers.js ONNX model beside the immutable bundled Skill, supplies explicit model/cache paths, and verifies a real search through the packaged application.

**Tech Stack:** TypeScript ESM, Cordis, Schemastery, `node:sqlite` with FTS5, `mdast-util-from-markdown` with GFM, `@huggingface/transformers@4.2.0`, Vitest, keyless snapshot fixtures, Electron Builder.

**Spec:** [Local Skill RAG Design](../specs/2026-08-27-local-skill-rag-design.md)

## Global Constraints

- Do not change `agent-loop`; new behavior must use Skill, tool, and Session extension points.
- Index only explicitly declared directory-backed corpora; the desktop declares `oasis-wiki`, root `references`, and extensions `.md` and `.txt`.
- Preserve the bundled `oasis-wiki` snapshot byte-for-byte at revision `885cbf5`; configuration, model files, and retrieval code live outside that snapshot.
- Keep source text, query text, lexical tokens, embeddings, and indexes local; the retrieval packages must not call HTTP or reuse chat-provider credentials.
- Pin `Xenova/bge-small-zh-v1.5` revision `75c43b069aac4d136ba6bc1122f995fedcfd2781` and verify every staged file against the approved SHA-256 manifest.
- Default chunk target is 800 Unicode code points, hard maximum 1,200, overlap 120; default result count is 5 and accepted tool limits are 1 through 10.
- Corpus, candidate, fusion, MMR, batch, byte, and chunk limits are validated `Config` values, not hidden constants inside execution methods.
- Every public module/export receives the required concise JSDoc; package READMEs and subsystem documentation change with their source contracts.
- Every implementation task follows RED, GREEN, focused verification, and commit. Do not push unless the user asks.
- A non-trivial shipped decision includes an implemented bilingual Agent Note and a keyless runnable snapshot.

---

### Task 1: Skill Search Service Definition

**Files:**
- Create: `packages/skill/skill-search/package.json`
- Create: `packages/skill/skill-search/tsconfig.json`
- Create: `packages/skill/skill-search/src/index.ts`
- Create: `packages/skill/skill-search/src/invariant.ts`
- Create: `packages/skill/skill-search/tests/skill-search.spec.ts`
- Create: `packages/skill/skill-search/README.md`
- Create: `packages/skill/skill-search/README.zh.md`
- Create: `packages/skill/skill-search/README.i18n.yaml`
- Modify: `packages/skill/README.md`
- Modify: `packages/skill/README.zh.md`
- Modify: `docs/subsystems/skills.md`
- Modify: `docs/subsystems/skills.zh.md`

**Interfaces:**
- Produces: `SkillCorpusSpec`, `ResolvedSkillCorpus`, `SkillSearchRequest`, `SkillSearchResult`, `SkillSearchHit`, `SkillSearchErrorCode`, `SkillSearchProvider`, and `SkillSearchProviderControl`.
- Produces: `ctx.skillSearch.registerProvider(create)` and `ctx.skillSearch.search(request, options)`.
- Consumes: `ctx.skills.get(name, { cwd, scope, signal })`, `SkillDefinition.resourceBase`, and `isModelInvocable`.

- [ ] **Step 1: Write failing registry and resolution tests**

Test global and scoped provider precedence, duplicate names within one layer, provider disposal, cancellation forwarding, unknown Skill, non-model-invocable Skill, undeclared corpus, unsupported resource base, and successful directory corpus resolution.

```ts ignore-check
const result = await scoped.ctx.skillSearch.search(
  { name: 'fixture-skill', query: '角色复活', limit: 5 },
  { cwd: fixtureRoot, scope, signal: AbortSignal.timeout(1_000) },
)
expect(result.hits[0]).toMatchObject({ skill: 'fixture-skill', path: 'references/respawn.md' })
```

- [ ] **Step 2: Run the focused test and confirm the missing package failure**

Run: `pnpm vitest run packages/skill/skill-search/tests/skill-search.spec.ts`

Expected: FAIL because `@deepseek-ai/dsh-skill-search` and `ctx.skillSearch` do not exist.

- [ ] **Step 3: Define the public request, corpus, result, and error types**

Use a branded `SkillCorpusId`; represent one corpus with `skill`, `roots`, `extensions`, `maxFileBytes`, `maxCorpusBytes`, and `maxChunks`; return relative POSIX paths, heading trails, one-based line ranges, original excerpts, and stable numeric scores. Use a tagged `SkillSearchError` whose codes distinguish `UNKNOWN_SKILL`, `NOT_MODEL_INVOCABLE`, `CORPUS_UNDECLARED`, `UNSUPPORTED_RESOURCE_BASE`, `CORPUS_LIMIT`, `SOURCE_UNREADABLE`, `MODEL_UNAVAILABLE`, and `ABORTED`.

- [ ] **Step 4: Implement the layered provider registry and corpus resolution**

Mirror the ownership pattern in `SkillRegistry`: registrations are `ctx.effect()` effects, scoped layers override global layers, provider names are unique per layer, and disposal aborts provider work. `search()` loads the winning Skill with the caller's cwd/scope/signal, rechecks model invocation after loading, resolves the configured corpus for the winning Skill/provider pair, and dispatches only to a provider whose `supports()` accepts the resolved corpus.

- [ ] **Step 5: Add the package invariant and bilingual contracts**

The invariant asserts the owned relationship: when a search provider is registered, `ctx.skillSearch` can resolve that provider for a matching declared corpus. Document scope behavior, supported resource bases, cancellation, error codes, and the fact that the Service Definition performs no indexing.

- [ ] **Step 6: Run focused verification and commit**

Run: `pnpm vitest run packages/skill/skill-search/tests/skill-search.spec.ts`

Run: `pnpm run verify-export-jsdoc -- packages/skill/skill-search`

```powershell
git add packages/skill/skill-search packages/skill/README.md packages/skill/README.zh.md docs/subsystems/skills.md docs/subsystems/skills.zh.md
git commit -m "feat(skill): define skill search capability"
```

### Task 2: Confined Corpus Discovery and Heading-Aware Chunking

**Files:**
- Create: `packages/skill/skill-search-local/package.json`
- Create: `packages/skill/skill-search-local/tsconfig.json`
- Create: `packages/skill/skill-search-local/src/corpus.ts`
- Create: `packages/skill/skill-search-local/src/chunk.ts`
- Create: `packages/skill/skill-search-local/src/lexical.ts`
- Create: `packages/skill/skill-search-local/tests/corpus.spec.ts`
- Create: `packages/skill/skill-search-local/tests/chunk.spec.ts`
- Create: `packages/skill/skill-search-local/tests/lexical.spec.ts`

**Interfaces:**
- Produces: `discoverCorpus(corpus, signal): Promise<DiscoveredDocument[]>`.
- Produces: `chunkDocument(document, options): SourceChunk[]`.
- Produces: `lexicalTokenStream(text): string`.
- Consumes: `ResolvedSkillCorpus` from Task 1 and the configured chunk/file/corpus ceilings.

- [ ] **Step 1: Write failing path-confinement and discovery tests**

Cover normalized roots, extension filtering, deterministic ordering, absolute roots, `..` traversal, file and directory symbolic-link escapes, junction/reparse-point escapes, unreadable files, per-file byte limits, total byte limits, and cancellation during traversal. Tests must prove that `scripts`, `tests`, and binary assets remain absent when only `references` is declared.

- [ ] **Step 2: Run corpus tests and confirm missing implementation**

Run: `pnpm vitest run packages/skill/skill-search-local/tests/corpus.spec.ts`

Expected: FAIL because `discoverCorpus` does not exist.

- [ ] **Step 3: Implement realpath-confined deterministic discovery**

Resolve the Skill resource directory once, resolve and realpath every declared root and discovered file, require every resolved path to remain beneath the base, reject reparse points rather than following them, and return normalized relative POSIX paths with byte size, mtime, SHA-256, and UTF-8 text. Check `signal.throwIfAborted()` before directory reads, file reads, and hash work.

- [ ] **Step 4: Write failing Markdown/text chunk tests**

Cover heading trails, paragraphs, lists, GFM tables, fenced code blocks, plain-text paragraphs, one-based line ranges, 800-target splitting, 1,200 maximum, 120-code-point prose overlap, intact code fences, stable chunk IDs, and original-text excerpts without tokenizer prefixes.

- [ ] **Step 5: Parse Markdown and implement chunking**

Use `mdast-util-from-markdown`, `mdast-util-gfm`, and `micromark-extension-gfm` with source positions. Convert block nodes into ordered line-aware segments, carry the active heading hierarchy, keep a single fenced block intact up to the configured hard maximum, and derive `chunkId` from normalized path, line range, and content SHA-256.

- [ ] **Step 6: Write and implement CJK lexical token tests**

Assert Unicode normalization, lower-cased Latin word tokens, CJK unigrams, overlapping CJK bigrams, punctuation removal, deterministic spacing, and no mutation of source excerpts.

Expected output: `lexicalTokenStream('角色 Respawn 复活')` returns `'角 色 角色 respawn 复 活 复活'`.

- [ ] **Step 7: Run focused verification and commit**

Run: `pnpm vitest run packages/skill/skill-search-local/tests/corpus.spec.ts packages/skill/skill-search-local/tests/chunk.spec.ts packages/skill/skill-search-local/tests/lexical.spec.ts`

```powershell
git add packages/skill/skill-search-local
git commit -m "feat(skill-search): parse local skill corpora"
```

### Task 3: Transactional SQLite Index

**Files:**
- Create: `packages/skill/skill-search-local/src/schema.ts`
- Create: `packages/skill/skill-search-local/src/store.ts`
- Create: `packages/skill/skill-search-local/tests/store.spec.ts`

**Interfaces:**
- Produces: `SKILL_SEARCH_SCHEMA_VERSION` and `openSkillSearchStore(path)`.
- Produces: `SkillSearchStore.refresh(corpus, documents, embed, signal)`, `lexicalCandidates`, `vectorRows`, `modelIdentity`, and `close`.
- Consumes: `DiscoveredDocument`, `SourceChunk`, lexical token streams, normalized `Float32Array` embeddings, and the corpus/model identity values.

- [ ] **Step 1: Write failing schema and refresh tests**

Cover a new database, FTS5 availability failure, incompatible `PRAGMA user_version`, corpus identity isolation, first build, unchanged file reuse, changed-file replacement, removed-file deletion, little-endian vector round-trip, transaction rollback after an embedding failure, cancellation rollback, and close after active work settles.

- [ ] **Step 2: Run store tests and confirm missing schema/store**

Run: `pnpm vitest run packages/skill/skill-search-local/tests/store.spec.ts`

Expected: FAIL because the store modules do not exist.

- [ ] **Step 3: Create the monotonic schema and load-time checks**

Open `node:sqlite` lazily, create owner-private parent directories and database files, enable foreign keys and WAL, test FTS5 with a temporary virtual table, reject every non-zero schema version other than `SKILL_SEARCH_SCHEMA_VERSION`, and stamp the version only after all tables are complete. Create tables for corpora, documents, chunks, vectors, and model identity plus an external-content FTS5 table keyed to chunk rows.

- [ ] **Step 4: Implement complete-batch transactional refresh**

Compare size and mtime first, verify SHA-256 before treating a document as unchanged, prepare all changed chunks and embeddings before opening the write transaction, then replace changed documents, delete removed documents, update FTS rows/vectors, and advance corpus revision in one transaction. A parser, model, limit, or cancellation failure leaves the last complete revision readable.

- [ ] **Step 5: Serialize refresh and make disposal wait**

Maintain one in-process promise chain per corpus key. New queries await the current refresh; cancellation stops the caller without corrupting shared work, while plugin disposal aborts owned refreshes, awaits settlement, finalizes statements, and closes the database exactly once.

- [ ] **Step 6: Run focused verification and commit**

Run: `pnpm vitest run packages/skill/skill-search-local/tests/store.spec.ts`

```powershell
git add packages/skill/skill-search-local/src/schema.ts packages/skill/skill-search-local/src/store.ts packages/skill/skill-search-local/tests/store.spec.ts
git commit -m "feat(skill-search): persist local hybrid index"
```

### Task 4: Local Embedder and Hybrid Retrieval

**Files:**
- Create: `packages/skill/skill-search-local/src/embedder.ts`
- Create: `packages/skill/skill-search-local/src/retrieval.ts`
- Create: `packages/skill/skill-search-local/tests/embedder.spec.ts`
- Create: `packages/skill/skill-search-local/tests/retrieval.spec.ts`

**Interfaces:**
- Produces: `SkillSearchEmbedder` with `identity`, `embedDocuments(texts, signal)`, `embedQuery(text, signal)`, and `dispose()`.
- Produces: `TransformersJsEmbedder` and `DeterministicFixtureEmbedder`.
- Produces: `retrieve(store, query, options, embedder, signal): Promise<SkillSearchHit[]>`.
- Consumes: FTS BM25 rows and normalized vector rows from Task 3.

- [ ] **Step 1: Write failing embedder contract tests**

Verify document batching, one query embedding, finite dimensions, L2 normalization, model identity, caller cancellation, local-only Transformers.js environment settings, missing model files, manifest mismatch, and idempotent disposal. Mock only the Transformers.js pipeline factory; do not make network requests.

- [ ] **Step 2: Run embedder tests and confirm missing implementation**

Run: `pnpm vitest run packages/skill/skill-search-local/tests/embedder.spec.ts`

Expected: FAIL because the embedder contract and implementation do not exist.

- [ ] **Step 3: Implement deterministic and Transformers.js embedders**

Set `env.allowRemoteModels = false` and `env.localModelPath = modelRoot` before pipeline creation. Load `feature-extraction` with `local_files_only: true`, `device: 'cpu'`, and `dtype: 'q8'`; call the extractor with `{ pooling: 'mean', normalize: true }`. Validate the immutable model manifest before load, cap batch size through Config, and ensure diagnostics contain no query or source text.

- [ ] **Step 4: Write failing hybrid ranking tests**

Cover bounded BM25 candidates, exact cosine candidates, reciprocal-rank fusion, exact heading/path boosts, deterministic tie-breaking, MMR duplicate reduction, adjacent-chunk diversity, limits 1 through 10, empty results, and stable ordering for an unchanged index/query.

- [ ] **Step 5: Implement BM25, exact cosine, RRF, boosts, and MMR**

Query FTS with the normalized token stream, score every stored normalized vector with exact dot product, fuse the two ranked lists with configurable RRF `k`, add bounded heading/path term boosts, and select final rows with configurable MMR lambda. Tie-break by fused score, path, start line, and chunk ID.

- [ ] **Step 6: Run focused verification and commit**

Run: `pnpm vitest run packages/skill/skill-search-local/tests/embedder.spec.ts packages/skill/skill-search-local/tests/retrieval.spec.ts`

```powershell
git add packages/skill/skill-search-local/src/embedder.ts packages/skill/skill-search-local/src/retrieval.ts packages/skill/skill-search-local/tests
git commit -m "feat(skill-search): add local hybrid retrieval"
```

### Task 5: Local Provider Plugin and Model-Facing Tool

**Files:**
- Create: `packages/skill/skill-search-local/src/provider.ts`
- Create: `packages/skill/skill-search-local/src/index.ts`
- Create: `packages/skill/skill-search-local/src/invariant.ts`
- Create: `packages/skill/skill-search-local/tests/provider.spec.ts`
- Create: `packages/skill/skill-search-local/README.md`
- Create: `packages/skill/skill-search-local/README.zh.md`
- Create: `packages/skill/skill-search-local/README.i18n.yaml`
- Create: `packages/skill/tool-skill-search/package.json`
- Create: `packages/skill/tool-skill-search/tsconfig.json`
- Create: `packages/skill/tool-skill-search/src/index.ts`
- Create: `packages/skill/tool-skill-search/src/invariant.ts`
- Create: `packages/skill/tool-skill-search/tests/tool-skill-search.spec.ts`
- Create: `packages/skill/tool-skill-search/README.md`
- Create: `packages/skill/tool-skill-search/README.zh.md`
- Create: `packages/skill/tool-skill-search/README.i18n.yaml`

**Interfaces:**
- Produces: Cordis plugin `skill-search-local` with validated corpus/index/model/retrieval Config.
- Produces: model-facing tool `skill_search({ name, query, limit? })`.
- Consumes: Tasks 1 through 4, `ctx.tools`, the calling scope/cwd, and `GenericCallView.locations`/`GenericResultView.locations`.

- [ ] **Step 1: Write failing assembled provider tests**

Mount the real Skill registry and filesystem provider with a fixture directory, deterministic embedder, and temporary SQLite path. Verify first-query indexing, second-query reuse, incremental replacement, corpus-limit errors, failed-refresh preservation, cancellation, and provider disposal.

- [ ] **Step 2: Run provider tests and confirm missing plugin**

Run: `pnpm vitest run packages/skill/skill-search-local/tests/provider.spec.ts`

Expected: FAIL because the Cordis provider plugin does not exist.

- [ ] **Step 3: Implement validated Config and provider orchestration**

Config includes corpus declarations, database path, model root/manifest, chunk target/max/overlap, file/corpus/chunk ceilings, embedding batch size, lexical/vector candidate limits, RRF `k`, heading/path boosts, MMR lambda, and default/max result counts. Load-time validation rejects duplicate corpora, invalid extensions, missing SQLite FTS5, missing model resources, invalid numeric relationships, and an unwritable cache parent.

- [ ] **Step 4: Write failing tool schema, render, and presentation tests**

Verify exact JSON schemas, default limit 5, limit rejection outside 1 through 10, model-invocation policy, relative citations, line ranges, empty-result guidance, distinct structured errors, no absolute paths, and pure replayable presentation. The call view uses `{ card: 'generic', kind: 'search' }`; the result view lists `locations` for every hit.

- [ ] **Step 5: Implement `skill_search` and Session-compatible output**

Register a `defineTool` whose output schema contains the searched Skill, normalized result count, and hits. Render concise model-facing Markdown with `path:start-end`, heading trail, and excerpt. `presentCall` names the Skill/query; `presentResult` returns a generic search card and relative `FileLocation[]`. Let the existing tools/agent-loop path record ordinary `tool/call` and `tool/result` events, including replayable presentation metadata, without adding synthetic messages.

- [ ] **Step 6: Add invariants, bilingual package contracts, and focused tests**

Run: `pnpm vitest run packages/skill/skill-search-local/tests packages/skill/tool-skill-search/tests`

Run: `pnpm run verify-package-invariants -- packages/skill/skill-search-local packages/skill/tool-skill-search`

- [ ] **Step 7: Commit the provider and tool**

```powershell
git add packages/skill/skill-search-local packages/skill/tool-skill-search
git commit -m "feat(skill-search): expose local search tool"
```

### Task 6: Bundle Composition, Durable Transcript, and Documentation

**Files:**
- Modify: `packages/bundle/base/package.json`
- Modify: `packages/bundle/base/cordis.patch.yml`
- Modify: `apps/cli/config/agent-presets/standard/agent.cordis.yml`
- Modify: `packages/bundle/web-app/package.json`
- Modify: `packages/bundle/headless/package.json`
- Modify: `apps/cli/tests/fixtures/desktop-oasis-wiki/cordis.yml`
- Modify: `apps/cli/tests/fixtures/desktop-oasis-wiki/snapshot.ts`
- Modify: `apps/cli/tests/desktop-oasis-wiki.snapshot.ts`
- Create: `.agents/notes/implemented/feature/2026-08-27-local-skill-rag.md`
- Create: `.agents/notes/implemented/feature/2026-08-27-local-skill-rag.zh.md`
- Create: `.agents/notes/implemented/feature/2026-08-27-local-skill-rag.i18n.yaml`
- Modify: `docs/architecture.md`
- Modify: `docs/architecture.zh.md`
- Modify: `docs/tool-catalog.md` through its generator
- Modify: `docs/config-catalog.md` through its generator

**Interfaces:**
- Produces: host-plane `skill-search` registry and per-agent `tool-skill-search` registration in the standard preset.
- Produces: desktop Oasis corpus declaration sourced from environment-provided immutable Skill/model paths and mutable cache path.
- Consumes: the complete packages from Task 5.

- [ ] **Step 1: Write a failing keyless assembled snapshot**

Extend the existing desktop Oasis fixture to load `oasis-wiki`, call `skill_search` with a Chinese query through `ctx.tools.execute`, and serialize the durable `tool/call` and `tool/result` transcript. Use the deterministic fixture embedder selected only by the test overlay; assert every source starts with `references/` and carries line numbers.

- [ ] **Step 2: Run the snapshot and confirm missing composition**

Run: `pnpm run test:snapshot -- -t "desktop-bundled skill search"`

Expected: FAIL because the bundle and preset do not mount the three retrieval roles.

- [ ] **Step 3: Add package dependencies and Cordis rows**

Keep the `skill-search` Service Definition and `skill-search-local` provider on the host plane. Mount `tool-skill-search` with `tool-skill` in the standard agent preset so its registration is scoped to the calling agent. Declare the Oasis corpus explicitly in deployment configuration; do not read or modify Skill frontmatter to infer it.

- [ ] **Step 4: Record and replay the keyless snapshot**

Run: `pnpm run test:snapshot:record -- -t "desktop-bundled skill search"`

Run: `pnpm run test:snapshot -- -t "desktop-bundled skill search"`

Expected: PASS with a stable Chinese query, relative citations, ordinary durable tool events, and no model/network credential.

- [ ] **Step 5: Write the implemented Agent Note and current-state docs**

Record why retrieval is explicit and local, why the Service Definition/provider/tool are separate, why corpora are opt-in, why exact cosine is sufficient for bounded Skill corpora, and why automatic injection, relay embeddings, implicit full-Skill scans, and a learned reranker were rejected. Update architecture and Skill subsystem documentation without duplicating package-level Config tables.

- [ ] **Step 6: Regenerate catalogs and bilingual pairing records**

Run: `pnpm run gen-tool-catalog`

Run: `pnpm run gen-config-catalog`

Run the targeted `verify-translation-pairing --write` command for every changed bilingual pair.

- [ ] **Step 7: Run relevant checks and commit**

Run: `pnpm vitest run packages/bundle/base packages/bundle/web-app packages/bundle/headless apps/cli/tests/desktop-oasis-wiki.snapshot.ts`

Run: `pnpm run typecheck`

Run: `pnpm run lint`

Run: `pnpm run doc-sync`

```powershell
git add packages/bundle apps/cli/config/agent-presets apps/cli/tests .agents/notes/implemented/feature docs
git commit -m "feat(bundle): enable local skill rag"
```

### Task 7: Desktop Model Resources and Staging Validation

**Files:**
- Create: `apps/desktop/bundled-models/bge-small-zh-v1.5/model-manifest.json`
- Create: `apps/desktop/bundled-models/bge-small-zh-v1.5/LICENSE`
- Add binary resources: `apps/desktop/bundled-models/bge-small-zh-v1.5/config.json`
- Add binary resources: `apps/desktop/bundled-models/bge-small-zh-v1.5/onnx/model_quantized.onnx`
- Add binary resources: `apps/desktop/bundled-models/bge-small-zh-v1.5/special_tokens_map.json`
- Add binary resources: `apps/desktop/bundled-models/bge-small-zh-v1.5/tokenizer_config.json`
- Add binary resources: `apps/desktop/bundled-models/bge-small-zh-v1.5/tokenizer.json`
- Add binary resources: `apps/desktop/bundled-models/bge-small-zh-v1.5/vocab.txt`
- Modify: `apps/desktop/electron-builder.yml`
- Modify: `apps/desktop/src/environment.ts`
- Modify: `apps/desktop/tests/environment.spec.ts`
- Modify: `apps/desktop/scripts/staged-inventory.mjs`
- Modify: `apps/desktop/tests/staged-inventory.spec.ts`
- Create: `apps/desktop/scripts/verify-model-resources.mjs`
- Create: `apps/desktop/tests/model-resources.spec.ts`
- Modify: `apps/desktop/README.md`
- Modify: `apps/desktop/README.zh.md`
- Modify: `apps/desktop/RUNTIME_NOTICES.md`

**Interfaces:**
- Produces: immutable packaged model root `resources/models/bge-small-zh-v1.5`.
- Produces: child environment `DSH_SKILL_SEARCH_MODEL_DIR` and `DSH_SKILL_SEARCH_CACHE_DIR`.
- Consumes: the model manifest contract from Task 4 and desktop paths/environment construction.

- [ ] **Step 1: Write failing environment and model-manifest tests**

Assert exact model/cache paths, inherited environment immutability, required file inventory, pinned repository/revision/license, all six approved SHA-256 values, rejection of a missing/tampered file, and rejection of any reparse point beneath model resources.

- [ ] **Step 2: Run desktop tests and confirm missing resources**

Run: `pnpm vitest run apps/desktop/tests/environment.spec.ts apps/desktop/tests/model-resources.spec.ts apps/desktop/tests/staged-inventory.spec.ts`

Expected: FAIL because the model resources, environment variables, and verifier do not exist.

- [ ] **Step 3: Stage the approved local-only model snapshot**

Add the exact `Xenova/bge-small-zh-v1.5` files at revision `75c43b069aac4d136ba6bc1122f995fedcfd2781`. The manifest records upstream `BAAI/bge-small-zh-v1.5`, MIT license, Transformers.js version `4.2.0`, and these hashes: `config.json` `d4193ead3a810fd694fa8a31d7fc72fbaebc0668b603e398734bf2f6538ff42f`; `onnx/model_quantized.onnx` `15b717c382bcb518ba457b93ea6850ede7f4f1cd8937454aa06972366cd19bcc`; `special_tokens_map.json` `b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3`; `tokenizer_config.json` `e6f3b96db926a37d4039995fbf5ad17de158dfb8f6343d607e4dbaad18d75f5a`; `tokenizer.json` `48cea5d44424912a6fd1ea647bf4fe50b55ab8b1e5879c3275f80e339e8fae26`; `vocab.txt` `45bbac6b341c319adc98a532532882e91a9cefc0329aa57bac9ae761c27b291c`.

- [ ] **Step 4: Add Electron resources, child paths, and staging verification**

Copy `bundled-models` to `resources/models`, set the model directory to the immutable resource path and cache directory under desktop user data, extend staged inventory, verify hashes before packaging, and keep both paths out of global `PATH` and the user's Skill directory.

- [ ] **Step 5: Run desktop verification and commit**

Run: `pnpm vitest run apps/desktop/tests`

Run: `pnpm --dir apps/desktop run stage:verify`

```powershell
git add apps/desktop
git commit -m "build(desktop): bundle local embedding model"
```

### Task 8: Packaged Search Smoke, Installation, and Runtime Acceptance

**Files:**
- Modify: `apps/desktop/scripts/smoke-unpacked.mjs`
- Modify: `apps/desktop/tests/smoke-unpacked.spec.ts`
- Generated output: `apps/desktop/release/**` remains untracked release output.

**Interfaces:**
- Consumes: the assembled application, real ONNX model, bundled `oasis-wiki`, persistent cache, and desktop supervisor.
- Produces: unpacked and installed runtime evidence for first-build and restart reuse.

- [ ] **Step 1: Write failing packaged-search smoke tests**

Factor a helper that invokes the packaged Harness with its normal Web profile and a fresh desktop user-data directory, creates a Session through the loopback API, loads `oasis-wiki`, runs one Chinese `skill_search`, and checks relative `references/` results. Restart against the same user-data directory and assert the same corpus identity and a usable persisted index.

- [ ] **Step 2: Run the focused smoke tests and confirm the missing search phase**

Run: `pnpm vitest run apps/desktop/tests/smoke-unpacked.spec.ts`

Expected: FAIL because the current smoke test verifies startup only and does not execute `skill_search`.

- [ ] **Step 3: Extend unpacked smoke verification**

Keep existing tool/runtime, reparse-point, HTTP 200, no-default-browser, liveness, and shutdown checks. Add model-manifest verification before launch, perform the real Chinese retrieval, prove every citation remains within the declared Oasis corpus, restart once with the same cache, and fail if desktop/Harness processes remain after shutdown.

- [ ] **Step 4: Run the repository checks selected by `dsh-pre-push-checks`**

Use `.agents/skills/dsh-pre-push-checks/SKILL.md`; run only the focused package, snapshot, documentation, build, hygiene, and packed-path checks selected for the final diff. Run `git diff --check` before packaging.

- [ ] **Step 5: Build and verify the unpacked application**

Run: `pnpm --dir apps/desktop run package:dir`

Run: `pnpm --dir apps/desktop run smoke:unpacked`

Expected: real local model load, Chinese Oasis results, restart reuse, HTTP 200, zero reparse points, and complete process shutdown.

- [ ] **Step 6: Build, install, launch, and manually verify the Windows package**

Run: `pnpm --dir apps/desktop run package`

Compute the installer SHA-256, close the old installed application, install the new x64 package, launch it, open one Session, load `oasis-wiki`, ask an Oasis API question that requires `skill_search`, inspect the returned citations, restart the app, repeat the search, and close the window. Confirm the installed Electron and Harness child processes both exit.

- [ ] **Step 7: Inspect final source and release state**

Run: `git status --short --branch`

Report separately: implemented source, commits, package output, installer path/hash, installed version/path, automated unpacked verification, manual installed-app verification, and any pre-existing unrelated check failure. Do not claim push or release publication.
