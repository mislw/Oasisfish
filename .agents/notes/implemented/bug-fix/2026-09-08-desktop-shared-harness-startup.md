# Agent Note: Desktop shared Harness startup

Status: implemented

English | [中文](2026-09-08-desktop-shared-harness-startup.zh.md)

## Problem

Installed and unpacked Oasisfish distributions share one desktop user-data directory. Electron's application lock does not coordinate processes launched from different executable locations, so two distributions can start Harness concurrently and race while repointing the same profile module fallback links. The losing Harness exits before HTTP readiness and the desktop shell reports a startup failure.

## Decision

The desktop user-data directory owns one Harness startup coordinator. A valid `desktop-ready.json` is reusable only when it names a live PID, an HTTP `127.0.0.1` URL, and a successful response. Otherwise a desktop process atomically creates `desktop-harness-startup.lock`, checks readiness again, and starts Harness while holding the lock. Competing distributions wait for readiness instead of starting another process. A missing, invalid, or dead lock owner is removed before retry.

Harness startup also serializes `healProfilesModuleFallback` itself through `$DSH_HOME/profiles/.module-fallback-heal.lock`. The lock covers the complete dependency traversal and every fallback-link update, so callers outside the desktop coordinator cannot interleave links from different installations. Live owners are awaited; a dead owner is removed only while the inode and record still match; invalid locks and ownership replacement fail without deleting the observed path.

Windows may keep many moved or deleted junction names unavailable while a packaged installation redirects the complete fallback. The healer therefore builds all links in a sibling directory and publishes them with one directory rename while holding the repair lock. It resolves the installation anchor and every discovered package to their real directories before building that link set; otherwise a workspace or pnpm junction can become the target of another junction and Windows can collapse the result into an unavailable-device mount point. Publication failure restores the previous directory. Cleanup classifies entries from their parent-directory enumeration without following link targets, so a stale junction whose target device is unavailable can still be replaced. It accepts only junctions and scope directories containing junctions, and leaves a recognizable retired directory when Windows still holds it.

The desktop process records ownership separately from reuse. Only a Harness started by that process is stored in `harnessProcess` and terminated during its exit or update installation. A window that reuses another process's Harness never kills it.

## Alternatives considered

**Rely only on Electron `requestSingleInstanceLock()`.** Executable-location differences prevent it from being the data-directory-level authority needed by installed and unpacked distributions.

**Make every profile-link update tolerate different concurrent targets.** Two installations can contain different Harness versions, so accepting whichever target wins would make one running process resolve dependencies from another distribution.

**Assign each distribution a separate user-data directory.** This avoids the race by duplicating settings, credentials, sessions, and caches, violating the upgrade and portable-use expectation that Oasisfish preserves one user state.

## Consequences

- Multiple Oasisfish distributions sharing one user-data directory reuse one responding Harness, and every caller serializes profile module fallback mutation even outside the desktop coordinator.
- Moving between installation directories tolerates the bounded Windows junction deletion delay without accepting a foreign occupant.
- Stale readiness and startup locks recover without deleting user configuration.
- Reused Harness lifetime belongs to the process that started it; closing a borrowing window does not terminate shared work.
- Coordination accepts only a live local loopback HTTP endpoint, so a foreign ready file cannot redirect the desktop window.
