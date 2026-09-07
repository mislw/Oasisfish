# @deepseek-ai/dsh-client-ui-game-toolbox

English | [中文](README.zh.md)

Browser surfaces for the game-development toolbox. The sidebar offers a complete Oasis UI workflow and a focused image-generation workflow. Each tool creates or resumes its own Agent Preset session. The UI workflow also opens its details panel and renders the durable `todos` projection in both the conversation header and details summary.

The `game-ui` preset owns the eight-stage UI production process. Clicking the image-generation entry only opens a blank `game-image` session; it does not submit a user message or display task stages. After the user enters an image request, the preset silently loads `oasis-wiki` and the bundled `ai-image-prompts` Skill, searches the matching local visual recipe, refines a complete English prompt in the current model turn, and directly calls the one configured default image model. It has no filesystem, shell, UMG, Lua, or editor tools and creates no hidden model request.

Toolbox entries use translucent theme-token surfaces so the sidebar's persistent Oasisfish scene remains visible without reducing label contrast.

## Model Experience

### Dedicated session bootstrap prompt

#### What the model sees

A blank `game-ui` session receives the following user message once. The preset separately owns its system instructions and tool schemas.

##### Initial user message

```markdown
启动 UI 生成工具链。首先加载 oasis-wiki Skill，然后用 todo_write 建立并维护这 8 个阶段：来源、视觉、分层、工作台、UMG 需求、UMG 构建、逻辑绑定、最终验收。需要生图时加载 ai-image-prompts Skill，让当前默认对话 GPT 先细化完整英文 prompt 再调用 image_generate。一次只执行一个阶段，每个阶段完成后必须使用 ask_user_question 等待我确认，未经确认不得进入下一阶段。
```

#### Token effect

The UI tool's initial user message adds a fixed prompt to the first request of a blank `game-ui` session. Opening or resuming a `game-image` session adds zero model tokens; the user's first image request becomes its first request.

#### KV Cache effect

The first `game-ui` request remains append-only: its bootstrap message follows the preset-owned reusable system and tool prefix. `game-image` adds no bootstrap message. Returning to an existing dedicated session does not add or replace request tokens.

## Known Limitations and Deferred Work

- Lua, DataTable, and log workflows are visible placeholders only.
- The first version uses the todo projection as stage state; it does not expose a general toolchain-definition editor.
