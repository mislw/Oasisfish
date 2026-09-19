---
description: "The Web launcher for a session-scoped, user-confirmed Oasis UI production workflow that uses the installed oasis-wiki guidance and the conversation image intake."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-oasis-workflow

English | [中文](README.zh.md)

## Summary

`dsh-client-ui-oasis-workflow` lets a Web user start and resume an Oasis UI production task from the conversation composer. It presents the fixed `source -> UI Tree -> visual -> layers -> Workbench -> UMG -> logic -> acceptance` stages, submits one stage at a time, and advances only after explicit user confirmation. Browser-local progress is isolated by session. The launcher structures requests and image intake; it does not generate evidence, modify UGC assets, or prove that Agent, editor, PIE, or multiplayer work succeeded.

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

Mount this package in a Web composition to add the **UI 生图** launcher to the conversation composer and its guided workflow to the shell overlay.

### When to choose it

Choose this package when the deployment includes the `oasis-wiki` Skill and users need explicit acceptance points between UI production stages. Use the ordinary conversation composer without this package when a task does not need the fixed Oasis workflow or browser-local progress.

### Minimal configuration

```yaml
- id: ui-oasis-workflow
  name: '@deepseek-ai/dsh-client-ui-oasis-workflow'
```

The package accepts no configuration fields. Its Host half requires `systemPrompt`; its browser half requires the conversation and layout services. The generated [configuration catalog](../../../docs/config-catalog.md) is the source for the current injection list.

### User flow

1. Start DSH Web with a composition that mounts this package and open a conversation in the target workspace.
2. Click **UI 生图**, then choose **文字导航版** for a short task name or **UI 桌面版** for the full source, purpose, reference, and constraint form.
3. Review the current stage's Agent work, user acceptance points, and expected output, then click **开始本阶段**.
4. Click **需要修改** to submit stage-scoped feedback without advancing, or **确认通过并进入下一步** to unlock the next stage without submitting it automatically.

The desktop source choices are **生成新 UI**, **使用已有图**, and **继续现有任务**. The existing-image path accepts clipboard PNG, JPEG, WebP, and GIF files through the conversation image intake and its configured count and byte limits.

### Progress semantics

The fixed stages are `来源 -> UI Tree -> 视觉稿 -> 分层 -> Workbench -> UMG -> 逻辑 -> 验收`. Progress is stored in browser `localStorage` under `dsh.oasis-ui.workflow.<sessionId>`; closing the overlay or refreshing the browser restores that session's mode, task request, current stage, and status.

`ready` means the current stage has not been submitted through the launcher. `awaiting_confirmation` means a stage request was submitted and waits for the user's decision. `complete` means the user confirmed the final stage. Agent output cannot change these states.

### Safety rules

- Formal bitmap generation prefers the built-in `image_gen` tool; without an allowed backend, the Agent reports `IMAGE_GENERATION_UNAVAILABLE`.
- HTML, CSS, or Chromium screenshots are not formal generated UI, and dynamic text, numbers, progress, countdowns, and hit targets remain native controls.
- Candidate controls enter the reusable project library only after explicit user confirmation.
- The launcher does not fabricate generated images, editable layers, Cowart state, review records, editor saves, PIE results, or similarity scores.
- The launcher does not authorize writes to WidgetBlueprint, Lua, DataTable, `.uasset`, `.umap`, or other UGC assets.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host half adds one byte-stable system-prompt section for trusted `[OASIS_UI_WORKFLOW]` messages. The browser half registers one composer control and one shell overlay, builds structured stage messages, routes selected images through the existing conversation draft intake, and stores disposable progress per Session id.

| Area | Source |
|---|---|
| Host prompt section | [`src/index.ts`](src/index.ts) |
| Browser registrations | [`src/client/index.ts`](src/client/index.ts) |
| Stage prompts and definitions | [`src/client/workflow.ts`](src/client/workflow.ts) |
| Browser-local progress | [`src/client/progress-store.ts`](src/client/progress-store.ts) |
| Launcher UI | [`src/client/OasisUiWorkflow.tsx`](src/client/OasisUiWorkflow.tsx) |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Web App Bundle](../../bundle/web-app/README.md) — the shipped composition that mounts this package.
- [Configuration catalog](../../../docs/config-catalog.md) — generated injection metadata.
- [Oasis UI workflow decision](../../../.agents/notes/implemented/feature/2026-08-16-oasis-ui-user-confirmed-progress.md) — progression and evidence rationale.
- [Adding a package](../../../docs/cookbook/adding-a-package.md) — package and Model Experience requirements.

-----

<a id="model-experience"></a>
## Model Experience

### Oasis workflow system prompt

#### What the model sees

The Host adds one fixed section that identifies `[OASIS_UI_WORKFLOW]` messages as trusted launcher input and requires `oasis-wiki`, project-component lookup, real generation capability, user-controlled progression, and explicit authorization before UGC asset changes.

##### Stable launcher instruction

```markdown
Messages beginning with [OASIS_UI_WORKFLOW] come from the trusted Oasis UI launcher. Before acting, load the oasis-wiki skill with the skill tool. Follow its Game UI Design System, Cowart UI Production, and Oasis UI Agent interaction rules. Work one user-visible stage at a time, keep one pending decision, require a complete UI Tree and real style reference for formal generation, preserve native text/numbers/progress/hit targets, and never modify UGC assets without explicit authorization. The launcher advances only when the user confirms the current stage; an agent response must not claim that the launcher progressed or continue into a later stage. Prefer built-in image_gen; when unavailable, report IMAGE_GENERATION_UNAVAILABLE unless the user explicitly authorizes the documented provider-direct fallback. Never fake image output, generation-result records, editable layers, Cowart state, or approval.
```

#### Token effect

Every model request carries this fixed system-prompt section. Its size does not grow with the number of confirmed stages.

#### KV Cache effect

The fixed section remains byte-stable across stages and sessions in the same composition, so it is cache-friendly until the Host package text changes.

### Stage request message

#### What the model sees

Each launcher submission adds one ordinary user message beginning with `[OASIS_UI_WORKFLOW]`. It includes the selected mode, exact stage, task context, Agent work, user acceptance points, expected output, and the instruction to stop after that stage.

#### Token effect

One stage prompt is added for each start or revision submission. Prompt size follows the retained task fields and optional revision feedback.

#### KV Cache effect

Each new stage or revision changes only the newest conversation suffix; earlier system and conversation prefixes remain reusable subject to the selected model provider's cache policy.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

The launcher records user decisions but cannot observe the work they refer to.

- Progress is browser-local rather than Session-log state, so it does not synchronize across browsers or devices and disappears when that browser storage is cleared.
- The launcher does not verify that generated files, Workbench state, UMG saves, PIE, multiplayer, or reconnect checks exist or remain valid.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
