# Oasisfish GitHub Release Updates Design

English | [中文](2026-09-06-oasisfish-github-release-updates-design.zh.md)

## Goal

Let a packaged Oasisfish installation or extracted portable distribution check the public `mislw/Oasisfish` GitHub Releases feed, download a newer Windows installer on explicit user request, replace an older installed application, and preserve every user-owned setting, credential, session, cache, and log.

## Release contract

`apps/desktop/package.json` remains the application-version source of truth. A release tag is `v<version>` and must equal that package version. The release workflow publishes the NSIS installer, its block map, and `latest.yml`; the updater rejects prereleases unless the running application version is itself a prerelease on the same channel.

Only a published GitHub Release is an application update. Pushing source to `main` does not change installed clients until a matching version tag produces the release assets.

## Desktop update service

The Electron main process owns a `DesktopUpdateController` around `electron-updater`. It configures the fixed public GitHub provider, disables automatic download and installation, and exposes a finite state machine: `idle`, `checking`, `up-to-date`, `available`, `downloading`, `downloaded`, `installing`, `unsupported`, or `error`.

The controller serializes user commands so repeated clicks cannot start parallel checks or downloads. It converts updater events into immutable renderer data containing only application versions, progress, status, and a user-safe error message. Release URLs, filesystem paths, headers, tokens, and raw exceptions never cross into the renderer.

Update checks are manual. Opening Oasisfish or the Settings panel causes no GitHub request, download, or installation.

## Renderer bridge

Electron loads a sandboxed preload entry and exposes one `window.oasisfishUpdate` object through `contextBridge`. The object supports `getState`, `check`, `download`, `install`, and `subscribe`; it does not expose generic IPC, shell execution, arbitrary URLs, arbitrary paths, or updater configuration.

The main process registers one handler per command and broadcasts state changes on a dedicated channel. Every handler validates the current controller state before acting. `install` is accepted only after a verified installer has reached `downloaded`.

## Settings UI

A new `@deepseek-ai/dsh-client-ui-desktop-update` browser plugin contributes an **App updates** section to `settings.section` only when the preload bridge exists. Ordinary system-browser sessions and remote Web clients register no section and make no update request.

The section shows the current version and one primary command appropriate to the state: **Check for updates**, **Download update**, or **Restart and install**. Downloading shows determinate progress when the provider reports a total and an indeterminate status otherwise. Errors remain visible with a retry action. Buttons use existing icon controls and stay disabled while an incompatible command is in flight.

## Installed and portable behavior

An installed NSIS build downloads and launches the newer NSIS installer through `electron-updater`. The installer keeps the application identity and per-user installation mode, replaces the registered older program, and starts the new version after installation.

An extracted `win-unpacked` portable distribution uses the same check and download flow, then launches the NSIS installer and migrates the user to the installed application. The portable directory is eligible for cleanup only when it contains the packaged product marker and its current files match the packaged inventory. A detached cleanup helper waits for the old process and installer to exit, verifies that the installed executable reports the requested version, removes only inventory-owned files, and removes the directory only when it is empty. Any unknown file, changed path, failed installation, version mismatch, reparse point, or unsafe target leaves the portable directory untouched and records a diagnostic.

Installed upgrades do not use portable cleanup. They rely on the NSIS upgrade path and never recursively delete an installation directory from application code.

## User data preservation

The update path never deletes, moves, or rewrites `%APPDATA%\DeepSeek Harness`. Electron continues to set that directory as `userData`, so profiles, settings, credential references and stored secrets, sessions, caches, browser state, and logs survive portable migration and installed upgrades.

Downloaded update artifacts and update diagnostics live below the same per-user data root in an `updates` directory. The installer and cleanup helper receive no model credential values. Release creation excludes `.env`, per-user data, runtime logs, and local caches.

## Publication workflow

`.github/workflows/oasisfish-release.yml` runs on a `v*` tag or manual dispatch. It checks that the tag matches `apps/desktop/package.json`, installs the frozen workspace, runs the selected release checks, builds the Windows x64 NSIS target, and publishes through `electron-builder` using the workflow-scoped `GITHUB_TOKEN` with `contents: write`.

The workflow does not accept or reference model-provider secrets. `electron-builder.yml` fixes the update provider to the public `mislw/Oasisfish` repository so clients never receive a credential or repository override.

## Failure handling

Network, rate-limit, missing-release, invalid-metadata, checksum, download, launch, and installation failures produce an `error` state without changing the current application. A failed portable cleanup leaves the previous directory available. A failed installed upgrade leaves Windows' registered installation intact.

Unsigned builds may show Windows reputation or publisher warnings. The update UI states that installation requires accepting the operating-system installer prompt; it does not bypass that prompt or weaken checksum verification.

## Verification

Desktop unit tests cover state transitions, command serialization, safe error projection, packaged-only behavior, preload channel restrictions, install eligibility, and portable cleanup allowlists. Client tests cover conditional section registration, localized states, progress, retry, and command dispatch. An assembled keyless Web snapshot proves the desktop-only section is absent in an ordinary browser and present with the test bridge.

Packaging tests require `latest.yml`, the installer block map, the product marker, and the cleanup helper. The unpacked smoke flow serves a local fake release feed, downloads a fixture installer without external credentials, verifies the checksum, and proves that user data remains byte-identical. A Windows release smoke installs version N, writes a user-data fixture, upgrades to N+1, and verifies the old registered program is replaced while the fixture survives.

## Alternatives considered

**Open the GitHub Releases page.** This avoids an update service but gives no in-app progress, integrity-owned download, installation handoff, or reliable installed-version replacement.

**Update the source checkout with Git.** Installed users do not have a development checkout, and rebuilding locally would couple product updates to developer tools and repository history.

**Delete the complete portable directory after installation.** Recursive deletion could remove user-added files or an incorrectly resolved path. Inventory-owned cleanup provides automatic removal when safe and preserves the directory when ownership cannot be proven.
