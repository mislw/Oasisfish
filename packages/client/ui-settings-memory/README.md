# @deepseek-ai/dsh-client-ui-settings-memory

English | [中文](README.zh.md)

Web Settings section for inspecting and maintaining durable user and current-project memory. It reads the active Session `cwd`, calls the typed `memory` Host Remote, groups effective records by scope, and supports enablement, add, inline edit, and remove operations. Failed mutations retain the current draft and the last successful snapshot.

Disabling memory preserves stored records and keeps this page and `memory_manage` available; it stops `@deepseek-ai/dsh-tool-memory` from adding record snapshots to future model requests. Project controls remain unavailable until the selected Session has a `cwd`.

## Model Experience

None, as the section renders a browser management UI; it registers no model-facing prompt, schema, tool, or message.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Active-Session project selection** — the page manages only the project scope derived from the currently selected Session; it does not browse records for arbitrary filesystem paths.
- **No cross-window push updates** — another window's memory mutation appears after the page reloads or the selected Session changes; a dedicated memory revision event is deferred.
