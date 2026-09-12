# Oasisfish Desktop

English | [中文](README.zh.md)

This reference describes the self-contained Oasisfish distribution for Windows 10/11 x64. The installed application carries the DeepSeek Harness Web UI and its local coding runtimes; model and remote API requests still require network access and user-provided credentials.

## Runtime behavior

Electron reuses a responding Harness announced by the shared desktop user-data directory; otherwise one desktop process holds an atomic startup lock, starts the bundled `dsh web --no-open` entry on an operating-system-assigned `127.0.0.1` port, and publishes readiness for other Oasisfish distributions. This prevents two installed or unpacked copies from mutating the same profile fallback concurrently. After HTTP readiness, the app opens that origin only in a sandboxed BrowserWindow without handing it to the system browser. External navigation and new windows are denied. The title-bar minimize control hides the window in the Windows system tray. The title-bar close control asks for confirmation and then hides the window in the tray; cancelling keeps the window open. The tray can reopen the window, and its **Exit Oasisfish** command is the only user-initiated action that terminates a Harness process owned by that desktop process.

Only the Harness child process receives the bundled tool directories at the front of `PATH`. The desktop application does not modify the user's global environment. Immutable application files remain under the installation directory; profiles, settings, credentials, sessions, caches, and logs remain under Electron's per-user data directory.

## Bundled Skills

The installed resources include Oasis Wiki `1.260827.1` as the default domain Skill and `ai-image-prompts` as an offline image-prompt refinement Skill. The supervisor sets `DSH_BUNDLED_SKILL_DIR` to the packaged `skills` directory, so the standard agent catalog can advertise and load both without a separate installation or network request. Project and user Skill roots have higher precedence than the bundled root, allowing an explicitly installed update to replace a packaged fallback without modifying application files. [`oasis-wiki.provenance.json`](bundled-skills/oasis-wiki.provenance.json) records the source repository, source path, version, and exact revision of the Oasis snapshot. [`ai-image-prompts.provenance.json`](bundled-skills/ai-image-prompts.provenance.json) pins the adapted YouMind source revision; its packaged MIT license remains beside the Skill.

Image requests use the primary image model selected in Settings and may use one separately configured fallback route after a non-cancellation failure. The current conversation model refines the user's wording in its existing turn, optionally searches the local visual recipes, and sends the resulting English prompt to `image_generate`; a successful image call records `已生成。` with the attachment and ends the turn without a hidden closing model request.

## Bundled local retrieval model

The application packages `Xenova/bge-small-zh-v1.5` at revision `75c43b069aac4d136ba6bc1122f995fedcfd2781` for local Oasis Skill retrieval. The supervisor sets `DSH_SKILL_SEARCH_MODEL_DIR` to the immutable model resources and `DSH_SKILL_SEARCH_CACHE_DIR` to a mutable directory below the desktop user-data cache. Source text, queries, embeddings, and the SQLite index remain local; this retrieval path does not use relay credentials or an embedding API.

[`model-manifest.json`](bundled-models/bge-small-zh-v1.5/model-manifest.json) pins the model identity, Transformers.js version, and SHA-256 digest of every required model file. Staging, unpacked smoke, and startup-path verification reject missing files, modified bytes, and reparse points before the model is used.

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

## Updates

The installed application and packaged portable directory expose **Settings > App Updates**. Opening Oasisfish or Settings does not contact GitHub. **Check for updates**, **Download update**, and **Restart and install** are separate user actions. The installer replaces the registered application files and keeps `%APPDATA%\DeepSeek Harness`, including settings, credentials, sessions, caches, browser state, and logs.

A source push is not an application update. Set `apps/desktop/package.json` to the new version, create the matching `v<version>` tag, and publish that tag through `.github/workflows/oasisfish-release.yml`. The public `mislw/Oasisfish` Release must contain the NSIS installer, its `.blockmap`, and `latest.yml`. Portable cleanup removes only unchanged files listed by the packaged inventory after the installed target version writes its receipt; unknown or modified files leave the old portable directory available for manual review.

Oasisfish release versions use `V.YYMMDD.T`: `V` is the major version, `YYMMDD` is the release date, and `T` is that date's revision. The package, application UI, installer filename, update metadata, Git tag, and GitHub Release keep the canonical value such as `1.20260912.4`; Windows executable metadata uses the equivalent four-part value `1.2026.912.4` because each numeric part is limited to 65535.

## Verification

```sh
pnpm --filter @deepseek-ai/dsh-desktop run stage:verify
pnpm --filter @deepseek-ai/dsh-desktop run smoke:unpacked
```

The staging check requires the Harness entry, Web frontend, update metadata, portable inventory and cleanup helpers, runtime manifest, every executable needed by the product, and the hash-verified local retrieval model. Packaged-resource verification additionally requires both bundled Skills, their provenance records, and the image-prompt Skill's license and visual recipes. The keyless assembled snapshot advertises both Skills in the standard agent catalog, loads them through the real `skill` tool, and searches each declared reference corpus through `skill_search`. The unpacked smoke test rejects reparse points, executes every bundled tool, starts the packaged application, requires an HTTP 200 response without a default-browser handoff, confirms the Harness remains alive after readiness and a window-close request, then uses its private parent-process channel to invoke the tray exit path and requires Electron and Harness to exit.

## User data and logs

The default data root remains `%APPDATA%\DeepSeek Harness` so an Oasisfish upgrade retains existing profiles, settings, credentials, sessions, caches, browser state, and logs. Update downloads, installation receipts, cleanup copies, and cleanup diagnostics remain below its `updates` directory. `desktop-ready.json` records the active loopback URL and Harness PID for diagnostics and reuse. `desktop-harness-startup.lock` exists only while one desktop process is starting that shared Harness; a dead owner's lock is removed before recovery. Startup and Harness output are written to `logs\desktop.log`; the previous file is retained as `desktop.log.previous` after rotation.

## Licenses and limits

The packaged resources include the repository [license](../../LICENSE), [JavaScript dependency notices](../../THIRD_PARTY_NOTICES.md), [bundled runtime notices](RUNTIME_NOTICES.md), the local retrieval model's MIT license, and the adapted image-prompt Skill's MIT license. Only Windows x64 is supported. The installer does not configure chat-model credentials; local Skill retrieval remains available offline, while chat-model and remote API requests require the corresponding network access and credentials.
