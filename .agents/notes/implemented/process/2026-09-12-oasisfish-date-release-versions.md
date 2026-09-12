# Agent Note: Oasisfish date-based release versions

Status: implemented

English | [中文](2026-09-12-oasisfish-date-release-versions.zh.md)

## Problem

Oasisfish desktop releases need a version that identifies the major product line, calendar date, and revision within that date. Windows executable metadata cannot store an eight-digit date in one numeric version part because each part is limited to 65535.

## Decision

The canonical Oasisfish desktop version uses `V.YYYYMMDD.T`, where `V` is the positive major version, `YYYYMMDD` is a valid calendar date, and `T` is the positive revision for that date. The desktop package, application version, installer filename, update metadata, Git tag, and GitHub Release use this canonical value.

`apps/desktop/package.json` also carries `shortVersion` and `shortVersionWindows` as `V.YYYY.MMDD.T` with leading zeroes removed from the `MMDD` part. Electron Builder uses that value for Windows executable metadata while preserving the canonical package version everywhere users and the updater identify a release. `apps/desktop/scripts/validate-release-tag.mjs` rejects an invalid date, a non-positive major or revision, a mismatched tag, or inconsistent Windows metadata before publication.

## Alternatives considered

**Put `YYYYMMDD` directly into the Windows file version.** Windows resource version parts cannot represent values above 65535, so the executable metadata would fail or normalize incorrectly.

**Use only the Windows-compatible version everywhere.** `V.YYYY.MMDD.T` obscures the requested contiguous release date and would make installer, updater, tag, and release identifiers differ from the product's version convention.

## Consequences

One release has a canonical public version and an equivalent Windows resource version. Publication must update all three package fields together; the release workflow verifies that relationship before building. The canonical version remains valid SemVer, so Electron Updater can order releases by major version, date, and revision.
