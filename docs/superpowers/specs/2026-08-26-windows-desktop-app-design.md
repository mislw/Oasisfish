# Windows Desktop App Design

English | [中文](2026-08-26-windows-desktop-app-design.zh.md)

## Goal

Ship a Windows 10/11 x64 installer that runs DeepSeek Harness on a clean machine without preinstalled developer tools. Model requests remain online, while installation and local coding tools work offline.

## Product boundary

The desktop app bundles the existing `dsh web` product instead of adding a second agent runtime or UI. Electron owns the native window and child-process lifecycle. A separately bundled Node process owns Harness so Electron's Node ABI cannot affect Harness native dependencies.

The first release includes Node.js, pnpm, Python with pip, PortableGit with Git Bash, PowerShell, ripgrep, fd, jq, curl, 7-Zip, SSH, and the built Harness production dependency closure. It supports Windows 10/11 x64 only. It does not include compiled-language SDKs such as Visual Studio Build Tools, Rust, Go, Java, or .NET.

## Runtime layout

`electron-builder` installs immutable application resources below its installation directory:

```text
resources/
  harness/             deployed @deepseek-ai/dsh production package
  runtime/
    node/
    node-global/       pnpm command and package
    python/            Python, pip, and site-packages
    git/               PortableGit, Git Bash, curl, and OpenSSH
    powershell/
    tools/             rg, fd, jq, and 7za
    manifest.json      pinned versions, sources, and SHA-256 values
```

Mutable settings, session data, logs, and temporary files remain under Electron's per-user application-data directory. The installer never modifies the machine or user `PATH`.

## Process lifecycle

The Electron main process reserves a loopback port, constructs a child-only environment, and spawns the bundled Node executable with the deployed `dsh` entry point and `web --host 127.0.0.1 --port <port>`. It writes stdout and stderr to a rotating desktop log, polls the loopback URL until ready, and only then loads the BrowserWindow.

Startup has a finite timeout. Early child exit, timeout, or navigation failure displays a native error dialog containing the log path and exits cleanly. App shutdown terminates the Harness process tree. A second launch focuses the existing window through Electron's single-instance lock.

## Environment

The child environment prepends only verified bundled directories to `PATH`. It sets `DSH_HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `PYTHONHOME`, `PYTHONUTF8=1`, `PIP_DISABLE_PIP_VERSION_CHECK=1`, `GIT_CONFIG_NOSYSTEM=1`, and tool-specific home variables below the app data directory. User-provided model credentials remain available through the inherited environment and Harness settings.

All runtime archives are downloaded during the release build from pinned HTTPS sources. The preparation command validates SHA-256 before extracting and fails if an archive, executable, or expected version is missing. Installation performs no network access.

## Security

The BrowserWindow enables context isolation, disables Node integration and the remote module, denies unexpected window creation, and allows navigation only to the selected loopback authority. Harness continues to enforce its loopback host checks. The app does not expose the local server on LAN interfaces.

## Packaging and updates

The Windows release produces an x64 NSIS installer and an unpacked directory for smoke testing. Runtime downloads and generated staging directories are excluded from Git. Manual in-app updates use the public GitHub Release flow described in [Oasisfish GitHub Release Updates Design](2026-09-06-oasisfish-github-release-updates-design.md). Unsigned installers may trigger Windows reputation warnings.

## Verification

Unit tests cover deterministic runtime paths, environment construction, port selection, startup readiness, timeout, early exit, and process cleanup. Packaging tests validate the manifest and staged resource inventory without downloading. Release verification builds Harness, prepares the runtime, builds the installer, launches the unpacked app, confirms the Web UI returns HTTP 200, and runs bundled `node`, `pnpm`, `python`, `pip`, `git`, `bash`, `pwsh`, `rg`, `fd`, `jq`, `curl`, `7za`, and `ssh` version commands.

## Alternatives considered

**Tauri with a Node sidecar.** The native shell is smaller, but the offline product would still carry the same toolchain and would also need a pinned WebView2 distribution. Electron gives the clean-machine installer one rendering runtime.

**System browser launcher.** This avoids shipping Chromium but does not provide a self-contained desktop application or controlled browser lifecycle.

**Run Harness inside Electron's main process.** This reduces one process but couples Harness native modules to Electron's ABI and mixes UI supervision with the agent runtime.
