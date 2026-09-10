# Agent Note: 原生持久记忆

Status: implemented

[English](2026-09-10-native-memory.md) | 中文

## 问题

Oasisfish 可以搜索历史 Session 日志，但没有用于稳定用户偏好和项目事实的小型持久存储。每次对话重复这些事实会浪费注意力，而把任意历史复制进提示词又会混入临时工作、秘密和无关项目。

## 决策

Harness 以完整插件能力提供原生持久记忆。`@deepseek-ai/dsh-memory` 负责提供方无关的记录、品牌 id、类型化操作和 Host Remote；`@deepseek-ai/dsh-memory-local` 持久化一个有界的 `native_memory` storage-domain 文档；`@deepseek-ai/dsh-tool-memory` 负责模型侧 `memory_manage` 工具、固定写入策略和每轮上下文注入；Web 客户端通过 `@deepseek-ai/dsh-client-ui-settings-memory` 展示记录。

记忆有两个 scope。用户记录跨项目可见。项目记录使用规范化 Session 绝对 `cwd` 的 SHA-256 摘要作为键，没有 `cwd` 时不可用。新增和更新会拒绝有效 scope 内的重复内容，执行条数与 Unicode code point 预算，并在持久化前拒绝疑似凭证、临时路径和原始日志。关闭记忆会保留全部记录和管理入口，但停止记录快照注入。

每轮第一个被接受的 step 中，工具 Consumer 会读取新快照，并把已启用的记录作为带来源的 `UserMessage` 前置。来源为 `native-memory-context`，因此 AgentLoop 会在派生请求前把模型可见原文追加到 Session 日志。同一轮后续 step 不会再加第二份快照。工具或设置页面的变更从下一轮生效，不会重写旧请求。

当前对话模型自行选择显式调用 `memory_manage`。Harness 不运行后台抽取器、摘要器、审核模型或第二次模型请求。既有 `session_search` 系列仍负责工作区授权的历史 Session 查询；Web 和桌面端把其派生 SQLite 索引保存在 Harness home，并在首次搜索时打开。

## 验证

Service 与 Provider 测试覆盖 Provider 生命周期、项目隔离、持久重开、并发变更、不可变结果、重复内容、精确上限、Unicode 计数、敏感内容类别、单调更新时间、幂等删除和启用状态。工具测试覆盖 schema action、owner 上下文、来源 Session、首 step 带来源注入、关闭和空记录状态、拒绝与卸载。浏览器测试覆盖页面注册、加载、语言切换、开关、分组记录、新增、编辑、删除，以及失败后保留草稿。

无密钥 Loader 快照会启动真实 Service、JSON 存储、本地 Provider、Agent loop 和工具 Consumer。确定性对话模型在第一轮保存一条项目记录，收到已提交工具结果，并在下一轮观察到一条包含该记录、已写入日志的 `native-memory-context` 消息。

## 考虑过的替代方案

**每轮结束后后台抽取。** 拒绝，因为它会增加隐藏模型请求、延迟、成本、失败处理，以及不确定的删除和冲突行为。当前对话模型已经具有足够上下文，可以显式调用工具。

**把 Session 搜索当作长期记忆。** 拒绝，因为搜索返回历史事件，而不是一组小型、可维护的当前事实。搜索仍适合调查；原生记忆只承载显式持久记录。

**把记忆存进每个 Session 日志。** 拒绝，因为全局偏好会重复，项目记录也需要扫描无关日志。独立的有界 domain 为设置页面提供一份可检查的当前状态，模型可见快照仍写入日志。

**在版本 1 使用语义向量。** 拒绝，因为当前上限下按 scope 精确列出已经足够，而 embedding 会在检索质量确实需要它之前增加 Provider、派生索引生命周期和新的凭证路径。

## 后果

- Oasisfish 可以在全局记住稳定用户偏好，并按 Session 工作目录记住稳定项目事实。
- 每一份模型可见记忆快照都能从 Session 日志重建。
- 用户可以查看、编辑、删除、关闭和重新启用记录，无需删除数据或编辑配置文件。
- 基于模式的安全检查可能拒绝外观类似秘密或原始日志的正常文本；设置页面会显示失败并保留草稿。
- 跨窗口变更会在下次页面加载或 Session 选择变化时收敛；专用 revision 事件暂缓。
