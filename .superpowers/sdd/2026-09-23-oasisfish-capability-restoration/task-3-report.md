# Task 3 Report: Package Skill Retrieval for Oasisfish Desktop

Date: 2026-09-23

## Status

Oasisfish Desktop now packages explicit local retrieval for `oasis-wiki` and `ai-image-prompts`. The generic base profile provides the provider-neutral registry and model-facing tool with no declared corpora; the Oasisfish product patch declares only the two reviewed `references` roots and mounts the local provider with immutable model and mutable cache paths supplied by the Desktop Host.

## Packaged Assets

- Restored the released image-guidance Skill and local embedding model from tag `v1.20260912.4`.
- Packaged model: `Xenova/bge-small-zh-v1.5`, upstream `BAAI/bge-small-zh-v1.5`, revision `75c43b069aac4d136ba6bc1122f995fedcfd2781`, 512 dimensions, MIT license, Transformers.js `4.2.0`.
- Model resources contain eight files totaling 24,562,868 bytes. The quantized ONNX file is 24,010,842 bytes with SHA-256 `15b717c382bcb518ba457b93ea6850ede7f4f1cd8937454aa06972366cd19bcc`.
- Runtime preparation accepts only the approved manifest, rejects missing files and manifest or digest changes, rejects links in required paths, and copies only the manifest, license, and six approved model resources.
- Staging verifies the retrieval inventory after copying both bundled Skills and the model. No runtime download path was added.

## Composition

- Added `skill-search` with an empty corpus list and `tool-skill-search` to the shared base bundle.
- Added exact Oasisfish corpus declarations for `oasis-wiki/references` and `ai-image-prompts/references`; no loaded Skill becomes searchable implicitly.
- Added the product-only `skill-search-local` row with required model and cache environment paths.
- Added resolver dependencies to the base, CLI, Desktop Host, and private Desktop runtime resolver manifests. The workspace constraint gate now classifies the dependency-only resolver as a private build project instead of a published app.
- The Desktop Host sets `DSH_SKILL_SEARCH_MODEL_DIR` under signed runtime resources and `DSH_SKILL_SEARCH_CACHE_DIR` under `$DSH_HOME/cache/skill-search`.
- Generated `apps/cli/composition.md` now records the two new base rows.

## RED/GREEN Evidence

- Initial focused RED: seven failures reported the missing image-guidance Skill and model, absent verification and staged-inventory APIs, missing resolver inventory, and missing Host model/cache paths.
- The first real-Loader snapshot attempted to embed the complete 4.6 MB Oasis corpus with the packaged model and exceeded 180 seconds. Direct model initialization completed in about 363 ms and a query embedding in about 8 ms, isolating full-corpus test indexing as the cause.
- The keyless composition snapshot now boots the real Loader and actual bundled corpora with a private deterministic fixture embedder. It completes in about eight seconds, returns the intended Oasis and Game Item Icon passages, and records `CORPUS_UNDECLARED` for a third Skill that contains a real hidden resource.
- The packaged restart smoke uses the real verified model and minimal staged copies of both declared Skills. Its first run creates two corpus revisions; a complete Loader restart reuses the same revisions and ranked passages in about ten seconds.
- Restart RED exposed small cross-process floating-point score drift from real query embeddings. The final assertion compares ranked content without query-time scores and verifies persisted revision identity directly from SQLite.

## Final Verification

- `pnpm exec vitest run apps/desktop/tests/primary-runtime-preparation.spec.ts apps/desktop/tests/staged-inventory.spec.ts apps/cli/tests/desktop-oasis-wiki.snapshot.ts`: 3 files passed, 19 tests passed.
- `pnpm exec vitest run packages/bundle/base/tests/base.spec.ts apps/desktop/tests/host-process.spec.ts apps/desktop/tests/packaged-skill-search.spec.ts scripts/check-workspace-constraints.spec.ts`: 4 files passed, 37 tests passed.
- `pnpm run verify-cordis-config`: 209 configuration files passed.
- `pnpm exec tsc -b packages/bundle/base/tsconfig.json apps/desktop-host/tsconfig.json apps/desktop/tsconfig.json apps/cli/tsconfig.json`: passed.
- Focused `scripts/run-oxlint.ts` over all changed TypeScript and JavaScript implementation and test files: passed.
- `pnpm --filter @deepseek-ai/dsh-desktop run build`: passed.
- `pnpm run build:lib:host`: passed, including the CLI, Desktop Host, Desktop shell, and host runtime bundles.
- `pnpm run verify-translation-pairing apps/desktop/README.md`: the named Desktop README pair is consistent.
- `pnpm run verify-doc-graphs`: six generated graph documents are current after regenerating `apps/cli/composition.md`.
- `git diff --check`: passed before report creation and will be repeated on the staged diff.

## Scoped Failures

- `pnpm run doc-sync` passed 36 gates. Its task-related graph failure was fixed. Remaining failures are the unavailable `npm` executable in the wrapper, the unchanged `docs/event-producer-consumer.md` pairing drift, and unchanged stale persistence catalog/schema artifacts.
- `pnpm run constraints` now reports only the existing Desktop Host publication-files policy mismatch: its manifest includes `oasisfish.cordis.patch.yml` while the gate expects only `lib/index.js`.
- Signed installer, notarization, installed-update, and target-specific native qualification were not run because they require the release environment.

## Self-Review

- Confirmed generic profiles receive no Oasis corpus defaults and no local provider.
- Confirmed mutable SQLite state remains outside signed application resources and the model provider receives no remote download path.
- Confirmed the real Loader snapshot uses the actual full bundled Skill trees while the real-model restart smoke limits only its test fixture corpus.
- Confirmed the existing `ui-codex-bridge` enablement remains in the Oasisfish patch and the complete `oasis-wiki` bundle remains staged.
- Confirmed the diff does not alter the updater, Oasis workflow UI, Wallpaper Engine package and patch, Office Skill preparation, or Codex bridge implementation.
- Confirmed the private runtime resolver manifest has a tested current role and the production closure still depends on the CLI and Desktop Host manifests.

## Concern

None for Task 3.
