---
description: "面向 Web 的 Oasis UI 制作工作流启动器，使用已安装的 oasis-wiki 指引与对话图片接收能力，按会话保存并由用户确认推进。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-oasis-workflow

[English](README.md) | 中文

## 概述

`dsh-client-ui-oasis-workflow` 让 Web 用户从对话输入区启动和恢复 Oasis UI 制作任务。它展示固定的`来源 -> UI Tree -> 视觉稿 -> 分层 -> Workbench -> UMG -> 逻辑 -> 验收`阶段，每次只提交一个阶段，并仅在用户明确确认后推进。浏览器本地进度按会话隔离。启动器只负责组织请求和图片输入；它不会生成证据、修改 UGC 资产，也不能证明 Agent、编辑器、PIE 或多人工作已经成功。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 Web 组合中挂载本包，可在对话输入区加入 **UI 生图** 启动器，并在 shell overlay 中加入引导工作流。

### 何时选择

当部署包含 `oasis-wiki` Skill，并且用户需要在 UI 制作阶段之间设置明确验收点时选择本包。当任务不需要固定 Oasis 工作流或浏览器本地进度时，直接使用不带本包的普通对话输入区。

### 最小配置

```yaml
- id: ui-oasis-workflow
  name: '@deepseek-ai/dsh-client-ui-oasis-workflow'
```

本包不接受配置字段。其 Host 半侧需要 `systemPrompt`；浏览器半侧需要 conversation 与 layout 服务。生成的[配置目录](../../../docs/config-catalog.zh.md)是当前注入列表的真源。

### 用户流程

1. 使用挂载本包的组合启动 DSH Web，并在目标工作区打开一个对话。
2. 点击 **UI 生图**，然后选择 **文字导航版** 填写简短任务名称，或选择 **UI 桌面版** 填写完整的来源、目的、参考图和约束。
3. 查看当前阶段的 Agent 工作、用户验收项和预期产物，然后点击 **开始本阶段**。
4. 点击 **需要修改** 可提交仅针对当前阶段的反馈而不推进；点击 **确认通过并进入下一步** 只解锁下一阶段，不会自动提交。

桌面版的来源选项为 **生成新 UI**、**使用已有图** 和 **继续现有任务**。已有图路径通过对话图片接收能力接受剪贴板 PNG、JPEG、WebP 和 GIF，并遵守其配置的图片数量与字节上限。

### 进度语义

固定阶段为`来源 -> UI Tree -> 视觉稿 -> 分层 -> Workbench -> UMG -> 逻辑 -> 验收`。进度按 `dsh.oasis-ui.workflow.<sessionId>` 保存到浏览器 `localStorage`；关闭 overlay 或刷新浏览器后，会恢复该会话的模式、任务请求、当前阶段和状态。

`ready` 表示当前阶段尚未通过启动器提交。`awaiting_confirmation` 表示阶段请求已提交并等待用户决定。`complete` 表示用户确认了最后一个阶段。Agent 输出不能改变这些状态。

### 安全规则

- 正式位图生成优先使用内置 `image_gen` 工具；没有允许的后端时，Agent 报告 `IMAGE_GENERATION_UNAVAILABLE`。
- HTML、CSS 或 Chromium 截图不是正式生成的 UI；动态文字、数值、进度、倒计时和点击热区保持为原生控件。
- 候选控件只有在用户明确确认后才能进入可复用项目控件库。
- 启动器不会伪造生成图、可编辑图层、Cowart 状态、审核记录、编辑器保存、PIE 结果或相似度分数。
- 启动器不授权写入 WidgetBlueprint、Lua、DataTable、`.uasset`、`.umap` 或其他 UGC 资产。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

Host 半侧为受信任的 `[OASIS_UI_WORKFLOW]` 消息加入一段字节稳定的系统提示。浏览器半侧注册一个输入区控件和一个 shell overlay，构建结构化阶段消息，通过现有对话草稿接口接收所选图片，并按 Session id 保存可丢弃的进度。

| 区域 | 源文件 |
|---|---|
| Host 提示段落 | [`src/index.ts`](src/index.ts) |
| 浏览器注册 | [`src/client/index.ts`](src/client/index.ts) |
| 阶段 Prompt 与定义 | [`src/client/workflow.ts`](src/client/workflow.ts) |
| 浏览器本地进度 | [`src/client/progress-store.ts`](src/client/progress-store.ts) |
| 启动器 UI | [`src/client/OasisUiWorkflow.tsx`](src/client/OasisUiWorkflow.tsx) |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Web App Bundle](../../bundle/web-app/README.zh.md)——挂载本包的随产品交付组合。
- [配置目录](../../../docs/config-catalog.zh.md)——生成的注入元数据。
- [Oasis UI 工作流决策](../../../.agents/notes/implemented/feature/2026-08-16-oasis-ui-user-confirmed-progress.zh.md)——阶段推进与证据设计的理由。
- [添加 package](../../../docs/cookbook/adding-a-package.zh.md)——package 与模型体验要求。

-----

<a id="model-experience"></a>
## 模型体验

### Oasis UI 工作流系统提示

#### 模型看到的内容

Host 会加入一个固定段落，把 `[OASIS_UI_WORKFLOW]` 消息标识为受信任的启动器输入，并要求加载 `oasis-wiki`、先搜索项目控件、使用真实生图能力、由用户控制阶段推进，以及在修改 UGC 资产前取得明确授权。

##### 稳定的启动器指令

```markdown
Messages beginning with [OASIS_UI_WORKFLOW] come from the trusted Oasis UI launcher. Before acting, load the oasis-wiki skill with the skill tool. Follow its Game UI Design System, Cowart UI Production, and Oasis UI Agent interaction rules. Work one user-visible stage at a time, keep one pending decision, require a complete UI Tree and real style reference for formal generation, preserve native text/numbers/progress/hit targets, and never modify UGC assets without explicit authorization. The launcher advances only when the user confirms the current stage; an agent response must not claim that the launcher progressed or continue into a later stage. Prefer built-in image_gen; when unavailable, report IMAGE_GENERATION_UNAVAILABLE unless the user explicitly authorizes the documented provider-direct fallback. Never fake image output, generation-result records, editable layers, Cowart state, or approval.
```

#### Token 影响

每次模型请求都会携带这个固定的系统提示段落，其大小不会随已确认阶段数量增长。

#### KV Cache 影响

在同一组合中，该固定段落在不同阶段和会话间保持字节稳定，因此在 Host package 文本变化前有利于缓存复用。

### 阶段请求消息

#### 模型看到的内容

启动器每次提交都会增加一条以 `[OASIS_UI_WORKFLOW]` 开头的普通用户消息，其中包含所选模式、准确阶段、任务上下文、Agent 工作、用户验收项、预期产物，以及完成本阶段后停止的要求。

#### Token 影响

每次开始阶段或提交修改都会增加一条阶段 Prompt，其大小取决于保留的任务字段和可选修改意见。

#### KV Cache 影响

每个新阶段或修改只改变最新的对话后缀；更早的系统提示和对话前缀能否复用，取决于所选模型提供方的缓存策略。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

启动器记录用户决定，但不能观察这些决定所指向的工作。

- 进度保存在当前浏览器，而不是 Session 日志中，因此不会在浏览器或设备之间同步；清除该浏览器存储后进度会消失。
- 启动器不会验证生成文件、Workbench 状态、UMG 保存、PIE、多人或重连检查是否存在或仍然有效。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
