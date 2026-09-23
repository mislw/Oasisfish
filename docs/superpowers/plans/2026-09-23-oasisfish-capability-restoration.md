# Oasisfish Capability Restoration Implementation Plan

English | [中文](2026-09-23-oasisfish-capability-restoration.zh.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the released Oasisfish default-model preference, local Skill retrieval, native memory, auxiliary image generation, and image optimization on the current Desktop release architecture.

**Architecture:** Forward-port each capability into its current Cordis owner instead of merging the historical application branch. Provider-neutral services remain separate from Providers and model-facing tools; product-specific activation and binary resources remain in the Desktop and Oasisfish compositions. Existing Session records, attachment formats, updater behavior, Oasis UI workflow, Codex bridge, bundled Oasis Wiki, and Wallpaper Engine integration remain authoritative.

**Tech Stack:** TypeScript ESM, Cordis, Typert Remote, Schemastery and Zod, React, SQLite, Transformers.js/ONNX, Vitest, Playwright, pnpm workspaces, Electron Builder.

**Spec:** [Oasisfish Capability Restoration Design](../specs/2026-09-23-oasisfish-capability-restoration-design.md)

## Global Constraints

- Start from `codex/release-v1.20260923.1` in an isolated worktree and create `codex/oasisfish-capability-restoration` before implementation.
- Do not merge the historical product branch or replace the current Desktop startup, updater, Oasis UI workflow, Codex bridge, or Wallpaper Engine implementation.
- Preserve the released `native_memory` storage-domain name, version `0`, and stored type exactly.
- Model-visible memory, retrieval, optimization, and generation data must use existing durable message, tool, and attachment records; do not change `agent-loop` or add a Session event type.
- Local Skill source, embedding requests, memory records, credentials, and attachment bytes must not leave their owning operation or appear in unrelated diagnostics.
- Product-visible UI copy must use typed English and Simplified Chinese locale dictionaries.
- Every new registration must use `ctx.effect()`, `ctx.on()`, or a registry disposer and prove disposal.
- Every product-visible capability requires a real Loader composition test and the relevant keyless Session or Web snapshot.
- Preserve one trailing newline, strict TypeScript, ESM imports, package README pairs, generated catalogs, and current package-group conventions.

## Execution Setup

- [ ] Verify the release worktree is clean and create the implementation branch.

```powershell
git status --short --branch
git switch -c codex/oasisfish-capability-restoration
```

- [ ] Record the baseline checks without running the full repository suite.

```powershell
pnpm exec vitest run packages/core/agent-default-model/tests/agent-default-model.spec.ts packages/api/session-controller/tests/session-models.host.spec.ts
pnpm run test:docs
```

### Task 1: Restore the Default-Model Settings Editor

**Files:**
- Modify: `packages/api/session-controller/src/types.ts`
- Modify: `packages/api/session-controller/src/commands.ts`
- Modify: `packages/api/session-controller/src/index.ts`
- Modify: `packages/api/session-controller/tests/session-models.host.spec.ts`
- Modify: `packages/client/ui-settings-models/src/client/store.ts`
- Modify: `packages/client/ui-settings-models/src/client/ModelsSection.tsx`
- Modify: `packages/client/ui-settings-models/src/client/ModelsSection.module.css`
- Modify: `packages/client/ui-settings-models/src/client/locales.ts`
- Modify: `packages/client/ui-settings-models/tests/store.client.spec.ts`
- Modify: `packages/client/ui-settings-models/tests/components.client.spec.tsx`
- Modify: `packages/client/ui-settings-models/README.md`
- Modify: `packages/client/ui-settings-models/README.zh.md`

**Interfaces:**
- Consumes: `ctx.agentDefaultModel.currentSelection()`, `ctx.agentDefaultModel.saveSelection(selection)`, and `ctx.llm.resolveCallConfig(request)`.
- Produces: `session.setDefaultModel(request): Promise<{ selected: AgentModelSelection }>` and a Models-page editor backed by `ModelCatalog.default`.

- [ ] Add failing Host tests for saving a normalized default without a Session, clearing an omitted reasoning effort, and refusing an unavailable route.

```text
expectValue(await remote.setDefaultModel({ provider: 'deepseek-official', model: 'deepseek-chat' }))
expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'deepseek-official', model: 'deepseek-chat' })
```

- [ ] Run the focused Host test and confirm the missing Remote method fails.

```powershell
pnpm exec vitest run packages/api/session-controller/tests/session-models.host.spec.ts
```

- [ ] Add the typed request, Remote method, and command implementation; share the same `resolveCallConfig()` normalization used by `selectModel()` and return a detached selected value.

```ts
export interface SessionSetDefaultModelRequest {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}
```

- [ ] Add failing Client tests for initial default selection, provider/model changes, effort clearing, save failure, and default-provider deletion protection.

```powershell
pnpm exec vitest run packages/client/ui-settings-models/tests/store.client.spec.ts packages/client/ui-settings-models/tests/components.client.spec.tsx
```

- [ ] Extend `ModelsSettingsState` with the catalog default, load `session.modelCatalog()` beside the provider directory, implement `selectDefault()`, and render localized provider/model/effort controls with a save button.

- [ ] Run focused Host and Client tests, update the README pair, re-record translation pairing, and commit.

```powershell
pnpm exec vitest run packages/core/agent-default-model/tests/agent-default-model.spec.ts packages/api/session-controller/tests/session-models.host.spec.ts packages/client/ui-settings-models/tests/store.client.spec.ts packages/client/ui-settings-models/tests/components.client.spec.tsx
git add packages/api/session-controller packages/client/ui-settings-models
git commit -m "feat(models): restore default model settings"
```

### Task 2: Restore the Local Skill Retrieval Service and Provider

**Files:**
- Restore from `v1.20260912.4`: `packages/skill/skill-search/`
- Restore from `v1.20260912.4`: `packages/skill/skill-search-local/`
- Restore from `v1.20260912.4`: `packages/skill/tool-skill-search/`
- Modify: `packages/skill/README.md`
- Modify: `packages/skill/README.zh.md`
- Modify: `tsconfig.base.json`
- Modify: `tsconfig.host.json`
- Modify: `pnpm-workspace.yaml`

**Interfaces:**
- Produces: `ctx.skillSearch.registerProvider(name, provider)`, corpus declarations, and `search(request, options)` with bounded source-addressed results.
- Provider input stays beneath loaded Skill resource roots; Provider output contains Skill id, relative path, one-based lines, excerpt, and score.

- [ ] Restore the three package trees as an implementation starting point without restoring historical composition files.

```powershell
git restore --source=v1.20260912.4 -- packages/skill/skill-search packages/skill/skill-search-local packages/skill/tool-skill-search
```

- [ ] Run their existing tests and record current API, dependency, compiler, or lifecycle failures.

```powershell
pnpm exec vitest run packages/skill/skill-search/tests packages/skill/skill-search-local/tests packages/skill/tool-skill-search/tests
```

- [ ] Adapt the Service Definition to current branded ids, Skill resource APIs, Cordis effect disposal, typed tool failures, and current package manifests; retain the released public operation names.

- [ ] Adapt confined discovery, heading-aware chunking, transactional SQLite refresh, local embedding, hybrid ranking, cancellation, and cache compatibility to current storage and Skill loader APIs.

- [ ] Add or update failing tests before each adapter change for traversal, reparse points, cancellation before commit, incompatible caches, Provider disposal, CJK retrieval, and bounded results.

- [ ] Run package tests and typecheck, update package READMEs and the Skill subsystem pair, then commit the provider-neutral capability.

```powershell
pnpm exec vitest run packages/skill/skill-search/tests packages/skill/skill-search-local/tests packages/skill/tool-skill-search/tests
pnpm run typecheck
git add packages/skill tsconfig.base.json tsconfig.host.json pnpm-workspace.yaml pnpm-lock.yaml docs/subsystems/skills.md docs/subsystems/skills.zh.md
git commit -m "feat(skill): restore local skill retrieval"
```

### Task 3: Package Skill Retrieval for Oasisfish Desktop

**Files:**
- Modify: `packages/bundle/base/cordis.patch.yml`
- Modify: `packages/bundle/base/package.json`
- Modify: `apps/desktop-host/oasisfish.cordis.patch.yml`
- Modify: `apps/desktop-runtime/package.json`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/scripts/prepare-primary-runtime.ts`
- Modify: `apps/desktop/scripts/staged-inventory.mjs`
- Modify: `apps/desktop/tests/primary-runtime-preparation.spec.ts`
- Modify: `apps/desktop/tests/staged-inventory.spec.ts`
- Create or restore: packaged embedding model manifest and licensed model files under the Desktop resource owner selected by current runtime preparation.
- Add: real Loader composition and packaged-search tests under `apps/cli/tests/` and `apps/desktop/tests/`.

**Interfaces:**
- Consumes: the Task 2 packages and current bundled Skill directories.
- Produces: explicit `oasis-wiki` and image-guidance corpus declarations plus immutable local model resources and mutable cache paths.

- [ ] Add failing composition tests that require exactly the declared corpora and refuse undeclared Skill resources.

- [ ] Add failing runtime-preparation tests for the model manifest, hashes, resolver dependencies, and missing-file rejection.

- [ ] Port the released model assets and corpus configuration into current Desktop resource preparation without adding a runtime download path.

- [ ] Add a keyless real-composition search snapshot and a packaged restart smoke that reuses the committed index.

- [ ] Run focused composition, staging, and search checks, then commit.

```powershell
pnpm exec vitest run apps/desktop/tests/primary-runtime-preparation.spec.ts apps/desktop/tests/staged-inventory.spec.ts apps/cli/tests/desktop-oasis-wiki.snapshot.ts
git add apps packages/bundle/base pnpm-lock.yaml
git commit -m "build(desktop): package local skill retrieval"
```

### Task 4: Restore Native Memory Service and Local Persistence

**Files:**
- Restore from `v1.20260912.4`: `packages/memory/README.md`
- Restore from `v1.20260912.4`: `packages/memory/README.zh.md`
- Restore from `v1.20260912.4`: `packages/memory/memory/`
- Restore from `v1.20260912.4`: `packages/memory/memory-local/`
- Modify: `pnpm-workspace.yaml`
- Modify: `tsconfig.base.json`
- Modify: `tsconfig.host.json`

**Interfaces:**
- Produces: the released `MemoryProvider` operations and `native_memory` storage domain version `0`.
- Stored fields remain `enabled` plus immutable user/project records with ids, project identity, content, source metadata, and timestamps.

- [ ] Restore the group and two service/provider packages without composition or Client code.

```powershell
git restore --source=v1.20260912.4 -- packages/memory/README.md packages/memory/README.zh.md packages/memory/memory packages/memory/memory-local
```

- [ ] Run restored tests and confirm any current storage-domain or branded-id incompatibilities fail before adaptation.

```powershell
pnpm exec vitest run packages/memory/memory/tests packages/memory/memory-local/tests
```

- [ ] Preserve `memoryDomainSpec` byte-for-byte in meaning: `name: 'native_memory'`, `version: 0`, the released global schema, and no table additions.

- [ ] Adapt only surrounding current APIs, then add invalid fixtures for duplicate Providers, unavailable project scope, secret-like content, capacity, failed atomic writes, cancellation, and async disposal.

- [ ] Run package tests and persistence verification; require zero declared Session-persistence changes and no storage-domain successor.

```powershell
pnpm exec vitest run packages/memory/memory/tests packages/memory/memory-local/tests
pnpm --silent run verify-persistence-changes --json
git add packages/memory pnpm-workspace.yaml tsconfig.base.json tsconfig.host.json pnpm-lock.yaml
git commit -m "feat(memory): restore native memory storage"
```

### Task 5: Restore Memory Tool, Settings UI, and Logged Context

**Files:**
- Restore from `v1.20260912.4`: `packages/memory/tool-memory/`
- Restore from `v1.20260912.4`: `packages/client/ui-settings-memory/`
- Modify: `packages/api/remotes/src/client/index.ts`
- Modify: `packages/client/modules/src/index.ts`
- Modify: `packages/client/modules/tests/node-half.client.spec.ts`
- Modify: `packages/bundle/base/cordis.patch.yml`
- Modify: `packages/bundle/base/package.json`
- Modify: `packages/bundle/web-app/cordis.patch.yml`
- Modify: `packages/bundle/web-app/package.json`
- Add: keyless native-memory Session snapshot under the current `snapshots/session/` owner.

**Interfaces:**
- Consumes: Task 4 `ctx.memory` operations and current Agent Session/cwd resolution.
- Produces: `memory_manage`, first-accepted-step logged context injection, and typed memory Settings Remote operations.

- [ ] Restore the tool and Client package and run their tests to expose current Agent-event, Typert, slot, and Settings differences.

- [ ] Add a failing Session test proving enabled visible records enter the first accepted step once, are appended as a sourced user message, and do not enter later steps in the same turn.

- [ ] Adapt the Consumer to current `agent/pre-step` waterfall semantics, always calling `next()` when delegating and preserving `startsRequestSeries` when rewriting messages.

- [ ] Adapt Remote method names, Client stores, localized controls, and project visibility to current API and settings slots; preserve idempotent remove behavior.

- [ ] Add the packages to base/Web composition and Client module catalogs, then run tool, UI, real-composition, and keyless snapshot tests.

```powershell
pnpm exec vitest run packages/memory/tool-memory/tests packages/client/ui-settings-memory/tests packages/client/modules/tests/node-half.client.spec.ts
pnpm run test:snapshot -- -t native-memory
git add packages/memory packages/client/ui-settings-memory packages/client/modules packages/api/remotes packages/bundle snapshots/session pnpm-lock.yaml
git commit -m "feat(memory): restore memory tools and settings"
```

### Task 6: Restore Auxiliary Image Generation and Durable Results

**Files:**
- Restore from `v1.20260912.4`: `packages/attachment/image-generation/`
- Restore from `v1.20260912.4`: `packages/attachment/tool-image-generate/`
- Modify: `packages/attachment/README.md`
- Modify: `packages/attachment/README.zh.md`
- Modify: `packages/client/ui-attachment/src/client/index.ts`
- Restore and adapt: `packages/client/ui-attachment/src/client/{ImageGenerateResult.tsx,ImageGenerateResult.module.css}`
- Modify: `packages/client/ui-attachment/tests/`
- Modify: `tsconfig.base.json`
- Modify: `tsconfig.host.json`

**Interfaces:**
- Produces: `ctx.imageGeneration.generate(request, options)` and the `image_generate` tool.
- Successful results contain the actual Provider/model identity and a durable image attachment reference; no success is published before attachment commit.

- [ ] Restore the two Host packages and historical result component as starting points.

```powershell
$resultDir = 'packages/client/ui-attachment/src/client'
git restore --source=v1.20260912.4 -- packages/attachment/image-generation packages/attachment/tool-image-generate "$resultDir/ImageGenerateResult.tsx" "$resultDir/ImageGenerateResult.module.css"
```

- [ ] Run restored tests and add current failing tests for Provider registration, credential redaction, cancellation, one fallback, reference authorization, attachment failure, and result rendering.

- [ ] Adapt the service to current LLM route configuration, credentials, attachment admission, direct-user image references, and tool completion semantics.

- [ ] Adapt the Client result registration to the current raw-event presenter and persisted tool-result metadata without storing UI-only state.

- [ ] Run focused Host and Client tests, update README pairs, then commit.

```powershell
pnpm exec vitest run packages/attachment/image-generation/tests packages/attachment/tool-image-generate/tests packages/client/ui-attachment/tests
git add packages/attachment packages/client/ui-attachment tsconfig.base.json tsconfig.host.json pnpm-lock.yaml
git commit -m "feat(image): restore auxiliary generation"
```

### Task 7: Restore Image Route Settings and Product Composition

**Files:**
- Modify: `packages/client/ui-settings-models/src/client/store.ts`
- Modify: `packages/client/ui-settings-models/src/client/ModelsSection.tsx`
- Modify: `packages/client/ui-settings-models/src/client/locales.ts`
- Modify: `packages/client/ui-settings-models/tests/`
- Modify: `packages/bundle/base/cordis.patch.yml`
- Modify: `packages/bundle/base/package.json`
- Modify: `packages/bundle/web-app/cordis.patch.yml`
- Modify: `packages/bundle/web-app/package.json`
- Modify: current Oasisfish Agent preset configuration under the shipped preset owner.
- Add: keyless image-generation Session snapshot using a fixture Provider.

**Interfaces:**
- Consumes: Task 6 service/tool and current configurable Provider directory.
- Produces: complete primary/fallback image route settings with model ids and endpoint paths.

- [ ] Add failing Client tests for unset routes, primary and fallback selection, endpoint validation, clearing fallback, save failure, and provider deletion protection.

- [ ] Port the image-route editor into the current Models page while reusing its joined Provider directory and typed Settings operations.

- [ ] Mount service, provider adapter, tool, and result UI through current base/Web composition; enable `image_generate` only in the intended Oasisfish presets.

- [ ] Add a keyless snapshot covering primary failure, one fallback, durable attachment output, and turn completion at the tool result.

- [ ] Run focused settings, composition, and snapshot checks, then commit.

```powershell
pnpm exec vitest run packages/client/ui-settings-models/tests packages/attachment/image-generation/tests packages/attachment/tool-image-generate/tests
pnpm run test:snapshot -- -t image-generation
git add packages/client/ui-settings-models packages/bundle apps snapshots/session pnpm-lock.yaml
git commit -m "feat(image): restore image route settings"
```

### Task 8: Integrate the Image Optimization Capability

**Files:**
- Restore from `codex/dsh-image-optimization`: `packages/image/`
- Restore from `codex/dsh-image-optimization`: `docs/subsystems/image-optimization.md`
- Restore from `codex/dsh-image-optimization`: `docs/subsystems/image-optimization.zh.md`
- Restore from `codex/dsh-image-optimization`: `docs/subsystems/image-optimization.i18n.yaml`
- Restore from `codex/dsh-image-optimization`: image-optimization snapshots under `snapshots/session/image-optimization/`
- Modify: `packages/bundle/base/cordis.patch.yml`
- Modify: `packages/bundle/base/package.json`
- Modify: relevant Oasisfish preset and UI-workflow prompts.
- Modify: workspace, tsconfig, generator, and package-group manifests required by `packages/image/`.

**Interfaces:**
- Produces: `ctx.imageOptimizer.optimize(request, options)`, `image_optimize`, offline library Provider, and the packaged `image-generation` Skill.
- Prepared specifications remain executor-neutral; Task 6 remains the only image execution owner.

- [ ] Restore the completed local package group and snapshots without restoring unrelated branch files.

```powershell
git restore --source=codex/dsh-image-optimization -- packages/image docs/subsystems/image-optimization.md docs/subsystems/image-optimization.zh.md docs/subsystems/image-optimization.i18n.yaml snapshots/session/image-optimization
```

- [ ] Run all image-group tests and identify conflicts with the current release branch.

```powershell
pnpm exec vitest run packages/image
```

- [ ] Adapt package manifests, attachment types, current-input reference resolution, tool registration, and bundle composition while preserving the completed public types and failure codes.

- [ ] Update the generation Skill and Oasis UI workflow prompt to require explicit `image_optimize` followed by `image_generate` when optimization returns `prepared`, and to stop for `needs_clarification`.

- [ ] Run image-group tests, current Oasis UI workflow tests, and the keyless optimization snapshot, then commit.

```powershell
pnpm exec vitest run packages/image packages/client/ui-oasis-workflow/tests
pnpm run test:snapshot -- -t image-optimization
git add packages/image packages/bundle packages/client/ui-oasis-workflow snapshots/session docs/subsystems pnpm-workspace.yaml tsconfig.base.json tsconfig.host.json pnpm-lock.yaml scripts
git commit -m "feat(image): integrate deterministic optimization"
```

### Task 9: Complete Desktop Packaging and Cross-Capability Composition

**Files:**
- Modify: `apps/desktop-host/package.json`
- Modify: `apps/desktop-host/oasisfish.cordis.patch.yml`
- Modify: `apps/desktop-runtime/package.json`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/scripts/prepare-primary-runtime.ts`
- Modify: `apps/desktop/scripts/staged-inventory.mjs`
- Modify: Desktop preparation, smoke, and profile tests.
- Modify: `scripts/gen-cordis-catalog.ts`
- Modify: `scripts/gen-tool-catalog.ts`
- Modify: `scripts/gen-doc-graphs.ts`
- Modify: `packages/extensions/tool-cordis/src/api-catalog.ts`

**Interfaces:**
- Consumes: all prior task packages and current Desktop profile preparation.
- Produces: one official Desktop composition containing restored capabilities, current update support, Oasis Wiki, Codex bridge, Oasis UI workflow, and Wallpaper Engine.

- [ ] Add a failing real-profile test that asserts every required row appears exactly once and generic profiles retain their previous defaults.

- [ ] Update Desktop dependency and resolver manifests, resource inventories, runtime preparation, and generated catalogs.

- [ ] Add an integrated fixture flow: select default model, add user/project memory, search Oasis Wiki, optimize an image request, generate a fixture image, restart, and verify persisted state.

- [ ] Run focused profile, preparation, smoke, and generated-catalog checks; fix missing dependencies rather than adding runtime installation.

```powershell
pnpm exec vitest run apps/desktop-host/tests/oasisfish-profile.spec.ts apps/desktop/tests/primary-runtime-preparation.spec.ts apps/desktop/tests/staged-inventory.spec.ts apps/desktop/tests/smoke-unpacked.spec.ts
pnpm run doc-sync
git add apps packages scripts docs pnpm-lock.yaml
git commit -m "feat(desktop): compose restored Oasisfish capabilities"
```

### Task 10: Record User Workflows and Run Final Verification

**Files:**
- Modify: affected package README pairs and subsystem pairs.
- Modify: `apps/desktop/README.md`
- Modify: `apps/desktop/README.zh.md`
- Add: product-visible GIF evidence for default-model, memory, and image workflows under the PR attachment workflow.
- Modify: generated configuration, tool, event, module, and persistence catalogs only through their generators.

**Interfaces:**
- Produces: review evidence and current documentation for every restored capability.

- [ ] Use `record-browser-gif` against the real pull-request Desktop server and model flow to record the changed GUI workflows.

- [ ] Run the focused test selection from `dsh-pre-push-checks`; include every command actually selected and do not repeat already-passing checks solely for the commit.

- [ ] Run final documentation, type, build, hygiene, and diff checks required by the outgoing cross-package change.

```powershell
pnpm run test:docs
pnpm run doc-sync
pnpm run typecheck
pnpm run build
pnpm run hygiene
git diff --check
```

- [ ] Inspect the complete branch diff for unrelated changes, persistence declarations, generated files, locale ownership, package dependencies, and current Desktop behavior.

- [ ] Commit final documentation and generated outputs.

```powershell
git add apps packages docs scripts snapshots pnpm-lock.yaml pnpm-workspace.yaml tsconfig*.json
git commit -m "docs(oasisfish): document restored capabilities"
```

- [ ] Invoke `superpowers:finishing-a-development-branch` and present integration options only after every selected check passes and the worktree is clean.
