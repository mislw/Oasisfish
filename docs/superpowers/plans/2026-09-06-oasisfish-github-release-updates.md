# Oasisfish GitHub Release Updates Implementation Plan

English | [中文](2026-09-06-oasisfish-github-release-updates.zh.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual, desktop-only GitHub Release update flow that downloads and installs a newer Oasisfish NSIS package while preserving all user data and conservatively removing a verified portable distribution.

**Architecture:** `electron-updater` stays in the Electron main process behind a finite-state controller and a fixed IPC allowlist. A browser plugin renders the update state only when a sandboxed preload bridge exists; packaged inventory plus an installer-written receipt lets a detached Windows helper remove only verified portable files after the target installation succeeds.

**Tech Stack:** TypeScript, Electron 44, electron-updater 6.8.9, React 18, Cordis client plugins, Vitest, Playwright snapshots, electron-builder NSIS, PowerShell 5.1-compatible cleanup, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-06-oasisfish-github-release-updates-design.md`

## Global Constraints

- The update provider is fixed to the public GitHub repository `mislw/Oasisfish`.
- Update checks, downloads, and installation start only from explicit user commands.
- `apps/desktop/package.json` is the version source; release tags are exactly `v<version>`.
- The renderer receives versions, status, progress, and safe messages only; it never receives paths, URLs, headers, tokens, or raw exceptions.
- `%APPDATA%\DeepSeek Harness` is never deleted, moved, migrated, or included in a release artifact.
- Installed upgrades use NSIS replacement. Application code never recursively deletes an installed application directory.
- Portable cleanup runs only after the installed receipt reports the requested version and every portable entry passes the owned-inventory checks.
- Unknown files, changed files, reparse points, unsafe roots, failed installation, or version mismatch preserve the complete portable directory.
- The GitHub workflow uses only the repository-scoped `GITHUB_TOKEN`; model credentials and `.env` are absent from workflow inputs and artifacts.
- Unsigned installers retain Windows warnings; no code bypasses SmartScreen, UAC, or updater checksum verification.

---

### Task 1: Shared update protocol and main-process controller

**Files:**
- Create: `packages/client/ui-desktop-update/package.json`
- Create: `packages/client/ui-desktop-update/tsconfig.json`
- Create: `packages/client/ui-desktop-update/tsdown.config.ts`
- Create: `packages/client/ui-desktop-update/src/index.ts`
- Create: `packages/client/ui-desktop-update/src/invariant.ts`
- Create: `packages/client/ui-desktop-update/src/protocol.ts`
- Create: `apps/desktop/src/update-controller.ts`
- Create: `apps/desktop/tests/update-controller.spec.ts`
- Modify: `apps/desktop/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `DesktopUpdatePhase`, `DesktopUpdateProgress`, `DesktopUpdateState`, `OasisfishUpdateBridge`, and `DesktopUpdateCommand` from `@deepseek-ai/dsh-client-ui-desktop-update/protocol`.
- Produces: `DesktopUpdateController` with `getState()`, `check()`, `download()`, `install()`, and `subscribe()`.
- Consumes: an injected `UpdaterFacade`, packaged-runtime facts, and install callbacks; unit tests never contact GitHub.

- [ ] **Step 1: Define the protocol in a failing controller test**

Use this public data model and assert exact immutable snapshots:

```ts
export type DesktopUpdatePhase =
  | 'idle' | 'checking' | 'up-to-date' | 'available'
  | 'downloading' | 'downloaded' | 'installing' | 'unsupported' | 'error'

export interface DesktopUpdateState {
  readonly phase: DesktopUpdatePhase
  readonly currentVersion: string
  readonly availableVersion?: string
  readonly progress?: {
    readonly percent?: number
    readonly transferred: number
    readonly total?: number
    readonly bytesPerSecond?: number
  }
  readonly message?: string
}
```

Tests cover the initial packaged state, unpackaged `unsupported`, check results, download progress, downloaded install eligibility, rejected duplicate commands, and listener disposal.

- [ ] **Step 2: Run the controller test and verify RED**

Run: `pnpm exec vitest run apps/desktop/tests/update-controller.spec.ts`

Expected: FAIL because `update-controller.ts` and the shared protocol do not exist.

- [ ] **Step 3: Implement the minimal controller**

Configure the injected updater with `autoDownload = false`, `autoInstallOnAppQuit = false`, and prerelease eligibility derived from the running semantic version. Translate updater events into frozen protocol snapshots, serialize commands with one in-flight promise, and project failures through a bounded `safeUpdateMessage(error)` that never includes filesystem paths, URLs, headers, or token-like values.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm exec vitest run apps/desktop/tests/update-controller.spec.ts --coverage --coverage.include='apps/desktop/src/update-controller.ts'`

Expected: PASS with per-file coverage thresholds satisfied.

- [ ] **Step 5: Add the pinned dependency and commit**

Add exact `electron-updater` version `6.8.9` to desktop runtime dependencies, regenerate the lockfile with `pnpm install --lockfile-only`, run `pnpm --filter @deepseek-ai/dsh-desktop run typecheck`, and commit with `feat(desktop): add update controller`.

### Task 2: Sandboxed preload bridge and fixed IPC handlers

**Files:**
- Create: `apps/desktop/src/update-ipc.ts`
- Create: `apps/desktop/src/preload.ts`
- Create: `apps/desktop/tests/update-ipc.spec.ts`
- Create: `apps/desktop/tests/preload.spec.ts`
- Modify: `apps/desktop/src/main.ts`
- Modify: `apps/desktop/tsdown.config.ts`

**Interfaces:**
- Produces: fixed channels `oasisfish-update:get-state`, `:check`, `:download`, `:install`, and `:state`.
- Produces: `registerDesktopUpdateIpc(ipcMain, controller, windows)` returning a disposer.
- Exposes: `window.oasisfishUpdate: OasisfishUpdateBridge` through `contextBridge` only.

- [ ] **Step 1: Write failing IPC and preload tests**

Assert that each command maps to exactly one controller method, invalid install state is rejected by the controller, broadcasts contain only `DesktopUpdateState`, subscription removes its listener, and no generic `send`, `invoke`, channel name, URL, or path API is exposed.

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm exec vitest run apps/desktop/tests/update-ipc.spec.ts apps/desktop/tests/preload.spec.ts`

Expected: FAIL on missing modules.

- [ ] **Step 3: Implement the handler registry and preload bridge**

Use `ipcMain.handle()` for commands, `webContents.send()` for state, and `ipcRenderer.on/removeListener()` for subscription. Build `main.ts` as ESM and `preload.ts` as `dist/preload.cjs`; set `webPreferences.preload` while retaining `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.

- [ ] **Step 4: Run tests, typecheck, and verify GREEN**

Run: `pnpm exec vitest run apps/desktop/tests/update-ipc.spec.ts apps/desktop/tests/preload.spec.ts apps/desktop/tests/window-lifecycle.spec.ts`

Run: `pnpm --filter @deepseek-ai/dsh-desktop run typecheck`

Expected: all commands pass without widening the renderer API.

- [ ] **Step 5: Commit the IPC boundary**

Commit with `feat(desktop): expose sandboxed update bridge`.

### Task 3: Portable ownership manifest and post-install cleanup

**Files:**
- Create: `apps/desktop/scripts/portable-inventory.mjs`
- Create: `apps/desktop/resources/portable-cleanup.ps1`
- Create: `apps/desktop/src/portable-migration.ts`
- Create: `apps/desktop/tests/portable-inventory.spec.ts`
- Create: `apps/desktop/tests/portable-migration.spec.ts`
- Create: `apps/desktop/build/installer.nsh`
- Modify: `apps/desktop/scripts/after-pack.mjs`
- Modify: `apps/desktop/electron-builder.yml`
- Modify: `apps/desktop/src/paths.ts`

**Interfaces:**
- Produces: `resources/oasisfish-portable-inventory.json` with version, root marker, sorted relative paths, byte lengths, and SHA-256 hashes.
- Produces: `resolveDesktopDistribution()` returning `installed` only when the NSIS-owned installation marker is present; an extracted `win-unpacked` tree is `portable`.
- Produces: `preparePortableCleanup()` that copies the helper and immutable cleanup request below `<userData>/updates/`, then starts it detached immediately before `quitAndInstall()`.
- The NSIS `customInstall` macro writes `<userData>/updates/installed-receipt.json` atomically with target version and installation directory.

- [ ] **Step 1: Write failing inventory tests**

Use temporary trees to prove deterministic sorting, hash verification, rejection of absolute/traversal/case-colliding paths, rejection of reparse points, and detection of unknown or modified files.

- [ ] **Step 2: Run inventory tests and verify RED**

Run: `pnpm exec vitest run apps/desktop/tests/portable-inventory.spec.ts`

Expected: FAIL because the inventory module is absent.

- [ ] **Step 3: Implement inventory generation and after-pack publication**

Scan `context.appOutDir` without following links after Harness resources are copied and verified. Hash every regular file except the inventory itself, write the inventory last through a temporary file plus rename, and include the inventory in packaged-resource verification.

- [ ] **Step 4: Write failing cleanup tests**

Prove that cleanup waits for both the old process exit and a matching installed receipt; deletes files before now-empty directories; preserves the whole root on unknown files, modified hashes, reparse points, unsafe roots, missing receipt, receipt version mismatch, or receipt path outside the expected install root; and never enumerates the user-data directory as a deletion root.

- [ ] **Step 5: Run cleanup tests and verify RED**

Run: `pnpm exec vitest run apps/desktop/tests/portable-migration.spec.ts`

Expected: FAIL because migration and helper preparation are absent.

- [ ] **Step 6: Implement portable migration and the detached helper**

The TypeScript side validates and snapshots the portable inventory before installation, writes a request containing only the old PID, target version, portable root, inventory path, receipt path, and diagnostic path, and invokes `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <copied-helper> <request>`. The PowerShell helper revalidates canonical paths, reparse points, inventory hashes, unknown entries, and the receipt before deleting allowlisted files.

- [ ] **Step 7: Run focused tests and commit**

Run: `pnpm exec vitest run apps/desktop/tests/portable-inventory.spec.ts apps/desktop/tests/portable-migration.spec.ts`

Commit with `feat(desktop): clean verified portable installs`.

### Task 4: Desktop lifecycle and updater integration

**Files:**
- Modify: `apps/desktop/src/main.ts`
- Modify: `apps/desktop/src/update-controller.ts`
- Modify: `apps/desktop/tests/update-controller.spec.ts`
- Modify: `apps/desktop/tests/window-lifecycle.spec.ts`
- Modify: `apps/desktop/electron-builder.yml`
- Modify: `apps/desktop/package.json`

**Interfaces:**
- Consumes: Electron's `autoUpdater` implementation from `electron-updater` and the controller/IPC/migration modules.
- Produces: one `beginUpdateExit()` path that sets the existing quitting guard, terminates Harness, destroys window/tray resources, optionally launches portable cleanup, and only then calls `quitAndInstall(false, true)`.

- [ ] **Step 1: Extend tests for update installation lifecycle**

Assert that ordinary tray exit retains current behavior; downloaded installed builds quit through NSIS without portable cleanup; downloaded portable builds prepare cleanup once; repeated install clicks do not duplicate teardown; and app startup never calls `checkForUpdates()`.

- [ ] **Step 2: Run lifecycle tests and verify RED**

Run: `pnpm exec vitest run apps/desktop/tests/update-controller.spec.ts apps/desktop/tests/window-lifecycle.spec.ts`

Expected: FAIL on the missing update-exit behavior.

- [ ] **Step 3: Wire the production updater**

Instantiate the controller only after `app.whenReady()`, register IPC before loading the renderer, unsubscribe and remove handlers during shutdown, and show safe update errors in the Settings state rather than modal startup failures. Keep the existing single-instance, tray, loopback, and Harness shutdown rules.

- [ ] **Step 4: Configure update metadata**

Add the public GitHub provider, `app-update.yml` generation, NSIS differential package metadata, `build/installer.nsh`, and the stable `appId`/product identity. Keep `oneClick: false`, `perMachine: false`, and user-selectable installation directory.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @deepseek-ai/dsh-desktop run test`

Run: `pnpm --filter @deepseek-ai/dsh-desktop run typecheck`

Commit with `feat(desktop): integrate GitHub release updates`.

### Task 5: Desktop-only Settings plugin

**Files:**
- Create: `packages/client/ui-desktop-update/src/client/index.ts`
- Create: `packages/client/ui-desktop-update/src/client/DesktopUpdateSection.tsx`
- Create: `packages/client/ui-desktop-update/src/client/DesktopUpdateSection.module.css`
- Create: `packages/client/ui-desktop-update/src/client/locales.ts`
- Create: `packages/client/ui-desktop-update/src/css-modules.d.ts`
- Create: `packages/client/ui-desktop-update/tests/apply.client.spec.ts`
- Create: `packages/client/ui-desktop-update/tests/component.client.spec.tsx`
- Modify: `packages/client/ui-desktop-update/package.json`
- Modify: `packages/client/ui-desktop-update/tsconfig.json`
- Modify: `packages/client/ui-desktop-update/tsdown.config.ts`

**Interfaces:**
- Produces: a `settings.section` entry with id `app-updates`, order `30`, and localized label.
- Produces: `DesktopUpdateStore` backed only by `window.oasisfishUpdate`.
- Uses existing `Button`, `IconRefreshOutline16`, `IconDownloadOutline16`, and accessible progress/status primitives.

- [ ] **Step 1: Write failing registration tests**

Assert zero section registrations when the bridge is absent; exactly one registration when present; no bridge command during plugin activation or section registration; and complete disposal of the subscription.

- [ ] **Step 2: Write failing component tests**

Cover Chinese and English labels, current/available versions, check/download/install command selection, disabled in-flight controls, determinate and indeterminate download states, visible retry after error, and the operating-system installer warning.

- [ ] **Step 3: Run UI tests and verify RED**

Run: `pnpm exec vitest run packages/client/ui-desktop-update/tests`

Expected: FAIL because the browser plugin and component are absent.

- [ ] **Step 4: Implement the store, registration, copy, and component**

Load state only when the section mounts, subscribe through `useSyncExternalStore`, keep every command user initiated, and render one primary action appropriate to the state. Use an 8px-or-less un-nested section layout consistent with existing Settings sections and ensure long version/error text wraps without resizing controls.

- [ ] **Step 5: Run focused coverage and commit**

Run: `pnpm exec vitest run packages/client/ui-desktop-update/tests --coverage --coverage.include='packages/client/ui-desktop-update/src/**/*.ts' --coverage.include='packages/client/ui-desktop-update/src/**/*.tsx'`

Commit with `feat(client): add desktop update settings`.

### Task 6: Bundle registration and keyless assembled snapshot

**Files:**
- Modify: `packages/bundle/web-app/cordis.patch.yml`
- Modify: `packages/bundle/web-app/package.json`
- Create: `apps/web/tests/desktop-update.snapshot.ts`
- Create: `apps/web/tests/snapshots/desktop-update/browser-no-bridge.txt`
- Create: `apps/web/tests/snapshots/desktop-update/desktop-available.txt`
- Create: `apps/web/tests/snapshots/desktop-update/desktop-downloading.txt`

**Interfaces:**
- The Web bundle always loads the plugin module; the plugin contributes nothing unless `window.oasisfishUpdate` exists.
- The snapshot injects a deterministic test bridge before boot and records commands without network or installer access.

- [ ] **Step 1: Add the bundle row and write the failing snapshot scenario**

Add `ui-desktop-update` beside the other Settings plugins. In the scenario, first prove an ordinary browser has no **App updates** navigation row; then inject a bridge with `available` and `downloading` snapshots, open Settings, exercise the user command, and capture stable text output.

- [ ] **Step 2: Run the assembled test and verify RED**

Run: `pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/desktop-update.snapshot.ts`

Expected: FAIL because the new bundle row or snapshots are missing.

- [ ] **Step 3: Record and review keyless snapshots**

Run the repository's snapshot record mode for this file only, inspect the three generated outputs for paths, tokens, machine-specific text, and accidental browser-only UI, then rerun in replay mode.

- [ ] **Step 4: Verify bundle resolution and commit**

Run: `pnpm run verify-cordis-config`

Run: `pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/desktop-update.snapshot.ts`

Commit with `feat(bundle): enable desktop update settings`.

### Task 7: Release contract and GitHub publication workflow

**Files:**
- Create: `apps/desktop/scripts/validate-release-tag.mjs`
- Create: `apps/desktop/tests/release-contract.spec.ts`
- Create: `.github/workflows/oasisfish-release.yml`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/electron-builder.yml`

**Interfaces:**
- Produces: `validateReleaseTag(tag, version)` requiring exact equality with `v${version}`.
- Produces: a Windows x64 workflow that publishes installer, block map, and `latest.yml` to the matching public GitHub Release.

- [ ] **Step 1: Write failing release-contract tests**

Cover a matching stable tag, matching prerelease tag, missing `v`, version mismatch, empty tag, and workflow assertions: `contents: write`, frozen pnpm install, Windows runner, exact tag validation, selected tests, NSIS publish, no `.env`, no model secret names, and no secret other than `GITHUB_TOKEN`/`GH_TOKEN`.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm exec vitest run apps/desktop/tests/release-contract.spec.ts`

Expected: FAIL because the validator and workflow are absent.

- [ ] **Step 3: Implement tag validation and workflow**

Trigger on `v*` tags and `workflow_dispatch` with an explicit existing tag input. Checkout the tag, set up pnpm and Node 24, run `pnpm install --frozen-lockfile`, validate tag/version, run focused desktop/client/snapshot/doc checks, build with `electron-builder --publish always`, and pass only `${{ secrets.GITHUB_TOKEN }}` as `GH_TOKEN`.

- [ ] **Step 4: Verify release assets without publishing**

Build locally with publish disabled and assert the output includes `Oasisfish-<version>-x64.exe`, its `.blockmap`, and `latest.yml`; inspect each metadata file for the public repository and expected version.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm exec vitest run apps/desktop/tests/release-contract.spec.ts`

Commit with `ci(desktop): publish Oasisfish releases`.

### Task 8: Documentation, installed-upgrade smoke, and final evidence

**Files:**
- Modify: `apps/desktop/README.md`
- Modify: `apps/desktop/README.zh.md`
- Modify: `apps/desktop/README.i18n.yaml`
- Modify: `docs/superpowers/specs/2026-08-26-windows-desktop-app-design.md`
- Modify: `docs/superpowers/specs/2026-08-26-windows-desktop-app-design.zh.md`
- Modify: `docs/superpowers/specs/2026-08-26-windows-desktop-app-design.i18n.yaml`
- Move: `.agents/notes/proposed/feature/2026-09-06-oasisfish-github-release-updates.*` to `.agents/notes/implemented/feature/`
- Create: `apps/desktop/scripts/smoke-upgrade.ps1`
- Create: `apps/desktop/tests/smoke-upgrade.spec.ts`
- Modify: `apps/desktop/tests/smoke-unpacked.spec.ts`
- Modify: `apps/desktop/scripts/smoke-unpacked.mjs`

**Interfaces:**
- Documents: manual update behavior, release/tag procedure, portable migration, user-data preservation, diagnostics, unsigned-installer warnings, and recovery from failed updates.
- Produces: a Windows smoke that installs version N, writes a byte fixture below `%APPDATA%\DeepSeek Harness`, upgrades to N+1, verifies the registered old version is replaced, and confirms the fixture is unchanged.

- [ ] **Step 1: Write failing package and upgrade smoke assertions**

Extend unpacked smoke to require preload, `app-update.yml`, portable inventory, cleanup helper, and no reparse points. Make the upgrade smoke reject missing two-version fixtures and verify receipt/version/user-data invariants without using model credentials.

- [ ] **Step 2: Run the smoke tests and verify RED**

Run: `pnpm exec vitest run apps/desktop/tests/smoke-unpacked.spec.ts apps/desktop/tests/smoke-upgrade.spec.ts`

Expected: FAIL until packaged metadata and fixture arguments exist.

- [ ] **Step 3: Update documentation and implemented decision record**

Replace the older design statement that automatic updates remain a future release concern with a link to the update design. Document that source pushes alone do not notify clients, that a matching published tag is required, that user data remains under `%APPDATA%\DeepSeek Harness`, and that conservative cleanup may leave a portable tree for manual removal. Move the Agent Note to `implemented`, rewrite proposal/future wording as present-tense behavior, and record actual verification evidence only after it runs.

- [ ] **Step 4: Build and run packaging evidence**

Run the repository build once, then desktop package staging, `package:dir`, and `smoke:unpacked`. Build two local versions into separate output directories to avoid `EBUSY`, run `smoke-upgrade.ps1`, and uninstall the test installation without deleting the preserved user-data fixture until its hash is recorded.

- [ ] **Step 5: Run the narrow final check set**

Run:

```sh
pnpm exec vitest run apps/desktop/tests
pnpm exec vitest run packages/client/ui-desktop-update/tests
pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/desktop-update.snapshot.ts
pnpm --filter @deepseek-ai/dsh-desktop run typecheck
pnpm run build
pnpm run hygiene
pnpm run doc-sync
git diff --check
```

Inspect the complete diff against `oasisfish/main`, confirm no `vendor/` paths, `.env`, credentials, generated user data, local caches, or release binaries are staged, and run the secret-pattern scan over tracked additions.

- [ ] **Step 6: Commit, push, and verify remote state**

Commit with `feat(desktop): ship GitHub release updates`, push `codex/desktop-auto-update`, verify the remote SHA equals local `HEAD`, and inspect GitHub checks. Do not create a real Release until a version bump and matching tag are deliberately chosen; the first live publish is a separate release action after this implementation is reviewed.
