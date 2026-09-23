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

## Review Round 1

### Status

Desktop resource preparation now rejects filesystem links before copying Skill trees, copies without dereferencing links, removes partial destinations on failure, and verifies the copied tree again. The staged retrieval check now owns an exact 204-file path and SHA-256 inventory for the Oasis Wiki, image guidance, and local model; the model license is included in both the model manifest and the staged inventory.

The top-level `oasisfish-desktop-skill-search` Session snapshot applies the real Desktop Host product patch before its scenario patch, seeds reviewed packaged Skill files, replaces only the production embedding provider and model with deterministic local embeddings, and persists the real `skill_search` call and result for `oasis-wiki`.

### RED/GREEN Evidence

- Resource RED: `pnpm exec vitest run apps/desktop/tests/primary-runtime-preparation.spec.ts apps/desktop/tests/staged-inventory.spec.ts` reported 12 failed and 15 passed before link rejection, license hashing, and exact inventory verification were implemented.
- Resource GREEN: the same two files reported 27 passed after the fix.
- Manifest RED: `pnpm exec vitest run packages/test-support/session-snapshot/tests/manifest.spec.ts` reported 5 failed and 40 passed while `profilePatches` was unknown.
- Manifest GREEN: the same file reported 45 passed after repository-relative POSIX patch validation was added.
- Snapshot RED: built replay reached the real product composition and differed from the copied fixture by listing both packaged Skills and returning `references/mcp-integration.md:34-51` instead of the old fixture passage.
- Snapshot GREEN: built refresh and replay each reported 1 passed with 124 unrelated scenarios skipped.

### Verification

- `pnpm exec vitest run apps/desktop/tests/primary-runtime-preparation.spec.ts apps/desktop/tests/staged-inventory.spec.ts packages/test-support/session-snapshot/tests/manifest.spec.ts apps/desktop/tests/packaged-skill-search.spec.ts`: 4 files passed, 73 tests passed.
- `DSH_EXAMPLE_MODE=lib pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t "oasisfish-desktop-skill-search"`: 1 passed, 124 skipped.
- `pnpm run verify-cordis-config`: 211 configuration files passed.
- `pnpm exec tsc -b packages/test-support/session-snapshot/tsconfig.json apps/desktop/tsconfig.json`: passed.
- Focused `scripts/run-oxlint.ts` over the changed TypeScript, JavaScript, and declaration files: passed.
- `pnpm --filter @deepseek-ai/dsh-desktop run build`: passed.
- `pnpm run build:lib:host`: passed.
- Named translation pairing checks for `docs/testing.md` and `packages/test-support/session-snapshot/README.md`: passed.
- `pnpm run verify-doc-budgets`: passed.
- `pnpm run test:docs`: 19 gates passed; the unchanged `docs/event-producer-consumer.md` pair remains out of sync.
- `pnpm run doc-sync`: 37 gates passed; remaining failures are the unavailable `npm` executable, the same unchanged translation pair, and unchanged stale persistence catalog/history artifacts.
- `git diff --check`: passed before this report update and is repeated before commit.

### Self-Review

- Confirmed link tests use file symlinks plus Windows junctions or POSIX directory symlinks, allocate private temporary roots, and remove them after each case.
- Confirmed the inventory rejects missing, modified, extra, directory-substituted, linked-file, and linked-parent-directory entries.
- Confirmed generic profiles still declare no Oasis corpora and mount no local provider.
- Confirmed the snapshot uses the real `apps/desktop-host/oasisfish.cordis.patch.yml`; scenario patches disable the production model-backed provider and preserve the product corpus declarations and model-facing tool.
- Confirmed the deterministic provider database is isolated under the launch workspace and disposed to quiescence through a Cordis effect.

### Concern

The default source-mode headless snapshot lane fails both the existing `skill-search` scenario and the new Oasisfish scenario because `agent-loop` and `tools` resolve distinct scheduler symbols, producing `Cannot read properties of undefined (reading 'prepare')`. A full Host build does not change that result. The shipped built-artifact lane used by CI passes the new scenario; this round does not widen into the pre-existing source-launch resolution defect.

## Review Round 2

### Status

The staged retrieval verifier now walks the complete capability-owned `bundled-skills` and `models` roots. The approved 204-file inventory remains exact, while undeclared sibling files, directories, filesystem links, missing files, modified files, and non-regular replacements anywhere under those roots fail staging.

`profilePatches` is now a headless-only manifest field because only the headless snapshot runner consumes it. Its path validation uses explicit repository-relative POSIX rules instead of host `node:path` absolute-path semantics, so POSIX absolute, Windows drive, UNC, device, backslash, traversal, empty, and dot paths are rejected consistently on every host.

### RED/GREEN Evidence

- RED: `pnpm exec vitest run apps/desktop/tests/staged-inventory.spec.ts packages/test-support/session-snapshot/tests/manifest.spec.ts` reported 7 failed and 62 passed. The failures covered rogue Skill and model siblings, a linked rogue sibling, SDK/ACP/Web manifests that silently accepted `profilePatches`, and a Windows drive-relative patch path.
- GREEN: the same command reported 2 files passed and 69 tests passed after the verifier started at the owned staged roots and the manifest parser enforced the headless-only portable path rules.
- Full focused GREEN: `pnpm exec vitest run apps/desktop/tests/primary-runtime-preparation.spec.ts apps/desktop/tests/staged-inventory.spec.ts packages/test-support/session-snapshot/tests/manifest.spec.ts apps/desktop/tests/packaged-skill-search.spec.ts` reported 4 files passed and 88 tests passed.
- Built snapshot refresh: `$env:DSH_EXAMPLE_MODE='lib'; $env:DSH_SNAPSHOT='refresh'; pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t 'oasisfish-desktop-skill-search'` reported 1 passed and 124 skipped with no fixture drift.
- Built snapshot replay: `$env:DSH_EXAMPLE_MODE='lib'; pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t 'oasisfish-desktop-skill-search'` reported 1 passed and 124 skipped.

### Verification

- `pnpm exec tsc -b packages/test-support/session-snapshot/tsconfig.json apps/desktop/tsconfig.json`: passed.
- `pnpm exec tsx scripts/run-oxlint.ts apps/desktop/scripts/staged-inventory.mjs apps/desktop/tests/staged-inventory.spec.ts packages/test-support/session-snapshot/src/manifest.ts packages/test-support/session-snapshot/tests/manifest.spec.ts`: passed.
- `pnpm run verify-cordis-config`: 211 configuration files passed.
- `pnpm --filter @deepseek-ai/dsh-desktop run build`: passed.
- `pnpm run build:lib:host`: passed.
- `pnpm run verify-translation-pairing packages/test-support/session-snapshot/README.md`: the named pair is consistent.
- `pnpm run verify-doc-budgets`: passed.
- `git diff --check`: repeated after this report update and before commit.

### Self-Review

- Confirmed the verifier owns only `bundled-skills` and `models`; unrelated runtime roots such as `primary-runtime` and `office-skills` remain outside this inventory.
- Confirmed each approved file and directory derives from the inventory while the complete owned-root walk exposes rogue siblings before digest comparison.
- Confirmed a missing owned root becomes approved-file omissions, and a filesystem link anywhere beneath an owned root fails before traversal follows it.
- Confirmed headless manifests retain the existing patch order: repository-owned profile patches first, then the scenario patch.
- Confirmed SDK, ACP, and Web manifests reject `profilePatches` during parsing rather than carrying ignored configuration into their runners.
- Confirmed normalized repository-relative POSIX `.yml` paths remain accepted while all requested absolute, platform-specific, traversal, empty, and dot forms are rejected by table tests.

### Concern

The pre-existing default source-mode scheduler-symbol failure described in Review Round 1 remains outside this round. The rebuilt artifact lane used by CI refreshes and replays the Oasisfish scenario successfully.
