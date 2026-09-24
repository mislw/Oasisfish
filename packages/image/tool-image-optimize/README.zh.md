---
description: "对当前用户 turn 中已准入持久图像执行面向模型的图像优化。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-image-optimize

[English](README.md) | 中文

## 概述

注册 `image_optimize` 工具，提供共享的 `ctx.imageInputImages` 当前 turn 清单，并把从一开始计数的位置解析为 live Agent 当前 turn 已准入的直接用户图像。工具返回完整的提供方无关 `ImageOptimizationResult`；准备过程确定且离线，不调用图像或辅助模型、不读取执行器凭据，也不执行该规范。

## 目录

- [使用本包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

在 `dsh-tools` 与 `dsh-image-optimizer` 之后挂载 Tool Consumer：

```yaml
- name: '@deepseek-ai/dsh-tool-image-optimize'
```

`image_optimize` 要求存在 `ToolRunContext.agent`。`references[].inputIndex` 是 `agent/pre-step` 为直接用户图像内容准入后从一开始计数的位置；插件生成图像与之前 turn 的图像不可用。同一 turn 的后续已接受 step 会按消息及内容顺序追加图像，新 turn 会替换列表，`agent/disposed` 会清除列表。非正数或非安全整数位置会在查找前返回 `INVALID_ARGUMENTS`；有效但缺失的位置会在 Provider 工作前返回 `IMAGE_REFERENCE_NOT_FOUND`。

插件通过 `ctx.imageInputImages` 发布该清单。`image_optimize` 从中解析请求序号，prepared `image_generate` 执行也读取同一个防御性副本查询，因此两个 Consumer 对位置的解释一致。

请求 schema 会拒绝根对象及每个嵌套对象中的未声明字段。它公开生成、编辑和变体操作、引用角色、精确文本、输出要求、保留和禁止列表、locale、可选 category 与 template 选择、style 与 scene hint，以及 case ID。optimizer 校验正安全整数与跨字段要求。`needs_clarification` 是成功的结构化结果，不是 Tool 失败。

<a id="understand-the-implementation"></a>
## 了解实现

pre-step listener 总是等待 `next()`，并且只观察返回的 `enter.messages`，因此后续 listener 决定最终准入输入。捕获状态使用以 live Agent 为键的 `WeakMap`，从不扫描 Session 事件。进程本地 `ctx.imageInputImages` Provider 返回防御性副本，其生命周期由本插件负责。工具展示是纯函数：结果卡片只读取持久 metadata 投影，其中包含 status、operation、evidence ID、warning 与 issue code。本地路径和 Provider prompt 正文不会进入 metadata。

本包不发布运行时不变式 companion。捕获列表只有一个所有者，不存在可能分歧的独立观测关系；准入、重置与处置行为由直接生命周期测试及 Loader 组合测试覆盖。

<a id="model-experience"></a>
## 模型体验

### 图像优化工具

#### 模型看到什么

模型会看到 `image_optimize` schema，以及包含完整 `ImageOptimizationResult` 的单个紧凑 JSON 文本块。prepared 结果包含规范 prompt、持久引用、输出要求、已选 evidence 与 warning。clarification 结果包含 issue code、路径与消息。

#### Token 影响

可变。工具向 prompt assembly 添加一个 schema，并返回 optimizer 的完整受限结果。它不发起辅助模型请求。

#### KV Cache 影响

挂载或移除插件时，工具 schema 会改变已组装的工具 schema 前缀。每个结果只改变对应调用的工具结果后缀。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **仅当前 live 输入** — 位置不能引用之前 turn 或非用户消息中的图像。
- **没有图像执行器** — `prepared` 表示指令已可供另行授权的执行器使用，并不表示图像已经生成。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
