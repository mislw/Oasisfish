# 原生记忆设计

[English](2026-09-10-native-memory-design.md) | 中文

## 目的

Oasisfish 需要不依赖外部记忆提供方或第二次模型调用的持久、可检查记忆。当前 Agent 能获得稳定的用户与项目事实，可通过面向模型的工具维护它们，并通过已有 session-query 能力搜索历史会话。

## 范围

版本 1 增加两个持久作用域：

- `user` 跨项目保存沟通偏好和稳定工作习惯。
- `project` 只保存当前 Session `cwd` 对应的稳定规则和环境事实。

功能包含提供方无关的 `ctx.memory` Service Definition、基于 JSON domain 的本地 Provider、`memory_manage` 工具 Consumer，以及 Web Settings 页面。已有 `session_search` 和 `session_event_search` 继续作为唯一历史搜索工具。

本版本不增加语义记忆搜索、后台抽取、云同步、消息向量索引、自动删除或 Hermes 文件格式导入。

## 数据模型

每条记录包含不透明品牌 id、作用域、内容、时间戳和可选来源：

```ts
type MemoryId = string & { readonly __brand: 'MemoryId' }
type SessionId = string & { readonly __brand: 'SessionId' }

interface MemoryRecord {
  id: MemoryId
  scope: 'user' | 'project'
  projectKey?: string
  projectLabel?: string
  content: string
  sourceSessionId?: SessionId
  createdAt: number
  updatedAt: number
}
```

`projectKey` 是规范化绝对 `cwd` 的 SHA-256 小写十六进制摘要。`projectLabel` 只取路径 basename，用于 Settings 展示。Session 没有 `cwd` 时不能访问项目记忆。用户记忆不能携带项目字段。

每次实际变更返回完整不可变记录。更新和删除必须指定当前记录 id；更新保留 `createdAt`，并保证 `updatedAt` 单调递增。

## Provider 约定

`ctx.memory` 提供 `list`、`add`、`update` 和 `remove`。调用者传入包含当前 `cwd`、可选来源 Session id 和可选取消信号的 `MemoryContext`。Service Definition 负责请求与结果类型；本地 Provider 负责持久化、校验、容量、去重和项目键计算。

本地 Provider 使用一个 `native-memory.json` storage-domain 单元。变更按有效作用域串行执行。记录在 Provider 和进程重启后仍保留。同一有效作用域内，规范化后内容重复会被拒绝；同一内容可分别在全局与某个项目各保存一次。

部署配置必须明确以下限制：

- `maxUserItems: 80`
- `maxProjectItems: 120`
- `maxItemChars: 1200`
- `maxUserChars: 12000`
- `maxProjectChars: 18000`

字符限制按 Unicode code point 计算。首尾空白会被移除，内部空白保持原样。

## 安全

Provider 拒绝疑似凭证或密钥材料的内容，包括私钥块、Bearer token、常见 API key 赋值、密码赋值和长不透明 token 字符串；也拒绝临时文件系统路径、原始日志转储和超过配置限制的内容。诊断只说明拒绝类别，不回显提交内容。

安全检查在 Provider 变更入口执行，因此 Host RPC、模型工具和未来 Consumer 都无法绕过。由于记忆记录禁止包含密钥，Settings 不会返回隐藏凭证值。

## 模型体验

每轮第一个被接受的 step 上，记忆上下文插件读取用户记录和 Session `cwd` 对应的项目记录。它前置一条来源为 `native-memory-context` 的 `UserMessage`。AgentLoop 会在派生请求前把该快照原样写入 Session 日志。pre-step 被拒绝或失败时不记录任何内容。

快照只包含当前记录，并按 `User preferences` 与 `Project memory` 分组。空分组省略；两组都为空时不注入消息。每轮重新生成快照，因此 Settings 或工具变更从下一轮起生效，不会追溯修改旧请求。

`memory_manage` 支持 `list`、`add`、`update` 和 `remove`。系统提示要求模型只保存持久且可复用的事实；仓库事实优先使用项目作用域；不得保存密钥、原始日志、临时任务状态或已有事实；矛盾内容应更新而非堆叠。工具结果只报告已提交的 id 和作用域，不暴露内部实现叙述。

自动记忆由当前对话模型选择调用该工具，不调用审查、摘要或后台模型。

## 历史会话

随产品发布的 standard Agent preset 包含已有 `tool-session-query`。Web/桌面组装把 `session-query-sqlite` 从 `:memory:` 改为 `dshHomePath('session-search.sqlite')`，并设置 `openAt: first-search`。搜索继续受 workspace 授权约束并返回已记录的 Session 事件；除非模型明确调用 `memory_manage`，原生记忆不会复制搜索结果。

## Settings 体验

Web Client 增加 `Memory` Settings 区域。其 Host 半侧提供由 `ctx.memory` 支撑的类型化 Remote 方法：列出有效用户/项目记录、新增、编辑、删除，以及读取/更新 `enabled` 偏好。页面包含启用开关、分开的用户/项目组、行内新增/编辑控件和删除确认。校验失败时显示错误并保留当前草稿。

关闭记忆会停止记录快照注入，但保留已存记录、`memory_manage` 和 Settings 管理。重新启用后从下一轮恢复注入。

## 错误

预期业务失败使用稳定代码：`MEMORY_INVALID_SCOPE`、`MEMORY_PROJECT_UNAVAILABLE`、`MEMORY_NOT_FOUND`、`MEMORY_DUPLICATE`、`MEMORY_ITEM_LIMIT`、`MEMORY_CHAR_LIMIT`、`MEMORY_CONTENT_REJECTED` 和 `MEMORY_DISABLED`。存储与生命周期故障继续作为基础设施错误抛出。

## 验证

单元测试覆盖类型、项目隔离、持久化、并发变更、重复检测、安全类别、精确容量、Unicode 计数、更新/删除语义、启用状态、工具 schema 与结果、注入时机、日志记录和卸载。通过 Loader 组装的无 Key snapshot 证明 standard Agent 能收到记忆引导、调用 `memory_manage` 并观察提交结果。客户端测试覆盖注册、加载、开关、新增/编辑/删除、错误保留和语言切换。

最终验证运行变更包的聚焦覆盖率、无 Key snapshot、生成目录检查、`typecheck`、`build`、`doc-sync`、桌面 runtime staging 测试和 `git diff --check`。不调用真实模型 Provider。
