# Agent Note: Game UI toolbox sessions

Status: implemented

English | [中文](2026-08-28-game-ui-toolbox-session.zh.md)

## Problem

The general conversation surface exposes every available workflow at once. Oasis UI production has an ordered review process, while focused image generation should stop after the requested image is generated and confirmed. Both require the `oasis-wiki` Skill and durable progress. A transient frontend wizard would lose that state on restart and could diverge from the model-visible session history.

## Decision

The sidebar exposes a Sessions/Toolbox switch and a generic `sidebar.toolbox` slot. The Oasis UI tool creates or resumes a dedicated `game-ui` Agent Preset session. That preset owns the allowed tools, requires `oasis-wiki`, establishes the fixed eight-stage workflow through `todo_write`, and requires `ask_user_question` confirmation before advancing.

The Pure Image tool creates or resumes a separate `game-image` Agent Preset session. It establishes four fixed stages: requirements, specification, generation, and confirmation. Its tool inventory is limited to Skill loading, todo progress, focused questions, and `image_generate`. It uses the default image model configured in Models settings and does not include filesystem, shell, UI reconstruction, UMG, Lua, or editor-write tools.

The client treats the durable `todos` projection as the first version's stage record. Each preset supplies its ordered stage list, and the client renders the matching projection in `conversation.session.header.progress` and `conversation.details.summary`; the header opens the existing details column. Starting a blank dedicated session sends that tool's bootstrap prompt, while resuming one sends nothing. Lua, DataTable, and log tools remain disabled until each has an assembled workflow and acceptance evidence.

## Consequences

The workflows remain reconstructable from the session log and survive application restarts without a second frontend persistence model. Each dedicated preset limits the model's tool inventory and keeps unrelated requests out of its session. Image generation can therefore reuse the default image provider without inheriting the full UI production workflow. The generic sidebar and conversation slots can host later toolchains without teaching those shell packages Oasis-specific behavior.

Using `todos` couples the visible stages to each preset's fixed ordering. A future editable or branching toolchain requires a dedicated durable event and projection instead of overloading todo text.

## Alternatives considered

- **A frontend-only wizard**: rejected because its progress would not be model-visible or reconstructable from the session log.
- **A mode flag inside ordinary sessions**: rejected because the general tool inventory and unrelated history would remain active.
- **A general toolchain-definition service in the first version**: deferred until a second real workflow establishes shared editing and branching requirements.
