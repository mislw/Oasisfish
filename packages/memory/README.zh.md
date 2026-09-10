# memory/ - 持久记忆能力

[English](README.md) | 中文

| 包 | 职责 | ctx key |
|---|---|---|
| [`memory/`](memory/README.zh.md) | 定义提供方无关的记录与操作 | `ctx.memory` |
| [`memory-local/`](memory-local/README.zh.md) | 在本地持久化有界用户/项目记录 | 注册到 `ctx.memory` |
| [`tool-memory/`](tool-memory/README.zh.md) | 向模型提供记忆管理与已记录上下文 | 注册到 `ctx.tools` |
