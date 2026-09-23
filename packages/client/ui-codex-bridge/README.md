---
description: "Interactive Web preview of the proposed Codex delegation connection, policy, workspace admission, and Session states."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-codex-bridge

English | [中文](README.zh.md)

## Summary

This package lets a user exercise the proposed Codex-to-Harness delegation flow inside Settings before the Host bridge exists. It simulates connection, Workspace admission, execution permission, model selection, delegated-run completion, cancellation, and Session expansion. It creates no MCP service, authentication state, Session, or Codex registration. The ordinary Web composition keeps the row disabled; the Oasisfish Desktop development profile and the explicit Web preview overlay enable it.

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

Start the Web profile with the preview overlay:

```sh
pnpm dsh web --patch apps/web/tests/codex-bridge-preview.overlay.yml
```

Open Settings and select **Codex connection**. The page identifies itself as an interactive preview. Connect to enable the policy controls, then start the demo task to inspect running, cancelled, completed, and expanded Session states. The endpoint is fixed preview copy; copying it does not contact a server at that route.

The ordinary Web profile contains the same `ui-codex-bridge` row with `disabled: true`. The Web overlay and the application-owned Oasisfish Desktop overlay only replace that row with `disabled: false`; neither adds Host services or transport configuration.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The browser plugin registers localized English and Chinese dictionaries and contributes one root-scoped `settings.section` entry. The component owns all preview state locally. Timers move connection and delegated-run states and are cancelled on disconnect or unmount; no state crosses the browser process or survives a remount. The Host loader entry is intentionally empty so Loader can address the optional browser package without claiming a Host capability.

### Source map

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Browser registration and locale ownership |
| [`src/client/CodexBridgeSection.tsx`](src/client/CodexBridgeSection.tsx) | Preview interaction and state transitions |
| [`src/client/locales.ts`](src/client/locales.ts) | Typed English and Chinese interface copy |
| [`apps/web/tests/codex-bridge-preview.overlay.yml`](../../../apps/web/tests/codex-bridge-preview.overlay.yml) | Explicit Web preview activation |
| [`apps/desktop-host/oasisfish.cordis.patch.yml`](../../../apps/desktop-host/oasisfish.cordis.patch.yml) | Oasisfish Desktop development activation |
| — | No runtime invariant companion is published because this preview owns no cross-plugin runtime state. |

The [proposed visual bridge design](../../../.agents/notes/proposed/feature/2026-09-20-visual-codex-delegation-bridge.md) owns the planned Host service, trust, Session, and Codex registration design.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Proposed visual bridge design](../../../.agents/notes/proposed/feature/2026-09-20-visual-codex-delegation-bridge.md) — planned product and protocol behavior.
- [Settings UI](../ui-settings/README.md) — the section slot this preview fills.
- [Web Client architecture](../../../docs/subsystems/web-client.md) — browser plugin loading and presentation layers.
- [Client package map](../README.md) — adjacent browser UI packages.

-----

<a id="model-experience"></a>
## Model Experience

### Interactive preview

#### What the model sees

Nothing; the `settings.section` preview sends no model request and creates no model-visible Session input.

#### Token effect

None; the package registers no prompt section, tool schema, or model-visible Session event.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits distinguish the interactive preview from the proposed production bridge.

- **No MCP Host** — the displayed endpoint is inert preview copy; no route, authentication, health check, or Codex registration exists.
- **No durable Session** — the delegated task and expanded transcript are local sample state and disappear when the section remounts.
- **No policy enforcement** — Workspace, permission, model, and automatic-delegation controls affect only the preview display.
- **Desktop-width Settings shell** — the shared Settings navigation remains two-column on phone-width viewports, so this preview is intended for the Desktop and ordinary Web layouts shown above.
- **Preview activation only** — the ordinary Web row remains disabled; the Web preview overlay or Oasisfish Desktop development overlay enables it.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
