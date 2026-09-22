# Desktop Wallpaper Engine Integration Design

English | [中文](2026-09-22-desktop-wallpaper-engine-integration-design.zh.md)

## Goal

The single official Desktop application ships Wallpaper Engine backgrounds as a default-enabled, recoverable bundle. A new installation asks the user to configure the feature before normal use; after the user saves any wallpaper configuration, later launches restore the selected background automatically without repeating onboarding.

The integration uses the existing `dsh-plugin-wallpaper-engine` Host and Client implementation. DSH owns Desktop composition, first-run onboarding, recovery, package version selection, and release verification; the upstream package continues to own Wallpaper Engine discovery, media serving, scene rendering, custom uploads, appearance controls, and its settings page.

## Scope

This delivery adds a Desktop-owned wrapper bundle, carries an exact upstream package version in the signed runtime, enables the wrapper for new and existing Desktop profiles once, and contributes a localized onboarding step that opens the upstream `Wallpaper Engine` settings section.

This delivery does not copy the upstream renderer into `packages/`, redesign its settings UI, move its configuration into the DSH settings document, change ordinary `web` profile defaults, or make Wallpaper Engine available to Headless, SDK, or ACP profiles. It also does not remove the repository's current internal client-build selectors; the product behavior is one official Desktop feature regardless of those build-time identifiers.

## Package Ownership

The integration adds two first-party packages and retains the upstream implementation as an exact external dependency.

| Package | Responsibility |
|---|---|
| `@deepseek-ai/dsh-desktop-wallpaper-engine` | Desktop-only bundle that inserts the upstream Host row and the first-party onboarding row |
| `@deepseek-ai/dsh-client-ui-wallpaper-engine-onboarding` | Localized first-run decision and settings navigation; it owns no wallpaper rendering or configuration fields |
| `dsh-plugin-wallpaper-engine@0.7.5` | Upstream Host routes, browser background layer, settings section, persistence, Wallpaper Engine discovery, media processing, and scene rendering |

`apps/desktop-host` depends on the first-party wrapper bundle so Desktop packaging carries the wrapper, its Client package, and the exact upstream dependency inside the signed runtime. The wrapper's bundle patch inserts `dsh-plugin-wallpaper-engine` as a Host row and the onboarding package as a separate Client row. The upstream bundle is not selected independently, which keeps the whole feature behind one Desktop bundle switch.

The dependency uses an exact version rather than a range. A release updates it only through a reviewed lockfile change, upstream release inspection, focused compatibility tests, and a packaged Desktop smoke.

## Desktop Profile Composition

Desktop owns a default bundle list formed from the ordinary Web bundles plus `@deepseek-ai/dsh-desktop-wallpaper-engine`. New development, runtime-build, and user profile manifests receive the same list; the ordinary `web` profile remains unchanged.

The wrapper is a selected Desktop bundle rather than an application overlay. The existing native recovery action therefore restores only the ordinary Web bundle list, which disables the complete wallpaper feature before the next Host boot. A faulty upstream package cannot remain mandatory after the user selects **Disable third-party plugins**.

The Plugin Manager displays the wrapper as one enabled bundle. Disabling it removes both the upstream Host and Client behavior and the onboarding row. Re-enabling it restores the feature without deleting `~/.dsh-wallpaper-engine/config.json`, uploaded wallpaper files, or generated caches.

## Existing Profile Migration

`initProfile()` does not replace an existing Desktop manifest, so Desktop adds an application-owned default-bundle record under the reserved Desktop profile directory. The record uses a versioned JSON format and stores every default bundle that the application has already offered to that profile.

During `DesktopProjectManager.applyRelease()`, while holding the existing profile transaction lock, Desktop reads the profile manifest and the default-bundle record. If the record has never offered the wallpaper wrapper, Desktop appends the wrapper to `dsh.profile.bundles` when absent and records that it has been offered. The write is atomic and completes before Host startup.

The record distinguishes a release migration from a user's later choice. After the first offer, disabling the wrapper through Plugin Manager or native recovery leaves the record intact, so later launches do not enable it again. A missing record represents the first offer; an existing invalid record fails profile preparation with a concrete diagnostic instead of silently rewriting user activation state.

## First-Run Experience

The onboarding package registers one root-scoped `settings.onboarding` entry through the existing settings shell. Its visible copy lives in typed English and Simplified Chinese locale dictionaries.

When the onboarding component becomes eligible, it requests `GET /wallpaper-engine/settings`. The upstream route returns `settings: null` before the first successful settings write and an object afterward. The component renders the first-run dialog only for the `null` state. A saved object counts as configured even when the user later clears the active wallpaper, disables rotation, or chooses an empty selection.

The primary action calls the settings owner's `complete()` operation and opens the `wallpaper-engine` section through `openSection('wallpaper-engine')`. Completion is process-local; the upstream settings object remains the durable first-run fact. If the user closes the section without saving, onboarding appears again after the next application start. Once the upstream plugin writes settings, future starts render no onboarding step.

The onboarding request is advisory and must not block the application while availability is unknown. A missing route, non-success response, invalid response fields, or connection failure renders nothing and logs one bounded diagnostic. The upstream settings section remains reachable from ordinary Settings, so a transient onboarding probe cannot make configuration inaccessible.

## Runtime Behavior

After onboarding, the upstream Client loads its persisted selection before refreshing inventory and mounts the saved background layer. The integration does not add a second persistence store or mirror the selected wallpaper into Desktop state.

The upstream Host continues to expose tokenized same-origin routes for inventory, media, previews, uploads, settings, transcodes, and scene resources. Web wallpapers retain the upstream sandbox without `allow-same-origin`, so workshop scripts cannot act as the authenticated DSH application origin. Upload and settings body limits, stream cleanup, ffmpeg cancellation, and hashed ffmpeg downloads remain upstream behavior verified at the pinned version.

The feature remains useful without a detected Wallpaper Engine installation because the upstream page supports custom JPG, PNG, and MP4 uploads. On unsupported systems or machines without Wallpaper Engine, discovery returns no installation and the settings page presents the upstream empty state; Desktop does not claim native Wallpaper Engine support on those systems.

## Styling and Compatibility

The upstream Client intentionally applies global theme variables and selectors to the application shell. The exact dependency pin limits unreviewed changes, but it does not turn those selectors into a stable DSH API. Each Desktop release that updates DSH theme, settings, sidebar, or shell structure must include a wallpaper compatibility smoke before updating the upstream version.

The pinned upstream release writes its stylesheet ownership tag as `dsh-wallpaper-engine`, while the DSH Client module id is `dsh-plugin-wallpaper-engine`. Packaged startup is unaffected because the bundle materializes once, but Client HMR and live disablement can retain stale styles. The first integration includes a narrow upstream patch or wrapper-owned normalization that makes the tag match the module id, plus a regression test for removal and replacement.

New DSH-owned copy follows the locale dictionaries and UI primitives. The upstream package's mixed Chinese and English copy remains package-owned and is recorded as a release limitation; replacing all upstream copy is separate upstream or vendoring work rather than a hidden expansion of this integration.

## Errors and Recovery

| Condition | Behavior |
|---|---|
| Upstream package cannot resolve from the signed runtime | Desktop packaging or runtime smoke fails; no release artifact is accepted |
| Wrapper activation fails during normal startup | Desktop reports the Host failure and native recovery can disable the wrapper |
| First-run settings probe fails | Onboarding renders nothing; ordinary Settings remains available |
| Wallpaper Engine is not installed | Inventory is empty and custom uploads remain available |
| Saved wallpaper file disappears | The upstream plugin reports its existing unavailable or filtered state; Desktop does not erase configuration |
| Native recovery disables plugins | The wrapper leaves the active bundle list and stays disabled until the user re-enables it |
| Upstream version update changes required routes or slots | Focused compatibility tests fail before packaging |

## Testing

Wrapper bundle tests load its real patch and verify that it inserts exactly one upstream row and one onboarding row, resolves the pinned dependency, and disposes both rows with the bundle fiber.

Onboarding Client tests cover `settings: null`, saved settings, a deliberately empty saved selection, request failure, invalid JSON fields, localized copy, primary-action ordering, section navigation, and disposal. The test for primary-action ordering verifies that the process-local step completes before the settings panel opens, preventing the onboarding dialog and settings panel from competing for focus.

Desktop project tests cover new-profile defaults, the one-time migration of an existing profile, preservation of a user-disabled wrapper, native recovery, malformed migration state, development metadata, runtime-build metadata, and package-set inclusion.

A real Loader smoke starts the Desktop profile with the wrapper and verifies the upstream inventory and settings routes, the `settings.section` registration, the onboarding registration, and stylesheet cleanup. Upstream self-checks run at the pinned package version. The packaged Windows smoke verifies that the signed runtime resolves the package without network installation and that a saved test configuration survives a Host restart.

This user-visible Desktop change also records a GIF from the real Desktop server and settings flow before review. Documentation updates cover the Desktop README pair, wrapper and onboarding README pairs, package-group indexes, and exact commands selected through `dsh-pre-push-checks`.

## Alternatives

An application overlay could insert the upstream row with fewer files, but native recovery would apply the same overlay after resetting the profile and could not disable the failing plugin. The design rejects that coupling.

Selecting the upstream bundle directly would not provide a single official feature identity or a place for DSH-owned onboarding and compatibility tests. The wrapper keeps activation and recovery atomic while leaving runtime behavior upstream-owned.

Copying the full upstream implementation into `packages/` would permit complete localization and API refactoring, but it would make DSH responsible for thousands of lines of scene rendering, reverse-engineered formats, ffmpeg handling, and upstream synchronization. This design prefers an exact maintained dependency until a separate vendoring decision justifies that ownership.

## Acceptance Criteria

- A fresh official Desktop profile enables the wallpaper wrapper without a package-manager or network operation.
- An existing Desktop profile receives the wrapper once, and a later user disablement survives every restart and update.
- A profile with no upstream settings object receives one localized first-run prompt that opens the `Wallpaper Engine` settings section.
- Any successful upstream settings write suppresses later onboarding, including when the saved selection is empty.
- A saved wallpaper selection restores automatically after Desktop and Host restart.
- Native recovery disables the complete feature and permits Desktop to boot without the upstream package active.
- Ordinary Web, Headless, SDK, SDK Minimal, and ACP profile defaults do not change.
- The packaged runtime resolves the exact upstream version from signed application resources.
- Focused tests reject missing routes, broken slot registration, stale stylesheet ownership, migration replay, and recovery that re-enables the bundle.
