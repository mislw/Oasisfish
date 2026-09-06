# Agent Note: Self-contained Windows desktop distribution

Status: implemented

English | [中文](2026-08-26-self-contained-windows-desktop-distribution.zh.md)

## Problem

Running DeepSeek Harness on a clean Windows machine otherwise requires the user to install and coordinate Node.js, pnpm, Python, Git, shells, and supporting command-line tools before the product can execute ordinary coding tasks. A desktop wrapper that depends on the host toolchain would move the Web UI into a window without removing that installation requirement, while copying a workspace tree directly would preserve pnpm links and implicit peer dependencies that do not survive relocation.

## Decision

**The Windows x64 product is an Electron supervisor over the existing Web application.** Electron reserves an operating-system-assigned loopback port, starts the packaged `dsh web --no-open` entry with the bundled Node.js executable, waits for HTTP readiness, and loads that origin only in a sandboxed BrowserWindow without a system-browser handoff. The application rejects external navigation and new windows, enforces a single instance, and writes startup diagnostics below the user data directory.

**Window controls keep the supervisor resident until an explicit tray exit.** Minimizing hides the BrowserWindow in the Windows system tray. A title-bar close opens a native confirmation; confirmation hides the window in the tray and cancellation keeps it open. The tray reopens the existing window and owns the only user-initiated exit command. Application shutdown destroys the tray and window, terminates the Harness process tree, and then quits Electron.

**The installed product identity is Oasisfish.** electron-builder applies the Oasisfish name and bitmap to the executable, NSIS installer, shortcuts, Web install manifest, document title, and default sidebar brand. The application keeps `ai.deepseek.harness.desktop` as its Windows identity and explicitly pins Electron `userData` to `%APPDATA%\DeepSeek Harness`, so a branded upgrade reuses existing browser state and Harness data instead of opening an empty profile.

**The distribution carries a verified private coding runtime.** [`apps/desktop/runtime-manifest.json`](../../../../apps/desktop/runtime-manifest.json) pins upstream URLs and SHA-256 checksums for Node.js, pnpm, Python, pip, Git for Windows, PowerShell, ripgrep, fd, jq, and 7-Zip. Git for Windows also supplies Git Bash, curl, and OpenSSH. Runtime preparation validates the archive hash, extraction result, required files, and executable versions. Python entry-point launchers use distlib's `<launcher_dir>` form so pip resolves the adjacent packaged interpreter after relocation.

**Bundled tools are visible only to the Harness process tree.** The supervisor prepends installed tool directories to the child `PATH`, sets the private Python and Harness data locations, and leaves the user's global environment unchanged. Product resources are immutable installation files; settings, credentials, profiles, sessions, caches, and logs remain under Electron's per-user data root.

**The product carries Oasis Wiki as its default domain Skill.** [`apps/desktop/bundled-skills/oasis-wiki`](../../../../apps/desktop/bundled-skills/oasis-wiki) is a versioned snapshot from the Oasis Companion release recorded by [`oasis-wiki.provenance.json`](../../../../apps/desktop/bundled-skills/oasis-wiki.provenance.json). electron-builder copies that root into immutable installed resources, and the supervisor exposes it only to Harness through `DSH_BUNDLED_SKILL_DIR`. The filesystem Skill provider ranks project and user roots ahead of bundled resources, so a deliberate local update overrides the packaged fallback without a first-launch copy or an install-directory mutation. The snapshot path suppresses Git whitespace diagnostics so imported release blobs remain unchanged; release review compares every staged blob with the pinned source commit.

**The Harness deployment has an explicit workspace dependency closure.** `apps/desktop-runtime/package.json` is the dependency-only deploy root. The repository closure verifier follows application workspace dependencies and requires every workspace peer at that root. pnpm deploys a hoisted production tree, staging materializes package links into independent files, and electron-builder's `afterPack` hook copies and inventories the complete Harness directory because its ordinary `extraResources` traversal filters `node_modules`.

**Release verification operates on assembled and packaged applications.** The assembled snapshot boots the shipped plugin tree, requires the standard agent catalog to advertise `oasis-wiki`, and loads its body through the real `skill` tool. The packaged inventory requires the Skill entry, version, and provenance record beside the product entry points and tool executables. `smoke:unpacked` rejects reparse points, executes every bundled tool, starts the packaged application, requires HTTP readiness without a default-browser handoff, verifies that a window-close request leaves Electron and Harness running, then sends the private parent-process command that invokes the tray exit path and requires both processes to exit. Window lifecycle tests pin confirmation, cancellation, tray reopen, tray exit dispatch, and strict parent-command validation. Model and remote API requests remain online operations and require user-provided credentials.

## Alternatives considered

**Install missing tools on first launch.** Rejected because it makes a clean-machine start depend on package managers, elevation, external mirrors, and mutable global state; it also prevents a deterministic offline local runtime.

**Wrap only the hosted or locally installed Web UI.** Rejected because a window without the Harness runtime cannot execute coding tasks on a clean machine and does not satisfy the self-contained product requirement.

**Package the development workspace or pnpm links as-is.** Rejected because junctions and workspace-relative peer resolution depend on the build checkout. The released tree must contain independent package files and an explicitly closed production dependency graph.

**Add bundled tools to the user's global `PATH`.** Rejected because the application owns these exact versions and must not replace or shadow the user's development environment outside the Harness process tree.

**Download or copy Oasis Wiki into user data on first launch.** Rejected because startup would either depend on the network or create a mutable duplicate whose version and ownership diverge from the installed product. An immutable fallback plus higher-priority project and user roots preserves offline startup and explicit local updates.

**Rename the user data directory with the visible product.** Rejected because Electron derives its default directory from the product name. Moving it to `%APPDATA%\Oasisfish` would make existing settings and sessions appear lost during the branding upgrade.

**Let the title-bar close terminate the application.** Rejected because an accidental window close would also terminate active Harness work and background tasks instead of keeping the desktop supervisor available.

**Hide a title-bar close without confirmation.** Rejected because silently leaving the application resident would make the difference between closing a window and exiting the process easy to miss.

## Consequences

The Oasisfish NSIS installer and unpacked directory can start the Harness UI, execute the bundled local coding tools, and load Oasis Wiki on Windows x64 without preinstalled developer runtimes or a separate Skill installation. The package is substantially larger and the release process owns runtime updates plus the pinned Skill snapshot, provenance, product bitmap, and tray lifecycle. The loopback server remains a local child process rather than Electron renderer code, preserving the existing plugin assembly and Web behavior. Closing or minimizing the main window keeps Harness work alive until the user selects the tray exit command or the operating system shuts down the application. The retained data-directory name is intentionally different from the visible product name. Clean virtual-machine installation remains a release acceptance activity beyond the packaged-directory smoke test.
