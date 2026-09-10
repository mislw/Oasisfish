# @deepseek-ai/dsh-memory

[English](README.md) | 中文

持久用户/项目记忆的提供方无关 Service Definition。`ctx.memory` 选择一个由 effect 管理的 Provider，并提供 `list`、`add`、`update`、`remove` 和 `setEnabled`；Provider 缺失或重复时使用稳定 `MemoryError` code 失败。记录使用不透明的 `MemoryId`，项目访问根据调用方 Session 的 `cwd` 解析，返回的记录均不可变。

本包拥有记录、请求、结果、品牌 id 和错误类型。Provider 负责持久化与策略，模型工具和 UI 负责展示。

## 模型体验

通过 `@deepseek-ai/dsh-tool-memory` 间接影响；该 Consumer 选择有效记录，并负责把模型可见内容写入日志。

#### KV Cache 影响

本包不直接影响；请求前缀变化由 Consumer 负责。

## 已知限制与暂缓事项

- **每个进程一个 Provider** — 注册第二个 Provider 会失败，不会隐式选择；在出现两个生产后端前暂缓 Provider 选择策略。
