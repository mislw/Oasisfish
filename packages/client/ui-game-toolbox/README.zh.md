# @deepseek-ai/dsh-client-ui-game-toolbox

[English](README.md) | 中文

游戏开发工具箱的浏览器界面。侧栏同时提供完整 Oasis UI 工作流和专注生图工作流。每个工具都会创建或恢复自己的 Agent Preset 会话、打开详情面板，并在会话页头和详情摘要中显示持久化的 `todos` 投影。

`game-ui` preset 持有八阶段 UI 生产流程。`game-image` preset 持有“需求、规格、生成、确认”四阶段；它会加载 `oasis-wiki` 与内置 `ai-image-prompts` Skill，检索匹配的本地视觉配方，让当前对话模型优化出完整英文 prompt，再调用唯一配置的默认生图模型，但不包含文件系统、Shell、UMG、Lua 或编辑器工具。提示词优化发生在同一个模型轮次内，不会产生隐藏的模型请求。

工具入口使用基于主题 token 的半透明表面，使侧栏持续显示 Oasisfish 场景，同时保持标签对比度。

## 模型体验

### 专用会话启动提示词

#### 模型看到的内容

空白 `game-ui` 会话只会收到一次以下用户消息。系统指令与工具 schema 由 preset 单独持有。

##### 初始用户消息

```markdown
启动 UI 生成工具链。首先加载 oasis-wiki Skill，然后用 todo_write 建立并维护这 8 个阶段：来源、视觉、分层、工作台、UMG 需求、UMG 构建、逻辑绑定、最终验收。需要生图时加载 ai-image-prompts Skill，让当前默认对话 GPT 先细化完整英文 prompt 再调用 image_generate。一次只执行一个阶段，每个阶段完成后必须使用 ask_user_question 等待我确认，未经确认不得进入下一阶段。
```

##### game-image 初始用户消息

```markdown
启动纯生图工作流。首先加载 oasis-wiki 和 ai-image-prompts Skill，然后用 todo_write 建立并维护这 4 个阶段：需求、规格、生成、确认。使用 skill_search 检索对应视觉配方，让当前默认对话 GPT 把我的描述优化为完整、细节充分的英文 prompt，再使用设置页配置的默认生图模型调用 image_generate；不要直接转发简短描述，不要进入 UI Tree、分层、Workbench、UMG、Lua 或编辑器写入流程。
```

#### Token 影响

所选工具的初始用户消息会向空白专用会话的第一次请求加入固定提示词。界面渲染和恢复操作不增加模型 token。

#### KV Cache 影响

第一次请求保持追加式：该消息位于 preset 所有的可复用系统与工具前缀之后。恢复已有专用会话不会增加或替换请求 token。

## 已知局限与延后工作

- Lua、配置表和日志工作流目前仅显示后续入口。
- 首版用 todo 投影表示阶段状态，不提供通用工具链定义编辑器。
