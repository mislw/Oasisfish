# Agent Note: Oasis UI progress advances only through session-scoped user confirmation

Status: implemented

English | [中文](2026-08-16-oasis-ui-user-confirmed-progress.zh.md)

## Problem

The Oasis UI launcher exposed the intended stages but treated them as static labels. A submitted request closed the overlay without recording which stage was active, so reopening or refreshing could not tell the user what to do next. Letting the Agent infer or report progression would make a conversational claim indistinguishable from user acceptance and could present planned or unverified work as completed.

## Decision

`ui-oasis-workflow` owns a browser-local `OasisUiProgressStore` for each session. The store persists the selected text or desktop mode, original task request, current stage, and `ready` / `awaiting_confirmation` / `complete` status under `dsh.oasis-ui.workflow.<sessionId>`. A stage moves from `ready` to `awaiting_confirmation` only when the launcher submits its stage prompt, and advances only when the user clicks the confirmation command. A revision request preserves the same stage, while confirming a stage only unlocks the next stage and never submits it automatically.

The eight stage definitions are one source for UI guidance and model-visible prompts. Each definition states the Agent's work, the user's acceptance points, and the expected output. Every prompt identifies the selected mode and exact stage, prohibits later-stage work, and tells the Agent to stop for user confirmation. The Host system prompt states that Agent output cannot advance launcher state.

The persisted state records interaction progress, not artifact truth. UI copy and prompts keep static files, generated bitmaps, Workbench state, editor saves, PIE, and multiplayer checks as separate evidence. Clipboard intake uses the current session's host-projected image limits before allocating browser previews, so the launcher does not bypass the composer's count or byte checks.

## Alternatives considered

- **Derive progress from the latest Agent response** — rejected because natural-language completion claims are not a reliable acceptance record and cannot distinguish a plan from executed verification.
- **Advance immediately after submitting each stage** — rejected because the user would lose the review point and a failed or incomplete Agent turn would unlock later work.
- **Store one global workflow state** — rejected because multiple conversations can carry independent UI tasks and must not overwrite one another.
- **Persist only the stage number** — rejected because reopening would lose the selected interaction mode and the task context required to build later-stage prompts.

## Consequences

- Closing the overlay or refreshing the browser restores the current conversation's mode, task, stage, and confirmation state; other sessions remain isolated.
- The user must explicitly confirm all eight stages. This adds one deliberate action per stage in exchange for an auditable review point and prevents automatic stage skipping.
- Clearing browser storage resets launcher progress without deleting conversation messages or project artifacts. Conversely, persisted progress cannot prove those messages or artifacts still exist and the Agent must rediscover real files when required.
- Component tests pin mode selection, locking, revision, completion, persistence, and session isolation; the assembled `oasis-ui-workflow` snapshot pins the Host instruction seen by the model.
