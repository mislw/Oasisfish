# Agent Note: Game UI toolbox sessions

Status: implemented

English | [中文](2026-08-28-game-ui-toolbox-session.zh.md)

## Problem

The general conversation surface exposes every available workflow at once. Oasis UI production has an ordered review process, while focused image generation should directly refine and render the requested image without exposing production stages. A transient frontend wizard would lose UI workflow state on restart and could diverge from the model-visible session history.

## Decision

The sidebar exposes a Sessions/Toolbox switch and a generic `sidebar.toolbox` slot. The Oasis UI tool creates or resumes a dedicated `game-ui` Agent Preset session. That preset owns the allowed tools, requires `oasis-wiki`, establishes the fixed eight-stage workflow through `todo_write`, and requires `ask_user_question` confirmation before advancing.

The Pure Image tool creates or resumes a separate `game-image` Agent Preset session. It has no bootstrap message or visible stages. Its tool inventory is limited to `ai-image-prompts` Skill loading and search, durable memory, focused questions, and `image_generate`. The current conversation model silently refines the user's request, applies enabled visual preferences without overriding explicit requirements, and supplies four differentiated candidate directions. The configured default image model renders those candidates. The preset does not include filesystem, shell, UI reconstruction, UMG, Lua, or editor-write tools.

The client treats the durable `todos` projection as the UI workflow's stage record. The `game-ui` preset supplies its ordered stage list, and the client renders the matching projection in `conversation.session.header.progress` and `conversation.details.summary`; the header opens the existing details column. Starting a blank `game-ui` session sends its bootstrap prompt, while opening or resuming `game-image` sends nothing. Lua, DataTable, and log tools remain disabled until each has an assembled workflow and acceptance evidence.

## Consequences

The workflows remain reconstructable from the session log and survive application restarts without a second frontend persistence model. Each dedicated preset limits the model's tool inventory and keeps unrelated requests out of its session. Image generation can therefore reuse the default image provider without inheriting the full UI production workflow. The generic sidebar and conversation slots can host later toolchains without teaching those shell packages Oasis-specific behavior.

Using `todos` couples the visible UI workflow stages to its preset's fixed ordering. A future editable or branching toolchain requires a dedicated durable event and projection instead of overloading todo text. Pure image personalization changes only later model requests when memory injection is enabled; preview and download do not record preferences.

## Alternatives considered

- **A frontend-only wizard**: rejected because its progress would not be model-visible or reconstructable from the session log.
- **A mode flag inside ordinary sessions**: rejected because the general tool inventory and unrelated history would remain active.
- **A general toolchain-definition service in the first version**: deferred until a second real workflow establishes shared editing and branching requirements.
