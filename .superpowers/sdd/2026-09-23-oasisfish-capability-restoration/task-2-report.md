# Task 2 Report: Restore Local Skill Retrieval

Date: 2026-09-23

## Status

Restored the provider-neutral Skill search registry, the directory-backed local provider, and the model-facing `skill_search` tool. The implementation uses explicit corpus declarations, confined filesystem discovery, heading-aware chunking, transactional SQLite refresh, verified local Transformers.js models, hybrid lexical/vector ranking, and scoped resource disposal.

## Behavior

- Added branded corpus and provider identifiers and `ctx.skillSearch.registerProvider(name, provider)` with exact Cordis effect disposal.
- Resolved model-invocable Skills before dispatching declared corpora to the first visible supporting provider.
- Bounded provider results to the requested count and the model-facing maximum of ten passages.
- Preserved structured `SkillSearchError` codes through tool diagnostics.
- Confined discovery to declared directory roots, rejected traversal, symbolic links, reparse points, invalid UTF-8, and byte/chunk limit violations.
- Chunked Markdown by heading hierarchy and plain text by paragraph with bounded prose overlap and stable source lines.
- Stored document fingerprints, chunks, FTS rows, and little-endian vectors in atomic SQLite revisions.
- Preserved the last committed revision across embedding failure, cancellation, and transaction rollback.
- Verified immutable local model manifests and SHA-256 hashes before creating a CPU/q8, local-files-only Transformers.js pipeline.
- Combined BM25 and exact vector ranks with reciprocal-rank fusion, heading/path boosts, stable ordering, and maximal marginal relevance.
- Aborted active provider work and awaited store/model teardown before disposal completed.

## Files

- Service Definition: `packages/skill/skill-search/`.
- Local Service Provider: `packages/skill/skill-search-local/`.
- Model-facing Consumer: `packages/skill/tool-skill-search/`.
- Skill subsystem documentation: `packages/skill/README.*` and `docs/subsystems/skills.*`.
- Generated catalogs and graphs: `docs/{capability-seams,config-catalog,tool-catalog}*`, `packages/extensions/tool-cordis/src/api-catalog.ts`, and their generators.
- Workspace integration: `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `tsconfig.host.json`, and `scripts/type-equiv.manifest.json`.

No product composition or vendored source changed.

## RED/GREEN Evidence

- Historical restore RED: focused tests failed because the old registry construction used `create` as a function against the current Cordis API.
- Cancellation RED: an uncooperative provider left `search()` unsettled after caller cancellation.
- Bounding RED: a provider returned four passages when the request limit was two.
- Tool failure RED: structured Skill search error metadata was absent from the tool result.
- Lifecycle RED: duplicate provider registration leaked the opened store/model resources.
- Declaration-merging RED: the current compiler program did not expose `ctx.skillSearch` to consumers.
- Tokenization RED: adjacent Latin and CJK text produced `abc中文` instead of Latin tokens plus CJK unigrams/bigrams.
- Overlap RED: a zero overlap budget used `slice(-0)` and copied the complete preceding passage.
- Validation RED: `NaN` heading/path boosts passed retrieval validation.
- Promise RED: the deterministic fixture embedder threw cancellation synchronously despite its Promise-returning interface.
- Each regression passed after the corresponding implementation change; existing-behavior coverage cases were added directly without assertionless line-touch tests.

## Final Verification

- `pnpm exec vitest run packages/skill/skill-search/tests packages/skill/skill-search-local/tests packages/skill/tool-skill-search/tests --coverage --coverage.include='packages/skill/skill-search/src/**/*.ts' --coverage.include='packages/skill/skill-search-local/src/**/*.ts' --coverage.include='packages/skill/tool-skill-search/src/**/*.ts'`: 12 files passed, 159 tests passed; statements, branches, functions, and lines are each 100% per file.
- `pnpm exec tsc -b packages/skill/skill-search/tsconfig.json packages/skill/skill-search-local/tsconfig.json packages/skill/tool-skill-search/tsconfig.json --pretty false`: passed.
- `pnpm exec tsx scripts/run-oxlint.ts packages/skill/skill-search packages/skill/skill-search-local packages/skill/tool-skill-search packages/extensions/tool-cordis/src/api-catalog.ts scripts/gen-cordis-catalog.ts scripts/gen-doc-graphs.ts scripts/gen-tool-catalog.ts scripts/verify-package-readme-model-experience.ts`: passed.
- `pnpm run build`: passed, including Host and Client TypeScript programs, runtime bundles, and the Web frontend build.
- `pnpm run typecheck:contracts-ready`: passed.
- `pnpm run doc-typecheck:contracts-ready`: passed; 86 documentation blocks compiled.
- `pnpm run test:docs`: 19 gates passed; only the unchanged `docs/event-producer-consumer.md` translation-pair baseline failed.
- `pnpm run doc-sync`: 37 gates passed, including documentation build, graphs, catalogs, links, JSDoc, type equivalence, subsystem pages, and site checks.
- `git diff --check`: passed before report creation and will be repeated on the staged diff.

## Scoped Failures

- `pnpm run typecheck` and `pnpm run doc-typecheck` invoke unavailable `npm` in this environment. Their declared direct pnpm subcommands pass; `pnpm run build` also completes both compiler faces.
- `pnpm run test:docs` and `pnpm run doc-sync` report the unchanged translation-pair drift in `docs/event-producer-consumer.md`.
- `pnpm run doc-sync` also reports the pre-existing stale persistence catalog and `docs/persistence-schema.json` through `verify-persistence-catalog` and `verify-persistence-changes`.
- Earlier repository-wide lint and hygiene audits reported only unchanged circuit-breaker/tool-catalog, desktop-host constraint, pre-rescope design-document, invariant, and Oasis UI localization backlog outside this task.

## Self-Review

- Confirmed every restored source file satisfies the repository's per-file 100% coverage gate without exclusions or lowered thresholds.
- Confirmed temporary filesystem fixtures use private roots and cancellation tests use explicit barriers.
- Confirmed SQLite handles, provider work, model runtimes, scoped registrations, and temporary roots reach quiescent teardown.
- Confirmed remote model loading is disabled and every declared model file is hashed before pipeline creation.
- Confirmed database schema versioning remains monotonic and incompatible caches fail instead of being overwritten.
- Confirmed generated English and Chinese catalogs/graphs and all task-owned pairing sidecars match the source changes.
- Confirmed the lockfile contains only the three workspace importers and the pinned Transformers.js/ONNX transitive dependency graph required by the local provider.

## Concern

This task publishes the local retrieval capability but does not compose it into a shipped profile or stage a model directory. Task 3 must supply the immutable model resources and product composition; until then, deployment must provide `modelRoot` and its verified manifest explicitly.

## Review Round 1

### Status

Addressed all seven review findings without changing shipped product composition or vendored source. Disposal now aborts and awaits active searches before independently attempting both resource teardowns, corpus discovery reads each source through one identity-checked handle and applies limits to the bytes read, version-zero SQLite adoption is empty-only and transactional, overlap retains the true first source line, direct registry calls validate safe-integer limits from 1 through 10, model-facing copy is provider-neutral, and both real-Loader and recorded-session coverage exercise the assembled tool.

### RED/GREEN Evidence

- The initial focused review run recorded eight expected failures across provider lifecycle, file replacement and byte growth, version-zero schema adoption, overlap line mapping, direct limits, and model-facing copy; the same six files then passed 84 tests after the fixes.
- `pnpm exec vitest run packages/skill/skill-search-local/tests/provider.spec.ts -t 'attempts both resource teardowns when they throw synchronously'`: RED, 1 failed; the eager teardown call surfaced only `store close threw` and never aggregated the model failure.
- The same synchronous-teardown command after deferring each call with `Promise.resolve().then(...)`: GREEN, 1 passed.
- The first three-package coverage run passed 169 tests but correctly failed the per-file gate with 17 uncovered locations in the new rejection paths.
- After adding deterministic boundary cases and removing unreachable overlap guards, the final coverage command passed 14 files and 175 tests at 100% statements, branches, functions, and lines.

### Final Verification

- `pnpm exec vitest run packages/skill/skill-search/tests packages/skill/skill-search-local/tests packages/skill/tool-skill-search/tests --coverage --coverage.include='packages/skill/skill-search/src/**/*.ts' --coverage.include='packages/skill/skill-search-local/src/**/*.ts' --coverage.include='packages/skill/tool-skill-search/src/**/*.ts'`: 14 files passed, 175 tests passed; 100% statements, branches, functions, and lines.
- `pnpm exec tsc -b packages/skill/skill-search/tsconfig.json packages/skill/skill-search-local/tsconfig.json packages/skill/tool-skill-search/tsconfig.json --pretty false`: passed.
- `pnpm exec tsx scripts/run-oxlint.ts packages/skill/skill-search packages/skill/skill-search-local packages/skill/tool-skill-search packages/extensions/tool-cordis/src/api-catalog.ts scripts/gen-cordis-catalog.ts scripts/gen-tool-catalog.ts`: passed.
- `pnpm run build`: passed, including host/client TypeScript, runtime bundles, and the Web production build.
- `DSH_EXAMPLE_MODE=lib pnpm exec vitest run packages/skill/tool-skill-search/tests/loader.spec.ts`: 1 test passed through the real Loader composition and built package exports.
- `DSH_SNAPSHOT=refresh DSH_EXAMPLE_MODE=lib pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t 'skill-search'`: 1 scenario passed and refreshed the authored prompt/schema sidecars.
- `DSH_EXAMPLE_MODE=lib pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t 'skill-search'`: 1 scenario passed on replay after the refresh.
- `pnpm run doc-typecheck:contracts-ready`: 86 documentation blocks compiled.
- `pnpm run verify-translation-pairing packages/skill/skill-search/README.md packages/skill/skill-search-local/README.md packages/skill/tool-skill-search/README.md docs/tool-catalog.md docs/subsystems/skills.md`: five named pairs consistent.
- `pnpm run test:docs`: 19 gates passed; only the unchanged `docs/event-producer-consumer.md` pair failed.
- `pnpm run doc-sync`: 37 gates passed; task-owned catalog, JSDoc, subsystem, README, link, site, and pairing checks passed.
- `git diff --cached --check`: passed; the 43 staged paths contain no shipped bundle/profile composition, `vendor/`, `lib/`, or coverage output.

### Scoped Failures

- `pnpm run doc-sync` cannot run its `doc-typecheck` wrapper on this Windows host because `npm` is unavailable; the direct pnpm-backed `doc-typecheck:contracts-ready` command passed.
- The repository-wide translation check still reports the unchanged `docs/event-producer-consumer.md` pairing drift.
- The repository-wide persistence checks still report the unchanged stale persistence catalog and `docs/persistence-schema.json`.

### Self-Review

- Confirmed the snapshot composition uses bare package names, disables both platform-selected shell tools, and supplies a shell-neutral persona so its pinned prompt and schema remain platform-independent.
- Confirmed Loader fixtures use private temporary roots, no shared ports, deterministic provider output, and quiescent Cordis disposal.
- Confirmed the outgoing paths contain no shipped bundle/profile composition, `vendor/`, `lib/`, or coverage output.
