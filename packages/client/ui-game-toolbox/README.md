# @deepseek-ai/dsh-client-ui-game-toolbox

English | [中文](README.zh.md)

Browser surfaces for the game-development toolbox. The sidebar offers a complete Oasis UI workflow and a focused image-generation workflow. Each tool creates or resumes its own Agent Preset session, opens its details panel, and renders the durable `todos` projection in both the conversation header and details summary.

The `game-ui` preset owns the eight-stage UI production process. The `game-image` preset owns the four stages `需求`, `规格`, `生成`, and `确认`; it loads `oasis-wiki` and the bundled `ai-image-prompts` Skill, searches the matching local visual recipe, lets the current conversation model refine a complete English prompt, and then calls the one configured default image model without filesystem, shell, UMG, Lua, or editor tools. Prompt refinement stays in the same model turn and does not create a hidden model request.

Toolbox entries use translucent theme-token surfaces so the sidebar's persistent Oasisfish scene remains visible without reducing label contrast.

## Model Experience

### Dedicated session bootstrap prompt

#### What the model sees

A blank `game-ui` session receives the following user message once. The preset separately owns its system instructions and tool schemas.

##### Initial user message

```markdown
启动 UI 生成工具链。首先加载 oasis-wiki Skill，然后用 todo_write 建立并维护这 8 个阶段：来源、视觉、分层、工作台、UMG 需求、UMG 构建、逻辑绑定、最终验收。需要生图时加载 ai-image-prompts Skill，让当前默认对话 GPT 先细化完整英文 prompt 再调用 image_generate。一次只执行一个阶段，每个阶段完成后必须使用 ask_user_question 等待我确认，未经确认不得进入下一阶段。
```

##### game-image initial user message

```markdown
启动纯生图工作流。首先加载 oasis-wiki 和 ai-image-prompts Skill，然后用 todo_write 建立并维护这 4 个阶段：需求、规格、生成、确认。使用 skill_search 检索对应视觉配方，让当前默认对话 GPT 把我的描述优化为完整、细节充分的英文 prompt，再使用设置页配置的默认生图模型调用 image_generate；不要直接转发简短描述，不要进入 UI Tree、分层、Workbench、UMG、Lua 或编辑器写入流程。
```

#### Token effect

The selected tool's initial user message adds a fixed prompt to the first request of a blank dedicated session. UI rendering and resume actions add zero model tokens.

#### KV Cache effect

Append-only for the first request: the message follows the preset-owned reusable system and tool prefix. Returning to an existing dedicated session does not add or replace request tokens.

## Known Limitations and Deferred Work

- Lua, DataTable, and log workflows are visible placeholders only.
- The first version uses the todo projection as stage state; it does not expose a general toolchain-definition editor.
