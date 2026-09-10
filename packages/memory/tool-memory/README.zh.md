# @deepseek-ai/dsh-tool-memory

[English](README.md) | 中文

注册 `memory_manage`、持久记忆引导和首 step `agent/pre-step` 快照。接受的快照来源为 `native-memory-context`，因此 AgentLoop 会在派生请求前把模型可见原文写入 Session 日志。

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

- **由模型选择写入** — 当前对话模型决定何时调用 `memory_manage`；有意不提供后台抽取和语义召回。
- **不自动解决冲突** — 稳定事实发生变化时必须显式 `update`；工具不会合并相互矛盾的记录。
