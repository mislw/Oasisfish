# @deepseek-ai/dsh-client-ui-game-toolbox

[English](README.md) | 中文

游戏开发工具箱的浏览器界面。侧栏同时提供完整 Oasis UI 工作流和专注生图工作流。每个工具都会创建或恢复自己的 Agent Preset 会话；UI 工作流还会打开详情面板，并在会话页头和详情摘要中显示持久化的 `todos` 投影。

`game-ui` preset 持有八阶段 UI 生产流程。点击纯生图入口只会打开空白 `game-image` 会话，不会自动提交用户消息或显示任务阶段。用户输入图片需求后，该 preset 会在当前轮次内静默只加载内置 `ai-image-prompts` Skill、检索一次匹配的本地视觉配方、优化出完整英文 prompt，并直接调用已配置的主生图模型和一个可选备用模型。它不包含文件系统、Shell、UMG、Lua、编辑器或无关 Skill 工具，也不会产生隐藏的模型请求。

工具入口使用基于主题 token 的半透明表面，使侧栏持续显示 Oasisfish 场景，同时保持标签对比度。

## 模型体验

### 专用会话启动提示词

#### 模型看到的内容

空白 `game-ui` 会话只会收到一次以下用户消息。系统指令与工具 schema 由 preset 单独持有。

##### 初始用户消息

```markdown
启动 UI 生成工具链。首先加载 oasis-wiki Skill，然后用 todo_write 建立并维护这 8 个阶段：来源、视觉、分层、工作台、UMG 需求、UMG 构建、逻辑绑定、最终验收。需要生图时加载 ai-image-prompts Skill，让当前默认对话 GPT 先细化完整英文 prompt 再调用 image_generate。一次只执行一个阶段，每个阶段完成后必须使用 ask_user_question 等待我确认，未经确认不得进入下一阶段。
```

#### Token 影响

UI 工具的初始用户消息会向空白 `game-ui` 会话的第一次请求加入固定提示词。打开或恢复 `game-image` 会话不会增加模型 token；用户的第一条图片需求直接成为首次请求。

#### KV Cache 影响

`game-ui` 的第一次请求保持追加式：启动消息位于 preset 所有的可复用系统与工具前缀之后。`game-image` 不加入启动消息。恢复已有专用会话不会增加或替换请求 token。

## 已知局限与延后工作

- Lua、配置表和日志工作流目前仅显示后续入口。
- 首版用 todo 投影表示阶段状态，不提供通用工具链定义编辑器。
