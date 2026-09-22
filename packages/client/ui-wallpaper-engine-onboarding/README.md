---
description: "Localized Desktop onboarding that opens Wallpaper Engine settings when the upstream integration has no saved configuration."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-wallpaper-engine-onboarding

English | [中文](README.zh.md)

## Summary

This package prompts a Desktop user to configure Wallpaper Engine when the integration reports no saved settings. It opens the existing Wallpaper Engine settings section through one primary action. Configured desktops pass through without UI. An unavailable settings route logs a bounded diagnostic and releases the current onboarding traversal so later steps remain reachable; a later application process probes again.

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

The Desktop Wallpaper Engine bundle mounts this package beside the upstream plugin; direct compositions can add the same Client row:

```yaml
- id: ui-wallpaper-engine-onboarding
  name: '@deepseek-ai/dsh-client-ui-wallpaper-engine-onboarding'
```

The plugin has no configuration fields. It waits for the `settings.onboarding` slot, reads `GET /wallpaper-engine/settings`, and shows the prompt only when the response contains the own property `settings: null`. Any non-array settings object, including an empty object, counts as configured.

Select **Open Wallpaper Engine settings** to complete the current onboarding step and then open the `wallpaper-engine` settings section. Loading displays no blocking surface. A failed probe also completes this process-local step after one warning; because the package stores no acknowledgement, the next application process probes the upstream route again.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The browser plugin registers typed English and Chinese dictionaries and contributes one root-scoped onboarding row at order `100`. Each locale change replaces that row with a fresh detached copy snapshot. The mounted component starts one abortable request, renders nothing while it waits, and guards warning and completion so each happens at most once. The visible modal owns `#root` inert state, focuses its title, refuses implicit dismissal, and calls completion before settings navigation.

### Source map

| File | Role |
|---|---|
| [`src/client/probe.ts`](src/client/probe.ts) | Response validation and bounded readiness diagnostics |
| [`src/client/WallpaperOnboarding.tsx`](src/client/WallpaperOnboarding.tsx) | Request lifetime, completion, modal, and primary action |
| [`src/client/index.ts`](src/client/index.ts) | Locale ownership and onboarding registration |
| [`src/client/locales.ts`](src/client/locales.ts) | Typed English and Chinese interface copy |
| — | No runtime invariant companion is published because the package owns no cross-plugin mutable relation. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Settings UI](../ui-settings/README.md) — the onboarding coordinator and settings section contracts.
- [Client package map](../README.md) — adjacent browser UI packages.
- [Desktop application](../../../apps/desktop/README.md) — the application composition that carries the integration.

-----

<a id="model-experience"></a>
## Model Experience

### Browser onboarding

#### What the model sees

Nothing from `settings.onboarding`; the settings response, warning diagnostic, and localized prompt remain browser-only.

#### Token effect

None; the package registers no prompt section, tool schema, or Session event.

#### KV Cache effect

None; the package does not change model requests or their cache keys.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits keep setup ownership with the upstream settings page and prevent one optional integration from blocking the rest of onboarding.

- **Desktop route required** — outside a composition that serves `/wallpaper-engine/settings` and registers the `wallpaper-engine` section, the probe warns and completes without showing a prompt.
- **No inline configuration** — the prompt only navigates; the upstream settings section owns wallpaper selection and playback controls.
- **Process-local failure release** — route and payload failures do not persist an acknowledgement, so a new application process retries the probe.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
