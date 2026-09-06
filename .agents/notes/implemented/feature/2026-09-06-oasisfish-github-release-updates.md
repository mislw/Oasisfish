# Agent Note: Oasisfish GitHub Release updates

Status: implemented

English | [中文](2026-09-06-oasisfish-github-release-updates.zh.md)

## Problem

Oasisfish can be distributed as an NSIS installer or an extracted portable directory, but neither distribution can discover or install a newer build. Replacing application files manually is error-prone, while user settings and credentials must survive every update.

## Decision

Oasisfish uses a desktop-owned update controller backed by `electron-updater`, a narrow sandboxed preload API, and a desktop-only Settings section. Published `mislw/Oasisfish` GitHub Releases provide the installer, block map, and update metadata; source pushes without a matching release do not notify clients.

The main process loads `electron-updater` with `createRequire(import.meta.url)` only after Electron is ready. Loading it through an ESM import before `boot()` can stall a packaged Electron process before the application window opens.

Installed builds use the NSIS upgrade path. Portable builds migrate to the installer and run a detached cleanup helper that removes only manifest-owned portable files after the installed version is verified. `%APPDATA%\DeepSeek Harness` remains outside application cleanup and installation replacement.

The complete component, state, release, cleanup, and verification design is documented in [Oasisfish GitHub Release Updates Design](../../../../docs/superpowers/specs/2026-09-06-oasisfish-github-release-updates-design.md).

## Alternatives considered

**Open the Releases page.** This delegates integrity, progress, and installation entirely to the user and does not provide the requested in-app update flow.

**Recursively remove the portable directory.** The application cannot assume every file beside its executable belongs to the product, so unconditional recursive deletion is not acceptable.

**Update from the Git working tree.** Installed applications are artifacts rather than development checkouts, and a Git update cannot replace the running Electron installation safely.

## Consequences

A packaged Windows client can manually check, download, and install a compatible public Release. The controller disables startup checks, background downloads, and installation on ordinary application exit. Ordinary browser clients expose no update section or updater command.

Installed upgrades use NSIS replacement. Portable migration removes only unchanged inventory-owned files after the installed target version writes its receipt; unknown files, modified bytes, reparse points, version mismatch, or failed installation preserve the old directory. `%APPDATA%\DeepSeek Harness` is outside application replacement and cleanup, so settings, stored credentials, sessions, caches, browser state, and logs remain available.

The release workflow accepts only a tag equal to `v<apps/desktop package version>` and uses only GitHub's workflow token. No model credential, `.env`, user data, log, cache, or local Release binary is part of the source commit.

Directory packaging verifies the files available immediately after `afterPack`; NSIS Release packaging additionally requires `app-update.yml`. Keeping those inventories separate allows unpacked smoke builds to finish while preserving a fail-closed check for updater metadata in distributable installers.

Unsigned installers can trigger Windows reputation warnings. GitHub availability and public API limits can prevent a check or download without affecting the running application. Conservative cleanup can leave an old portable directory for manual removal when ownership or installation success cannot be proven. A final two-version Windows installer upgrade remains a release-time smoke because it requires two deliberately versioned NSIS fixtures.
