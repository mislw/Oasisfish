---
description: "为需要跨轮次复用用户偏好与项目事实的 Agent 提供持久记忆工具和已记录的首 step 上下文。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-memory

[English](README.md) | 中文

## 概述

`dsh-tool-memory` 让 Agent 通过 `memory_manage` 列出和维护持久用户偏好与项目事实。它还会把已启用记录作为带来源的用户消息添加到每轮第一个被接受的 step，因此 Session 日志会保留模型可见的原文。未来轮次需要复用已配置 memory Provider 中的有界事实时选择本包。本包不会自动提取事实，也不会解决记录冲突。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在同一 composition 中挂载 memory Service Definition、一个 Provider 和本包。已发布的 base bundle 提供 service 与 tool，Web bundle 提供本地 Provider。

### 何时选择

当 Agent 需要跨轮次携带显式可复用事实，并且所有模型可见快照都必须能从 Session 日志重建时，选择本包。当上下文应为临时内容、自动推断内容或语义检索结果时不要选择本包；这些行为不属于本包。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-memory'
- name: '@deepseek-ai/dsh-memory-local'
- name: '@deepseek-ai/dsh-tool-memory'
```

本包没有配置字段。在 `memory_manage` 执行或某轮请求快照前，必须已经挂载 memory Provider。

### 工具操作

`memory_manage` 支持 `list`、`add`、`update` 和 `remove`。用户记录跨项目生效；只有已存项目 identity 与所属 Session `cwd` 匹配时，项目记录才生效。写操作会在 Provider metadata 中包含所属 Session id，remove 为幂等操作。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节 — 点击展开</summary>

插件注册一个 prompt section、一个 tool，以及一个 prepend 的 `agent/pre-step` waterfall listener。listener 总是先委托，保留已接受 decision 的字段，并且只为已启用、非空的首 step 添加快照。随后 AgentLoop 会在派生模型请求前提交该消息。Provider 继续负责容量、敏感内容检查、项目 identity 和持久化。

| 文件 | 作用 |
|---|---|
| [`src/index.ts`](src/index.ts) | prompt 引导、tool 注册、记录渲染和已记录的首 step 注入 |
| [`tests/tool.spec.ts`](tests/tool.spec.ts) | tool 操作、生命周期清理、waterfall 行为和多 step Session 记录 |

</details>

-----

<a id="further-exploration"></a>
## 进一步阅读

- [memory service](../memory/README.zh.md) — Provider 中立操作和类型化 Remote 方法。
- [memory-local](../memory-local/README.zh.md) — 已发布 Web composition 使用的有界本地存储 Provider。
- [Agent turn 流程](../../../docs/architecture.zh.md#turn-flow) — `agent/pre-step` 接受与记录顺序。
- [生成的工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-memory) — `memory_manage` 的精确 schema。

-----

<a id="model-experience"></a>
## 模型体验

### 持久记忆引导

#### 模型看到什么

插件可见时，模型会收到一段固定策略。

##### 记忆策略

```markdown
Use memory_manage only for durable, reusable facts that will help future work. Prefer project scope for repository rules and environment facts. Never store secrets, raw logs, or transient task state. Do not duplicate facts already present; update a record when a stable fact changes.
```

#### Token 影响

每个请求包含一段固定且简短的策略。

#### KV Cache 影响

插件与策略文字不变时，前缀保持稳定。

### 工具 schema 与结果

#### 模型看到什么

模型会看到生成的 [`memory_manage` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-memory)。结果会标识列出的记录，或已提交记录的 id 与 scope，不暴露存储实现。

#### Token 影响

工具可见时发送一个固定 schema；结果文本取决于数据，并保留在日志工具历史中直至压缩。

#### KV Cache 影响

工具结果追加在可复用请求前缀之后，不会让更早的缓存条目失效。

### 每轮记忆快照

#### 模型看到什么

每轮第一个被接受的 step 会读取已启用的用户记录，以及与 Session `cwd` 匹配的项目记录，并按 `User preferences` 与 `Project memory` 分组。空分组不会产生消息。带 `native-memory-context` 来源的原文会在派生请求前写入日志。

#### Token 影响

仅在存在记录时产生，并受 Provider 的条数和字符上限约束。每个新 turn 都读取新快照；同一 turn 的后续 step 不再添加。

#### KV Cache 影响

固定提示词和 schema 可复用。快照变化只会改变下一轮请求后缀，不会重写已记录的旧请求。

## 已知限制与暂缓事项

<a id="known-limitations-and-deferred-work"></a>

这些限制说明工具不适用的情况。

- **由模型选择写入** — 当前对话模型决定何时调用 `memory_manage`；有意不提供后台抽取和语义召回。
- **不自动解决冲突** — 稳定事实发生变化时必须显式 `update`；工具不会合并相互矛盾的记录。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>

**运行时 invariant：** 本包不发布运行时 invariant companion；本包不维护独立的状态投影，所组合的可观察关系分别由工具注册表、提示词注册表、记忆服务和 Session 日志负责。
