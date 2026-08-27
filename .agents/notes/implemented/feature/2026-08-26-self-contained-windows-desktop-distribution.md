# Agent Note: Self-contained Windows desktop distribution

Status: implemented

English | [中文](2026-08-26-self-contained-windows-desktop-distribution.zh.md)

## Problem

Running DeepSeek Harness on a clean Windows machine otherwise requires the user to install and coordinate Node.js, pnpm, Python, Git, shells, and supporting command-line tools before the product can execute ordinary coding tasks. A desktop wrapper that depends on the host toolchain would move the Web UI into a window without removing that installation requirement, while copying a workspace tree directly would preserve pnpm links and implicit peer dependencies that do not survive relocation.

## Decision

**The Windows x64 product is an Electron supervisor over the existing Web application.** Electron reserves an operating-system-assigned loopback port, starts the packaged `dsh web --no-open` entry with the bundled Node.js executable, waits for HTTP readiness, and loads that origin only in a sandboxed BrowserWindow without a system-browser handoff. The application rejects external navigation and new windows, enforces a single instance, writes startup diagnostics below the user data directory, and terminates the Harness process tree before quitting.

**The distribution carries a verified private coding runtime.** [`apps/desktop/runtime-manifest.json`](../../../../apps/desktop/runtime-manifest.json) pins upstream URLs and SHA-256 checksums for Node.js, pnpm, Python, pip, Git for Windows, PowerShell, ripgrep, fd, jq, and 7-Zip. Git for Windows also supplies Git Bash, curl, and OpenSSH. Runtime preparation validates the archive hash, extraction result, required files, and executable versions. Python entry-point launchers use distlib's `<launcher_dir>` form so pip resolves the adjacent packaged interpreter after relocation.

**Bundled tools are visible only to the Harness process tree.** The supervisor prepends installed tool directories to the child `PATH`, sets the private Python and Harness data locations, and leaves the user's global environment unchanged. Product resources are immutable installation files; settings, credentials, profiles, sessions, caches, and logs remain under Electron's per-user data root.

**The Harness deployment has an explicit workspace dependency closure.** `apps/desktop-runtime/package.json` is the dependency-only deploy root. The repository closure verifier follows application workspace dependencies and requires every workspace peer at that root. pnpm deploys a hoisted production tree, staging materializes package links into independent files, and electron-builder's `afterPack` hook copies and inventories the complete Harness directory because its ordinary `extraResources` traversal filters `node_modules`.

**Release verification operates on the packaged directory.** The staging inventory requires product entry points and tool executables. `smoke:unpacked` rejects reparse points, executes every bundled tool, starts the packaged application, requires HTTP readiness without a default-browser handoff and continued Harness liveness, requests application shutdown, and requires the Electron and Harness processes to exit. Model and remote API requests remain online operations and require user-provided credentials.

## Alternatives considered

**Install missing tools on first launch.** Rejected because it makes a clean-machine start depend on package managers, elevation, external mirrors, and mutable global state; it also prevents a deterministic offline local runtime.

**Wrap only the hosted or locally installed Web UI.** Rejected because a window without the Harness runtime cannot execute coding tasks on a clean machine and does not satisfy the self-contained product requirement.

**Package the development workspace or pnpm links as-is.** Rejected because junctions and workspace-relative peer resolution depend on the build checkout. The released tree must contain independent package files and an explicitly closed production dependency graph.

**Add bundled tools to the user's global `PATH`.** Rejected because the application owns these exact versions and must not replace or shadow the user's development environment outside the Harness process tree.

## Consequences

The NSIS installer and unpacked directory can start the Harness UI and execute the bundled local coding tools on Windows x64 without preinstalled developer runtimes. The package is substantially larger and the release process owns upstream version, checksum, license, and Windows compatibility updates. The loopback server remains a local child process rather than Electron renderer code, preserving the existing plugin assembly and Web behavior. Clean virtual-machine installation remains a release acceptance activity beyond the packaged-directory smoke test.
