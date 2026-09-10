# Agent Note: Installation-owned profile resolution

Status: implemented

English | [中文](2026-09-09-installation-owned-profile-resolution.zh.md)

## Problem

The shipped `web` and `headless` profiles store their root config under the writable Harness home even though every bundle and plugin they mount belongs to the installed dsh application. Resolving those bare plugins only through the config directory requires a generated `$DSH_HOME/profiles/node_modules` tree. On Windows, a user-data directory whose reparse points cannot reach the installation volume makes every generated link unusable and prevents Oasisfish from starting, although the installation itself contains every required package.

## Decision

The dsh profile launcher passes its installation anchor to `boot` as the installed-host module base. The root Loader and root include resolve each bare package from that host first, including entries a plugin creates later through `loader.create()`. The installed root Loader also exposes `resolvePackageJson(specifier)`, and the client-module scanner uses it so the browser boot graph describes the same installation-owned packages that the Loader imported. These paths retry from the original tree base only when Node reports that the requested top-level package itself is absent from the host; a missing dependency inside a host package, an inaccessible package metadata export, and every other resolution failure remain errors from the installed package.

`loadProfile` reports whether a profile needs the shared module fallback. The exact shipped `web` or `headless` template with no profile dependencies does not heal or write `$DSH_HOME/profiles/node_modules`. A profile with another bundle tuple or any profile dependency still heals the fallback so its installed plugins can share the application's Cordis instance and other peer dependencies.

## Alternatives considered

**Move desktop user data outside AppData.** This avoids the affected filesystem tree but changes the ownership and migration location of settings, credentials, sessions, and caches for every desktop installation.

**Always generate copied package trees instead of links.** Copying the complete application dependency closure into each Harness home duplicates a large installation, complicates upgrades, and can let profile plugins load a different Cordis instance.

**Fall back on every host import error.** A profile-local package could then hide a broken installed package or a missing dependency inside it, replacing an actionable installation error with different code.

## Consequences

- Shipped profile startup depends on readable installation packages and writable profile config files, not cross-volume links inside the user-data directory.
- Profile-installed plugins keep config-relative resolution and the shared dependency fallback.
- An installed package remains authoritative when both the installation and profile contain the same package name.
- The browser boot graph remains populated when an installation-owned web profile lives under a user-data directory that cannot resolve application packages.
- The fallback healer and its startup coordination remain required for customized profiles.
