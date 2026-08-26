# Windows Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a self-contained Windows 10/11 x64 Electron installer for DeepSeek Harness and its common scripting toolchain.

**Architecture:** Electron supervises the existing `dsh web` application as an external bundled Node process. A pinned runtime manifest and preparation script assemble verified portable tools into `extraResources` without changing the system environment.

**Tech Stack:** TypeScript, Electron, electron-builder, Vitest, pnpm deploy, PowerShell-compatible portable Windows runtimes.

**Spec:** `docs/superpowers/specs/2026-08-26-windows-desktop-app-design.md`

## Global Constraints

- Support Windows 10/11 x64 only.
- Installation and local tool startup perform no network downloads.
- Keep Harness in an external bundled Node process.
- Never modify the machine or user `PATH`.
- Bind the Harness server only to `127.0.0.1`.
- Keep generated runtimes, caches, installers, and logs out of Git.

---

### Task 1: Desktop lifecycle package

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/tsdown.config.ts`
- Create: `apps/desktop/src/paths.ts`
- Create: `apps/desktop/src/environment.ts`
- Create: `apps/desktop/src/server.ts`
- Create: `apps/desktop/src/main.ts`
- Create: `apps/desktop/tests/environment.spec.ts`
- Create: `apps/desktop/tests/server.spec.ts`

**Interfaces:**
- Produces: `resolveDesktopPaths()`, `buildHarnessEnvironment()`, `reserveLoopbackPort()`, and `waitForServer()` for the Electron supervisor.

- [ ] Write environment and readiness tests that fail because the modules do not exist.
- [ ] Run `pnpm exec vitest run apps/desktop/tests` and confirm the missing-module failures.
- [ ] Implement the pure path, environment, port, and readiness modules.
- [ ] Run the focused tests and confirm they pass.
- [ ] Implement the Electron single-instance, BrowserWindow, spawn, logging, timeout, and shutdown lifecycle using the tested modules.
- [ ] Run focused tests, typecheck the package, and commit the lifecycle package.

### Task 2: Verified portable runtime assembly

**Files:**
- Create: `apps/desktop/runtime-manifest.json`
- Create: `apps/desktop/scripts/runtime-manifest.mjs`
- Create: `apps/desktop/scripts/prepare-runtime.mjs`
- Create: `apps/desktop/tests/runtime-manifest.spec.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the runtime directory layout expected by `resolveDesktopPaths()`.
- Produces: `apps/desktop/build-resources/runtime/manifest.json` and all executable directories named in the design.

- [ ] Write manifest validation tests for duplicate destinations, insecure URLs, missing hashes, unsupported archives, and required tool names.
- [ ] Run the focused test and confirm it fails because validation is missing.
- [ ] Implement manifest parsing and validation.
- [ ] Run the focused test and confirm it passes.
- [ ] Implement cached download, SHA-256 validation, safe extraction, Python pip bootstrapping, pnpm installation, license staging, executable checks, and atomic publication.
- [ ] Add generated runtime/cache/output exclusions and commit the runtime assembly.

### Task 3: Harness deployment and installer

**Files:**
- Create: `apps/desktop/scripts/prepare-harness.mjs`
- Create: `apps/desktop/scripts/verify-staged-runtime.mjs`
- Create: `apps/desktop/electron-builder.yml`
- Create: `apps/desktop/assets/icon.ico`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: a staged production Harness closure, `dist/win-unpacked`, and an x64 NSIS installer.

- [ ] Add tests for expected staged Harness and runtime executables.
- [ ] Run the test and confirm it fails on an empty staging directory.
- [ ] Implement `pnpm deploy` staging plus the inventory verifier.
- [ ] Add pinned Electron/electron-builder dependencies and reviewed install-script allowlists.
- [ ] Configure `extraResources`, ASAR, x64 NSIS, artifact naming, icons, and package scripts.
- [ ] Build the unpacked app, run the inventory verifier, and commit the packaging path.

### Task 4: Documentation and decision record

**Files:**
- Create: `apps/desktop/README.md`
- Create: `apps/desktop/README.zh.md`
- Create: `apps/desktop/README.i18n.yaml`
- Create: `.agents/notes/implemented/feature/2026-08-26-self-contained-windows-desktop-app.md`
- Create: `.agents/notes/implemented/feature/2026-08-26-self-contained-windows-desktop-app.zh.md`
- Create: `.agents/notes/implemented/feature/2026-08-26-self-contained-windows-desktop-app.i18n.yaml`
- Modify: `README.md`
- Modify: `README.zh.md`

**Interfaces:**
- Documents: release preparation, bundled tool scope, local development, limitations, runtime paths, failures, and verification.

- [ ] Write the package README pair and implemented Agent Note pair.
- [ ] Link the desktop app from the root README pair.
- [ ] Record bilingual consistency metadata.
- [ ] Run translation pairing and documentation gates, then commit documentation.

### Task 5: Installer and runtime verification

**Files:**
- Create: `apps/desktop/scripts/smoke-unpacked.mjs`
- Create: `apps/desktop/tests/smoke-unpacked.spec.ts`

**Interfaces:**
- Consumes: the unpacked desktop product from Task 3.
- Produces: machine-readable proof that the bundled UI and toolchain start from product paths.

- [ ] Write a smoke harness that checks the unpacked resource inventory and reports version command results.
- [ ] Run it against an incomplete product and confirm the expected failure.
- [ ] Prepare every pinned runtime archive and build the x64 installer.
- [ ] Launch the unpacked app, wait for its ready marker, and verify the loopback Web UI.
- [ ] Run every bundled tool's version command through the product environment.
- [ ] Run focused tests, package typecheck/build, `pnpm run lint`, relevant hygiene/doc gates, and `git diff --check`.
- [ ] Review the final diff and commit the verified installer implementation.
