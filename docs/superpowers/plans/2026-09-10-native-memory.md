# Native Memory Implementation Plan

English | [中文](2026-09-10-native-memory.zh.md)

**Goal:** Add durable global and project memory, model-managed writes, logged per-turn context injection, persistent session-history search, and a Web Settings manager to Oasisfish.

**Architecture:** A provider-neutral `@deepseek-ai/dsh-memory` service defines records and operations. `@deepseek-ai/dsh-memory-local` implements that service over `ctx.storage.domain`. `@deepseek-ai/dsh-tool-memory` is the agent-scoped model Consumer and owns logged context injection. `@deepseek-ai/dsh-client-ui-settings-memory` exposes typed Host Remote methods and a browser Settings section. Existing session-query packages own history search.

**Tech Stack:** TypeScript, Cordis plugins, storage-domain/JSON, Typert Remote, React, Vitest, Loader-composed snapshots.

## Task 1: Service Definition

Create the manifest, build configuration, source, invariant, tests, and bilingual READMEs under `packages/memory/memory/`, plus the bilingual `packages/memory/` index.

1. Write failing tests for branded ids, explicit provider registration, disposal, missing-provider errors, and request delegation.
2. Run `pnpm exec vitest run packages/memory/memory/tests` and confirm failures describe the absent service.
3. Implement the single-provider registry and public types/errors.
4. Add a runtime invariant relating registered providers to successful service resolution.
5. Re-run the focused tests to green.

## Task 2: Durable Local Provider

**Files:**
- Create `packages/memory/memory-local/package.json`
- Create build configs, source files, tests, invariant, and bilingual READMEs under `packages/memory/memory-local/`

1. Write failing tests for user/project isolation, missing `cwd`, SHA-256 project identity, restart durability, concurrent mutations, immutable results, duplicate content, exact item and character limits, Unicode code-point counting, sensitive-content categories, monotonic timestamps, enable state, and disposal.
2. Run the focused test and confirm red.
3. Define the `native-memory` domain schema and implement the provider with per-scope mutation queues.
4. Enforce all safety and capacity rules at `add` and `update`.
5. Re-run focused tests to green with package-scoped coverage.

## Task 3: Model Tool and Logged Context

**Files:**
- Create `packages/memory/tool-memory/package.json`
- Create build configs, source files, tests, invariant, and bilingual READMEs under `packages/memory/tool-memory/`
- Modify `scripts/gen-tool-catalog.ts`
- Modify generated tool/config catalogs through repository generators

1. Write failing tests for the four `memory_manage` actions, schema validation, provider error rendering, disabled behavior, guidance text, first-step-of-turn injection, source metadata, rejection behavior, refreshed next-turn snapshots, and disposal.
2. Write a Loader-composed keyless fixture where a deterministic backend calls `memory_manage` and then reports the committed result.
3. Run the focused tests and snapshot; confirm red.
4. Implement tool registration, presentation, prompt guidance, and a prepend `agent/pre-step` listener that delegates before returning a sourced `UserMessage`.
5. Register the tool with the catalog generator and record the new snapshot.
6. Re-run tests and snapshot to green.

## Task 4: Settings Host and Browser UI

**Files:**
- Create `packages/client/ui-settings-memory/package.json`
- Create Host/client build configs, Remote service, store, components, styles, locales, tests, invariant, and bilingual READMEs under `packages/client/ui-settings-memory/`
- Modify `packages/client/modules/README.md`, `packages/client/modules/README.zh.md`, and pairing metadata

1. Write failing Host tests for Remote list/add/update/remove/enable calls and project context validation.
2. Write failing browser tests for section registration, lazy load, toggle, grouped records, add/edit/delete, retained drafts on errors, and locale changes.
3. Run focused Host/client tests and confirm red.
4. Implement a Host Remote service over `ctx.memory` and a browser store with stable snapshots.
5. Implement the `Memory` settings section using existing settings primitives and icons.
6. Re-run focused tests to green.

## Task 5: Product Composition and Persistent History Search

**Files:**
- Modify `packages/bundle/base/cordis.patch.yml`
- Modify `packages/bundle/base/package.json`
- Modify `packages/bundle/web-app/cordis.patch.yml`
- Modify `packages/bundle/web-app/package.json`
- Modify `apps/cli/config/agent-presets/standard/agent.cordis.yml`
- Modify preset composition tests
- Modify `apps/desktop-runtime/package.json`
- Modify relevant tsconfig aggregates and `tsconfig.base.json` paths only when generated/workspace conventions require them

1. Add failing composition assertions for the Host memory provider, standard-preset tool, Web Settings plugin, and persistent session-query SQLite path.
2. Run focused bundle/preset/desktop dependency tests and confirm red.
3. Mount the Service Definition and local Provider on the Host plane; mount the tool in `standard`; mount Settings on Web; route the search index to `dshHomePath('session-search.sqlite')` with lazy open.
4. Add every package to resolver manifests and desktop dependency closure.
5. Re-run focused composition tests to green.

## Task 6: Documentation and Agent Note

**Files:**
- Create `.agents/notes/implemented/feature/2026-09-10-native-memory.md`
- Create Chinese counterpart and pairing metadata
- Modify affected bilingual bundle, preset, Settings, and subsystem documentation
- Regenerate `docs/tool-catalog*` and `docs/config-catalog*`

1. Document current shipped behavior, alternatives rejected, security rules, model/log effects, and verification evidence.
2. Run repository catalog generators.
3. Run `pnpm run doc-sync`; fix owner prose or pairing metadata rather than generated output.

## Task 7: Verification and Desktop Acceptance

1. Run focused Vitest coverage for all new source packages.
2. Run the Loader-composed keyless snapshot and relevant preset/bundle/client tests.
3. Run `pnpm run typecheck`, `pnpm run build`, and `pnpm run doc-sync` once each after focused evidence passes.
4. Run relevant desktop `typecheck`, tests, runtime preparation/stage verification, and unpacked smoke without external model calls.
5. Recompute the existing user `settings.yaml` and `.credentials.yaml` hashes and require exact equality with the pre-change values without printing file contents.
6. Run `git diff --check`, inspect `git status --short`, and report all checks actually run. Do not commit or push unless separately requested.
