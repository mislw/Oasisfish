# DeepSeek Harness Desktop

English | [中文](README.zh.md)

This reference describes the self-contained Windows 10/11 x64 distribution. The installed application carries the Harness Web UI and its local coding runtimes; model and remote API requests still require network access and user-provided credentials.

## Runtime behavior

Electron starts the bundled `dsh web` entry on an operating-system-assigned `127.0.0.1` port, waits for HTTP readiness, and then opens that origin in a sandboxed BrowserWindow. External navigation and new windows are denied. Closing the application terminates the complete Harness process tree.

Only the Harness child process receives the bundled tool directories at the front of `PATH`. The desktop application does not modify the user's global environment. Immutable application files remain under the installation directory; profiles, settings, credentials, sessions, caches, and logs remain under Electron's per-user data directory.

## Bundled tools

| Tool | Version |
|---|---:|
| Node.js | 24.19.0 |
| pnpm | 11.7.0 |
| Python | 3.14.7 |
| pip | 26.2.1 |
| Git for Windows / Git Bash | 2.55.0.windows.5 / 5.3.15 |
| PowerShell | 7.6.5 |
| OpenSSH | 10.5p1 |
| ripgrep | 15.2.0 |
| fd | 10.4.2 |
| jq | 1.8.2 |
| curl | 8.21.0 |
| 7-Zip | 26.02 |

[`runtime-manifest.json`](runtime-manifest.json) pins the upstream URLs, versions, SHA-256 checksums, extraction rules, and required files. Packaging verifies every download before staging it.

## Build

From an installed repository checkout:

```sh
pnpm --filter @deepseek-ai/dsh-desktop run package:dir
pnpm --filter @deepseek-ai/dsh-desktop run package
```

`package:dir` writes the unpacked application to `apps/desktop/release/win-unpacked/`. `package` writes the NSIS installer to `apps/desktop/release/`. Building downloads the pinned upstream runtime archives when they are absent from the local cache; the installed application needs no network access to start the UI or execute the bundled local tools.

## Verification

```sh
pnpm --filter @deepseek-ai/dsh-desktop run stage:verify
pnpm --filter @deepseek-ai/dsh-desktop run smoke:unpacked
```

The staging check requires the Harness entry, Web frontend, runtime manifest, and every executable needed by the product. The unpacked smoke test rejects reparse points, executes every bundled tool, starts the packaged application, requires an HTTP 200 response, confirms the Harness remains alive after readiness, closes Electron, and requires both processes to exit.

## User data and logs

The default data root is `%APPDATA%\DeepSeek Harness`. `desktop-ready.json` records the active loopback URL and Harness PID for diagnostics. Startup and Harness output are written to `logs\desktop.log`; the previous file is retained as `desktop.log.previous` after rotation.

## Licenses and limits

The packaged resources include the repository [license](../../LICENSE), [JavaScript dependency notices](../../THIRD_PARTY_NOTICES.md), and [bundled runtime notices](RUNTIME_NOTICES.md). Only Windows x64 is supported. The installer does not configure model credentials, and offline installations cannot complete model or remote API requests.
