---
description: "Web Settings controls for inspecting and maintaining durable user and current-project memory through the typed memory Remote."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-memory

English | [中文](README.zh.md)

## Summary

Use this package to inspect and maintain durable memory from Web Settings. The page groups user and current-project records, supports enablement, add, inline edit, and idempotent remove operations, and retains drafts when a mutation fails. Project controls follow the Session retained by the main view and remain unavailable until that Session has a `cwd`. Disabling memory preserves records and management controls while stopping future model-request snapshots.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this package in the Web Loader roster beside the Settings shell, renderer, locale service, generated Remote aggregate, and Host memory service. The shipped Web bundle supplies that composition and the local memory Provider.

### When to choose it

Choose this page when users need explicit control over durable memory without calling model tools. Avoid it for arbitrary-path browsing or live cross-window synchronization; the page intentionally follows one selected Session and reloads through the typed Host Remote.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-client-ui-settings-memory'
```

This package has no configuration fields. Its Client half requires the `settings.section` slot, locale and renderer services, Session snapshots, and the generated `remote.memory` namespace.

### User-visible behavior

The page loads the effective records for the main-view Session `cwd`, separates user and project scope, and disables project scope when no current directory exists. Failed reads offer retry; failed adds or edits keep the current draft and the last successful snapshot. The remove path is idempotent, so deleting an already absent record still succeeds.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host entry is intentionally side-effect free because the memory Service owns Remote methods. The Client entry registers localized copy and one `settings.section` slot, while `MemorySettingsStore` serializes Remote operations, keeps the last successful record set during failures, and ignores mutation settlements after a newer project load starts. The component reads the renderer-owned Session snapshot and selects the row retained by the main view instead of maintaining another Session subscription.

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Locale, store, and Settings-slot registration |
| [`src/client/store.ts`](src/client/store.ts) | Typed Remote controller and operation state |
| [`src/client/MemorySection.tsx`](src/client/MemorySection.tsx) | Scope selection, records, drafts, and commands |
| [`tests/remote.client.spec.ts`](tests/remote.client.spec.ts) | Real Web composition and generated Remote behavior |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-settings](../ui-settings/README.md) — the Settings slot and section ownership model.
- [ui-settings-general](../ui-settings-general/README.md) — the shell that renders feature-owned sections.
- [memory service](../../memory/memory/README.md) — the typed Host operations exposed through Remote.
- [tool-memory](../../memory/tool-memory/README.md) — the model-facing tool and logged context consumer.
- [Slots reference](../../../docs/subsystems/slots.md) — renderer-owned hooks, stores, and injected values.

-----

<a id="model-experience"></a>
## Model Experience

None, as the section renders browser memory controls and registers no model-facing prompt, schema, tool, or message.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define what the page can select and when it refreshes.

- **Active-Session project selection** — the page manages only the project scope derived from the Session retained by the main view; it does not browse records for arbitrary filesystem paths.
- **No cross-window push updates** — another window's memory mutation appears after the page reloads or the selected Session changes; the memory service publishes no revision event for this page.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No runtime invariant companion is published; the page reads one generated Remote namespace and one renderer-owned Session snapshot without maintaining an independent runtime projection.
