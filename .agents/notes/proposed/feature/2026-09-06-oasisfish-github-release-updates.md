# Agent Note: Oasisfish GitHub Release updates

Status: proposed

English | [中文](2026-09-06-oasisfish-github-release-updates.zh.md)

## Problem

Oasisfish can be distributed as an NSIS installer or an extracted portable directory, but neither distribution can discover or install a newer build. Replacing application files manually is error-prone, while user settings and credentials must survive every update.

## Proposal

Add a desktop-owned update controller backed by `electron-updater`, a narrow sandboxed preload API, and a desktop-only Settings section. Published `mislw/Oasisfish` GitHub Releases provide the installer, block map, and update metadata; source pushes without a matching release do not notify clients.

Installed builds use the NSIS upgrade path. Portable builds migrate to the installer and run a detached cleanup helper that removes only manifest-owned portable files after the installed version is verified. `%APPDATA%\DeepSeek Harness` remains outside application cleanup and installation replacement.

The complete component, state, release, cleanup, and verification design is documented in [Oasisfish GitHub Release Updates Design](../../../../docs/superpowers/specs/2026-09-06-oasisfish-github-release-updates-design.md).

## Alternatives considered

**Open the Releases page.** This delegates integrity, progress, and installation entirely to the user and does not provide the requested in-app update flow.

**Recursively remove the portable directory.** The application cannot assume every file beside its executable belongs to the product, so unconditional recursive deletion is not acceptable.

**Update from the Git working tree.** Installed applications are artifacts rather than development checkouts, and a Git update cannot replace the running Electron installation safely.

## Acceptance criteria

- A packaged Windows client manually checks the public Release feed and reports whether a newer compatible version exists.
- The user explicitly starts download and installation; no startup check, background download, or unattended installation occurs.
- The downloaded installer is validated against published update metadata before it can run.
- An installed upgrade replaces the older registered application and preserves `%APPDATA%\DeepSeek Harness` byte-for-byte.
- A portable migration deletes only verified product-owned files after the installed target version is confirmed and preserves any directory containing unknown content.
- Ordinary browser clients expose no desktop update UI or updater command.
- The release workflow uses only GitHub's workflow token and publishes no model credential, `.env`, user data, log, or cache.

## Risks

Unsigned installers can trigger Windows reputation warnings. GitHub availability and public API limits can prevent a check or download without affecting the running application. Conservative portable cleanup can intentionally leave old product files for manual removal when ownership or installation success is uncertain.
