# Desktop Wallpaper Engine Integration Implementation Plan

English | [中文](2026-09-22-desktop-wallpaper-engine-integration.zh.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `dsh-plugin-wallpaper-engine@0.7.5` as a default-enabled feature of the single official Desktop application, prompt for setup until the upstream settings object exists, and restore saved wallpaper state on later launches.

**Architecture:** A first-party Desktop bundle inserts the pinned upstream Host/Client row and a first-party onboarding Client row behind one Plugin Manager switch. Desktop profile preparation offers that bundle once through a versioned application-owned record, while native recovery restores ordinary Web bundles and therefore keeps the wallpaper feature disabled after recovery.

**Tech Stack:** TypeScript ESM, Cordis bundle patches and Client slots, React 18, typed locale dictionaries, Vitest and Testing Library, Desktop profile manifests, atomic JSON writes, pnpm patched dependencies, Loader smoke tests, Electron Desktop packaging, Playwright GIF capture.

**Spec:** `docs/superpowers/specs/2026-09-22-desktop-wallpaper-engine-integration-design.md`

## Global Constraints

- The product is one official Desktop build; do not add a second product variant, launcher, profile name, or release artifact.
- The external implementation version is exactly `dsh-plugin-wallpaper-engine@0.7.5`; the lockfile and patch key must remain exact.
- The new first-party packages are `@deepseek-ai/dsh-desktop-wallpaper-engine` and `@deepseek-ai/dsh-client-ui-wallpaper-engine-onboarding`.
- Ordinary Web, Headless, SDK, SDK Minimal, and ACP profile defaults must remain unchanged.
- Native recovery must restore `PROFILE_TEMPLATES.web.bundles`, not the Desktop default list.
- A missing upstream settings object (`settings: null`) means setup is required; every settings object, including an empty selection, means setup is complete.
- Probe failures and invalid responses log one bounded diagnostic, render no wallpaper prompt, complete the process-local step, and leave the ordinary settings section reachable.
- The primary action calls `complete()` before `openSection('wallpaper-engine')`.
- Upstream configuration remains at `~/.dsh-wallpaper-engine/config.json`; Desktop must not mirror wallpaper selection into another store.
- The upstream stylesheet owner must be `data-plugin="dsh-plugin-wallpaper-engine"` so Client disposal and HMR remove it with the module.
- New DSH-owned UI copy must live in typed English and Simplified Chinese dictionaries.
- Every package change updates its English and Chinese README pair, JSDoc, Model Experience, Known Limitations, and translation pairing record in the same task.
- Do not edit or revert unrelated dirty worktree changes; stage and commit only files named by the current task.
- The product-visible change requires a GIF captured from the real Desktop server and settings flow.

---

## File Structure

### New Desktop Bundle

- `packages/bundle/desktop-wallpaper-engine/package.json`: declares the bundle patch, exact upstream dependency, onboarding dependency, peer dependencies, and published files.
- `packages/bundle/desktop-wallpaper-engine/cordis.patch.yml`: inserts one upstream row and one onboarding row.
- `packages/bundle/desktop-wallpaper-engine/src/index.ts`: documented no-op bundle entry used by package tooling.
- `packages/bundle/desktop-wallpaper-engine/tests/desktop-wallpaper-engine.spec.ts`: verifies patch composition, real dependency resolution, row disposal, and the patched stylesheet owner.
- `packages/bundle/desktop-wallpaper-engine/{README.md,README.zh.md,README.i18n.yaml}`: package-bundle usage, ownership, limitations, and verification.

### New Onboarding Client

- `packages/client/ui-wallpaper-engine-onboarding/src/client/probe.ts`: validates `GET /wallpaper-engine/settings` and returns a closed readiness union.
- `packages/client/ui-wallpaper-engine-onboarding/src/client/WallpaperOnboarding.tsx`: renders the setup prompt only for `settings: null` and orders completion before settings navigation.
- `packages/client/ui-wallpaper-engine-onboarding/src/client/index.ts`: registers locale dictionaries and one `settings.onboarding` entry.
- `packages/client/ui-wallpaper-engine-onboarding/src/client/locales.ts`: typed English and Simplified Chinese copy.
- `packages/client/ui-wallpaper-engine-onboarding/src/client/WallpaperOnboarding.module.css`: compact modal layout using existing UI primitives.
- `packages/client/ui-wallpaper-engine-onboarding/src/{index.ts,css-modules.d.ts}` and build configs: standard Client package exports.
- `packages/client/ui-wallpaper-engine-onboarding/tests/*.client.spec.tsx`: probe, rendering, action order, locale, registration, and disposal tests.
- `packages/client/ui-wallpaper-engine-onboarding/{README.md,README.zh.md,README.i18n.yaml}`: package-reference documentation.

### Upstream Pin And Compatibility Patch

- `patches/dsh-plugin-wallpaper-engine@0.7.5.patch`: changes only the built Client stylesheet ownership tag from `dsh-wallpaper-engine` to `dsh-plugin-wallpaper-engine`.
- `pnpm-workspace.yaml`: registers the exact patched dependency.
- `pnpm-lock.yaml`: records `0.7.5`, its integrity, transitive dependencies, and patch hash.

### Desktop Composition And Migration

- `apps/desktop/src/project-manager.ts`: owns Desktop default bundles, parses the versioned offer record, performs the locked one-time offer, and keeps recovery on ordinary Web bundles.
- `apps/desktop/tests/project-manager.spec.ts`: covers fresh profiles, existing profiles, one-time offer, user disablement, recovery, malformed state, and atomic writes.
- `apps/desktop/tests/project-metadata.spec.ts`: verifies development and runtime-build manifests contain the Desktop bundle while ordinary profile templates do not change.
- `apps/desktop-host/package.json`: carries the first-party wrapper into the signed Desktop runtime closure.
- `apps/desktop/scripts/prepare-dsh.ts`, `apps/desktop/tests/prepare-package-set.spec.ts`, and runtime-content tests: carry the same pnpm patch into the temporary production install, select the first-party closure, and verify the patched external package and its transitive dependencies in the finished runtime.
- `apps/desktop/tests/installed-update-package-content.spec.ts`: verifies installed Desktop resources contain the complete wallpaper closure without network installation.

### Integration Evidence And Documentation

- `apps/desktop/tests/wallpaper-engine.loader.spec.ts`: starts the real Desktop profile and verifies routes, slots, saved-settings restart behavior, and stylesheet cleanup.
- `apps/desktop/tests/wallpaper-engine.overlay.yml`: isolates filesystem paths and deterministic fixture settings for the Loader smoke.
- `apps/desktop/tests/gifs/desktop-wallpaper-engine-settings.gif`: real-server first-run setup and Settings navigation evidence.
- `apps/desktop/{README.md,README.zh.md,README.i18n.yaml}`: official Desktop defaults, first-run behavior, auto-restore, recovery, and the exact upstream limitation.
- `packages/bundle/{README.md,README.zh.md,README.i18n.yaml}` and `packages/client/{README.md,README.zh.md,README.i18n.yaml}`: add the two new packages to their owner indexes.

---

### Task 1: Pin And Patch The Upstream Package

**Files:**
- Create: `patches/dsh-plugin-wallpaper-engine@0.7.5.patch`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Test: `packages/bundle/desktop-wallpaper-engine/tests/desktop-wallpaper-engine.spec.ts`

**Interfaces:**
- Consumes: upstream package exports `.`, `./client`, `./cordis.patch.yml`, and `./package.json` at version `0.7.5`.
- Produces: an installed Client bundle whose style element has `data-plugin="dsh-plugin-wallpaper-engine"` and whose remaining bytes match the reviewed release except for pnpm patch metadata.

- [ ] **Step 1: Write the failing compatibility test**

Create the bundle test file with an assertion that reads the resolved installed `lib/client.js` and requires the module-owned tag:

```ts ignore
const client = readFileSync(require.resolve('dsh-plugin-wallpaper-engine/client'), 'utf8')
expect(client).toContain('tag.dataset.plugin = "dsh-plugin-wallpaper-engine"')
expect(client).not.toContain('tag.dataset.plugin = "dsh-wallpaper-engine"')
```

- [ ] **Step 2: Run the focused test and confirm the upstream mismatch**

Run: `pnpm exec vitest run packages/bundle/desktop-wallpaper-engine/tests/desktop-wallpaper-engine.spec.ts`

Expected: FAIL because the unpatched `0.7.5` bundle writes `dsh-wallpaper-engine`.

- [ ] **Step 3: Add the exact dependency and narrow patch**

Add this workspace entry and generate the patch through pnpm so the patch applies to the published built file:

```yaml
patchedDependencies:
  'dsh-plugin-wallpaper-engine@0.7.5': patches/dsh-plugin-wallpaper-engine@0.7.5.patch
```

The patch changes only this line in `lib/client.js`:

```diff
-  tag.dataset.plugin = "dsh-wallpaper-engine";
+  tag.dataset.plugin = "dsh-plugin-wallpaper-engine";
```

- [ ] **Step 4: Install and run upstream verification**

Run: `pnpm install`

Run: `pnpm --dir C:/Users/Administrator/AppData/Local/Temp/dsh-wallpaper-engine-review run verify`

Run: `node C:/Users/Administrator/AppData/Local/Temp/dsh-wallpaper-engine-review/scripts/verify-scene.mjs`

Expected: install succeeds, upstream verify succeeds, and all 13 scene tests pass.

- [ ] **Step 5: Commit the upstream pin**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml patches/dsh-plugin-wallpaper-engine@0.7.5.patch packages/bundle/desktop-wallpaper-engine/tests/desktop-wallpaper-engine.spec.ts
git commit -m "build(desktop): pin wallpaper engine plugin"
```

### Task 2: Build The Localized Onboarding Client

**Files:**
- Create: `packages/client/ui-wallpaper-engine-onboarding/package.json`
- Create: `packages/client/ui-wallpaper-engine-onboarding/tsconfig.json`
- Create: `packages/client/ui-wallpaper-engine-onboarding/tsdown.config.ts`
- Create: `packages/client/ui-wallpaper-engine-onboarding/src/index.ts`
- Create: `packages/client/ui-wallpaper-engine-onboarding/src/css-modules.d.ts`
- Create: `packages/client/ui-wallpaper-engine-onboarding/src/client/probe.ts`
- Create: `packages/client/ui-wallpaper-engine-onboarding/src/client/locales.ts`
- Create: `packages/client/ui-wallpaper-engine-onboarding/src/client/WallpaperOnboarding.tsx`
- Create: `packages/client/ui-wallpaper-engine-onboarding/src/client/WallpaperOnboarding.module.css`
- Create: `packages/client/ui-wallpaper-engine-onboarding/src/client/index.ts`
- Create: `packages/client/ui-wallpaper-engine-onboarding/tests/probe.client.spec.ts`
- Create: `packages/client/ui-wallpaper-engine-onboarding/tests/onboarding.client.spec.tsx`
- Create: `packages/client/ui-wallpaper-engine-onboarding/tests/apply.client.spec.ts`
- Create: `packages/client/ui-wallpaper-engine-onboarding/{README.md,README.zh.md,README.i18n.yaml}`

**Interfaces:**
- Consumes: `PropsRuntime<'settings.onboarding'>`, `InjectFace<T>`, `ctx.locale`, `ctx.slots`, the browser `fetch` implementation, and the upstream `GET /wallpaper-engine/settings` response.
- Produces: `probeWallpaperSettings(fetcher): Promise<WallpaperSettingsReadiness>` where the union is `{ kind: 'setup-required' } | { kind: 'configured' } | { kind: 'unavailable'; diagnostic: string }`, plus one onboarding row with id `wallpaper-engine-setup` and order `100`.

- [ ] **Step 1: Write failing probe tests**

Cover these exact cases: `{ settings: null }`, `{ settings: {} }`, `{ settings: { id: '' } }`, non-2xx response, malformed JSON, missing `settings`, array settings, thrown fetch, and one aborted request during disposal.

```ts ignore
await expect(probeWallpaperSettings(fetcher({ settings: null }))).resolves.toEqual({ kind: 'setup-required' })
await expect(probeWallpaperSettings(fetcher({ settings: {} }))).resolves.toEqual({ kind: 'configured' })
await expect(probeWallpaperSettings(fetcher({ settings: { id: '' } }))).resolves.toEqual({ kind: 'configured' })
```

- [ ] **Step 2: Run the probe tests and verify the missing module failure**

Run: `pnpm exec vitest run packages/client/ui-wallpaper-engine-onboarding/tests/probe.client.spec.ts`

Expected: FAIL because `probe.ts` does not exist.

- [ ] **Step 3: Implement the closed readiness parser**

Use `GET /wallpaper-engine/settings` with an `AbortSignal`. Accept only a JSON object with an own `settings` property whose value is `null` or a non-array object. Convert every failure to one bounded diagnostic string that contains the route and failure class but not response bodies or user paths.

```ts
export type WallpaperSettingsReadiness =
  | { readonly kind: 'setup-required' }
  | { readonly kind: 'configured' }
  | { readonly kind: 'unavailable'; readonly diagnostic: string }
```

- [ ] **Step 4: Write failing component and registration tests**

Assert that loading renders nothing; configured and unavailable call `complete()` once and render nothing; unavailable logs once; setup-required renders localized title, body, and primary button; clicking the button records `['complete', 'open:wallpaper-engine']`; registration disappears after fiber disposal; and changing locale re-registers fresh copy.

- [ ] **Step 5: Implement the component and Client registration**

Use `Modal` from `@deepseek-ai/dsh-client-ui-primitives`, keep `#root` inert while visible, focus the title, and expose only one primary action. Register typed dictionaries under namespace `settings.wallpaper-engine-onboarding` and inject a probe closure plus `ctx.logger.warn`.

```ts ignore
const openSettings = (): void => {
  complete()
  openSection('wallpaper-engine')
}
```

- [ ] **Step 6: Run package tests and Client gates**

Run: `pnpm exec vitest run packages/client/ui-wallpaper-engine-onboarding`

Run: `pnpm run verify-client-ui-i18n`

Run: `pnpm run verify-client-packages`

Run: `pnpm run verify-export-jsdoc`

Expected: all commands pass and the probe failure test observes exactly one warning.

- [ ] **Step 7: Pair documentation and commit**

Run: `pnpm run verify-translation-pairing --write packages/client/ui-wallpaper-engine-onboarding/README.md`

```bash
git add packages/client/ui-wallpaper-engine-onboarding packages/client/README.md packages/client/README.zh.md packages/client/README.i18n.yaml
git commit -m "feat(client): add wallpaper setup onboarding"
```

### Task 3: Add The Desktop Wrapper Bundle

**Files:**
- Create: `packages/bundle/desktop-wallpaper-engine/package.json`
- Create: `packages/bundle/desktop-wallpaper-engine/tsconfig.json`
- Create: `packages/bundle/desktop-wallpaper-engine/src/index.ts`
- Create: `packages/bundle/desktop-wallpaper-engine/cordis.patch.yml`
- Complete: `packages/bundle/desktop-wallpaper-engine/tests/desktop-wallpaper-engine.spec.ts`
- Create: `packages/bundle/desktop-wallpaper-engine/{README.md,README.zh.md,README.i18n.yaml}`
- Modify: `packages/bundle/{README.md,README.zh.md,README.i18n.yaml}`

**Interfaces:**
- Consumes: `dsh-plugin-wallpaper-engine@0.7.5` and `@deepseek-ai/dsh-client-ui-wallpaper-engine-onboarding`.
- Produces: bundle package `@deepseek-ai/dsh-desktop-wallpaper-engine` whose patch inserts ids `desktop-wallpaper-engine` and `ui-wallpaper-engine-onboarding` exactly once.

- [ ] **Step 1: Extend the failing bundle test**

Resolve the real patch through `bundleRoster([...WEB_PROFILE_BUNDLES, '@deepseek-ai/dsh-desktop-wallpaper-engine'])` and assert the two new rows, package resolution, deterministic order, no changes to `WEB_PROFILE_BUNDLES`, and removal after the bundle fiber is disposed.

- [ ] **Step 2: Run the bundle test and verify resolution fails**

Run: `pnpm exec vitest run packages/bundle/desktop-wallpaper-engine/tests/desktop-wallpaper-engine.spec.ts`

Expected: FAIL because the wrapper package and patch do not exist.

- [ ] **Step 3: Add the bundle manifest and patch**

The manifest declares `dsh.bundle.patch`, exact dependency `"dsh-plugin-wallpaper-engine": "0.7.5"`, workspace dependency on the onboarding package, and ordinary Cordis peer/dev dependencies. The patch is exactly:

```yaml
- insert:
    - id: desktop-wallpaper-engine
      name: 'dsh-plugin-wallpaper-engine'

    - id: ui-wallpaper-engine-onboarding
      name: '@deepseek-ai/dsh-client-ui-wallpaper-engine-onboarding'
```

- [ ] **Step 4: Run bundle and documentation checks**

Run: `pnpm exec vitest run packages/bundle/desktop-wallpaper-engine/tests/desktop-wallpaper-engine.spec.ts`

Run: `pnpm run verify-cordis-config`

Run: `pnpm run verify-runtime-closure`

Run: `pnpm run verify-translation-pairing --write packages/bundle/desktop-wallpaper-engine/README.md`

Expected: all commands pass; the ordinary Web roster remains byte-for-byte unchanged.

- [ ] **Step 5: Commit the wrapper bundle**

```bash
git add packages/bundle/desktop-wallpaper-engine packages/bundle/README.md packages/bundle/README.zh.md packages/bundle/README.i18n.yaml
git commit -m "feat(desktop): add wallpaper engine bundle"
```

### Task 4: Offer The Desktop Bundle Once

**Files:**
- Modify: `apps/desktop/src/project-manager.ts`
- Modify: `apps/desktop/tests/project-manager.spec.ts`
- Create or Modify: `apps/desktop/tests/project-metadata.spec.ts`
- Modify: `apps/desktop/package.json`

**Interfaces:**
- Consumes: `PROFILE_TEMPLATES.web.bundles`, `readProfileManifest`, and `writeFileAtomic` from `@deepseek-ai/dsh-atomic-write` while `DesktopProjectManager.withLock()` owns the profile transaction.
- Produces: `DESKTOP_WALLPAPER_BUNDLE`, `DESKTOP_PROFILE_DEFAULT_BUNDLES`, `DesktopDefaultBundleState`, `parseDesktopDefaultBundleState(value)`, and `offerDesktopDefaultBundles(projectDir, defaults)`.

- [ ] **Step 1: Write failing migration tests**

Add tests for a fresh profile, an existing profile without the wrapper, repeated release application, a user-disabled wrapper, native recovery, missing state, malformed JSON, wrong schema version, duplicate offered bundles, non-string entries, and no partially updated file when the atomic writer rejects.

```ts ignore
expect(manifest.dsh.profile.bundles).toEqual([...PROFILE_TEMPLATES.web.bundles, DESKTOP_WALLPAPER_BUNDLE])
expect(state).toEqual({ schemaVersion: 1, offeredBundles: [DESKTOP_WALLPAPER_BUNDLE] })
```

- [ ] **Step 2: Run Desktop project tests and verify the old defaults fail**

Run: `pnpm exec vitest run apps/desktop/tests/project-manager.spec.ts apps/desktop/tests/project-metadata.spec.ts`

Expected: FAIL because profiles contain only ordinary Web bundles and no offer record exists.

- [ ] **Step 3: Implement the versioned offer record**

Use `desktop-default-bundles.json` with exact data:

```ts
export interface DesktopDefaultBundleState {
  readonly schemaVersion: 1
  readonly offeredBundles: readonly string[]
}
```

`createPluginProfile()` initializes new profiles with `DESKTOP_PROFILE_DEFAULT_BUNDLES`. `applyRelease()` then offers any not-yet-recorded default inside the existing lock, appends only absent bundles, atomically writes the manifest before the state record, and rejects invalid existing state without rewriting either file. Add `@deepseek-ai/dsh-atomic-write` to the Desktop package dependencies used by the bundled Electron main process.

- [ ] **Step 4: Preserve recovery semantics**

Keep `disableAllPlugins()` calling `sanitizeProfile('dsh', profile, WEB_PROFILE.bundles)`. Add a regression test that recovery removes the wrapper, leaves `desktop-default-bundles.json` intact, and a later `applyRelease()` does not re-enable it.

- [ ] **Step 5: Update development and runtime metadata**

Change `createDevelopmentProjectMetadata()` and `createRuntimeProjectMetadata()` to use `DESKTOP_PROFILE_DEFAULT_BUNDLES`. Assert the ordinary `PROFILE_TEMPLATES.web.bundles` value and the `web` CLI profile remain unchanged.

- [ ] **Step 6: Run focused Desktop checks and commit**

Run: `pnpm exec vitest run apps/desktop/tests/project-manager.spec.ts apps/desktop/tests/project-metadata.spec.ts apps/desktop/tests/main-startup.spec.ts`

Run: `pnpm run typecheck`

Expected: focused tests and typecheck pass.

```bash
git add apps/desktop/src/project-manager.ts apps/desktop/tests/project-manager.spec.ts apps/desktop/tests/project-metadata.spec.ts apps/desktop/package.json
git commit -m "feat(desktop): offer wallpaper bundle once"
```

### Task 5: Carry The Complete Bundle In The Signed Runtime

**Files:**
- Modify: `apps/desktop-host/package.json`
- Modify: `apps/desktop/scripts/prepare-dsh.ts`
- Modify: `apps/desktop/tests/prepare-package-set.spec.ts`
- Modify: `apps/desktop/tests/installed-update-package-content.spec.ts`
- Modify: `apps/desktop/tests/desktop-package-environment.spec.ts`

**Interfaces:**
- Consumes: the package closure rooted at `@deepseek-ai/dsh` and `@deepseek-ai/dsh-desktop-host`.
- Produces: signed local tarballs for the wrapper and onboarding packages, plus a temporary production install that applies `patches/dsh-plugin-wallpaper-engine@0.7.5.patch` before copying `dsh-plugin-wallpaper-engine@0.7.5`, `jpeg-js`, and `@shaderfrog/glsl-parser` into signed resources.

- [ ] **Step 1: Write failing closure and artifact tests**

Assert that the Desktop Host depends on the wrapper, closure selection includes both first-party packages, the temporary runtime workspace names the exact patch file, its lockfile records the patch hash, and installed resources resolve `dsh-plugin-wallpaper-engine/package.json` to version `0.7.5` without contacting a registry at application launch.

- [ ] **Step 2: Run the packaging tests and verify missing closure**

Run: `pnpm exec vitest run apps/desktop/tests/prepare-package-set.spec.ts apps/desktop/tests/installed-update-package-content.spec.ts apps/desktop/tests/desktop-package-environment.spec.ts`

Expected: FAIL because the Desktop Host does not yet pull the wrapper into the release closure.

- [ ] **Step 3: Add the Host dependency and packaging assertions**

Add `"@deepseek-ai/dsh-desktop-wallpaper-engine": "workspace:^"` to `apps/desktop-host/package.json`. Keep `selectDesktopPackageClosure()` responsible only for workspace tarballs. In `prepare-dsh.ts`, copy the reviewed patch into the temporary build root before the first pnpm command and make runtime project metadata emit the exact `patchedDependencies` entry; verify the generated lockfile contains the patch hash before the production install.

- [ ] **Step 4: Build and smoke the prepared runtime**

Run: `pnpm --filter @deepseek-ai/dsh-desktop-host run build`

Run: `pnpm --filter @deepseek-ai/dsh-desktop run prepare:packages`

Run: `pnpm --filter @deepseek-ai/dsh-desktop run smoke:runtime`

Expected: the prepared runtime resolves the wrapper, onboarding Client, upstream Host/Client, and both upstream runtime dependencies from application resources.

- [ ] **Step 5: Commit the signed-runtime closure**

```bash
git add apps/desktop-host/package.json apps/desktop/scripts/prepare-dsh.ts apps/desktop/tests/prepare-package-set.spec.ts apps/desktop/tests/installed-update-package-content.spec.ts apps/desktop/tests/desktop-package-environment.spec.ts
git commit -m "build(desktop): package wallpaper engine runtime"
```

### Task 6: Verify Real Startup, Restart, And Recovery

**Files:**
- Create: `apps/desktop/tests/wallpaper-engine.loader.spec.ts`
- Create: `apps/desktop/tests/wallpaper-engine.overlay.yml`
- Modify: `apps/desktop/tests/main-startup.spec.ts`

**Interfaces:**
- Consumes: the real Desktop bundle list, Loader smoke harness, upstream inventory/settings routes, Client slot ledger, and temporary `DSH_HOME`.
- Produces: one keyless integration scenario proving first-run registration, saved-settings restart suppression, wallpaper restoration, stylesheet cleanup, and recovery boot.

- [ ] **Step 1: Write the failing Loader smoke**

Start the Desktop profile over a temporary home and assert `GET /wallpaper-engine/settings` returns `{ settings: null }`, `GET /wallpaper-engine/inventory` succeeds, `settings.section` contains `wallpaper-engine`, and `settings.onboarding` contains `wallpaper-engine-setup`.

- [ ] **Step 2: Extend the smoke through a Host restart**

Write a minimal valid settings object through the upstream `PUT /wallpaper-engine/settings`, stop the Host, restart with the same temporary home, and assert the GET response is the saved object and onboarding completes without displaying its modal. Use a deterministic uploaded fixture or upstream-supported empty selection so the test does not require a local Steam installation.

- [ ] **Step 3: Verify Client cleanup and native recovery**

Mount the Client, assert exactly one style tag has `data-plugin="dsh-plugin-wallpaper-engine"`, dispose or disable the wrapper, and assert that tag and both slot rows disappear. Run native recovery and prove the next Host boot succeeds without wallpaper routes while the upstream config file remains untouched.

- [ ] **Step 4: Run the real integration checks**

Run: `pnpm exec vitest run apps/desktop/tests/wallpaper-engine.loader.spec.ts apps/desktop/tests/main-startup.spec.ts`

Run: `pnpm run build`

Expected: the Loader scenario and official build pass without a Wallpaper Engine installation.

- [ ] **Step 5: Commit the startup coverage**

```bash
git add apps/desktop/tests/wallpaper-engine.loader.spec.ts apps/desktop/tests/wallpaper-engine.overlay.yml apps/desktop/tests/main-startup.spec.ts
git commit -m "test(desktop): cover wallpaper startup and recovery"
```

### Task 7: Document And Record The Product Flow

**Files:**
- Modify: `apps/desktop/{README.md,README.zh.md,README.i18n.yaml}`
- Modify: `packages/bundle/{README.md,README.zh.md,README.i18n.yaml}`
- Modify: `packages/client/{README.md,README.zh.md,README.i18n.yaml}`
- Create: `apps/desktop/tests/gifs/desktop-wallpaper-engine-settings.gif`

**Interfaces:**
- Consumes: the verified behavior and commands from Tasks 1-6.
- Produces: paired current-state documentation and a real-server GUI artifact showing the first-run prompt opening the upstream settings section.

- [ ] **Step 1: Update the paired documentation**

Document that the official Desktop app enables the wrapper by default, prompts only until any upstream settings object exists, restores saved state on restart, stores upstream data under `~/.dsh-wallpaper-engine`, and lets native recovery keep the wrapper disabled. State that upstream mixed-language copy and platform discovery behavior remain upstream-owned limitations.

- [ ] **Step 2: Re-record every changed pair**

Run the pairing writer for each changed English document, including both new package README files and all three owner indexes.

Run: `pnpm run verify-translation-pairing`

Expected: all changed pairs and links pass.

- [ ] **Step 3: Start the real Desktop server**

Run: `pnpm dsh web --patch apps/web/tests/pin-browse-picker.overlay.yml` only for browser preflight, then start the official Desktop development command with a clean temporary `DSH_HOME` and the real wallpaper bundle. Record the actual URL and keep the process running for capture.

- [ ] **Step 4: Record and optimize the required GIF**

Use the `record-browser-gif` skill against the real server. Capture: first-run prompt visible, primary action clicked, Wallpaper Engine section selected, an empty or fixture wallpaper configuration saved, Desktop restarted, and no repeated prompt. Save the optimized GIF at `apps/desktop/tests/gifs/desktop-wallpaper-engine-settings.gif` and verify desktop and mobile frames contain no overlap or clipped copy.

- [ ] **Step 5: Run the pre-push selection**

Invoke `dsh-pre-push-checks`, then run only the commands it selects for the final diff. The minimum expected set is the focused package tests, Desktop project/package/Loader tests, `typecheck`, `verify-client-ui-i18n`, `verify-cordis-config`, `verify-runtime-closure`, `test:docs`, `doc-sync`, and `git diff --check`.

- [ ] **Step 6: Review the complete diff and commit**

Confirm no unrelated dirty file is staged, no credential or local Wallpaper Engine path appears, the lockfile selects `0.7.5`, and ordinary non-Desktop profile defaults are unchanged.

```bash
git add apps/desktop/README.md apps/desktop/README.zh.md apps/desktop/README.i18n.yaml packages/bundle/README.md packages/bundle/README.zh.md packages/bundle/README.i18n.yaml packages/client/README.md packages/client/README.zh.md packages/client/README.i18n.yaml apps/desktop/tests/gifs/desktop-wallpaper-engine-settings.gif
git commit -m "docs(desktop): document wallpaper engine setup"
```

---

## Final Acceptance

- [ ] A clean official Desktop profile starts with `@deepseek-ai/dsh-desktop-wallpaper-engine` enabled and requires no runtime package installation.
- [ ] An existing profile receives the wrapper once; later Plugin Manager disablement and native recovery survive every restart.
- [ ] `settings: null` displays localized onboarding, while `{}`, `{ id: '' }`, and every other settings object suppress it.
- [ ] The primary action completes onboarding before opening `wallpaper-engine` settings.
- [ ] A saved configuration survives Host and Desktop restart and the upstream Client restores it automatically.
- [ ] Recovery boots with ordinary Web bundles, no wallpaper routes or Client rows, and preserved upstream configuration files.
- [ ] The signed runtime resolves the exact pinned package and its runtime dependencies offline.
- [ ] Ordinary Web, Headless, SDK, SDK Minimal, and ACP defaults remain unchanged.
- [ ] Focused tests, selected repository gates, paired documentation, and the real-server GIF all pass review.
