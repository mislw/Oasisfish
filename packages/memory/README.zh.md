---
description: "memory 包组：面向组合或查找用户级与项目级记忆的读者，说明与 Provider 无关的持久笔记能力及本地存储 Provider。"
kind: "package-group"
---

# memory/ - 持久用户与项目记忆

[English](README.md) | 中文

## 概述

memory 包组让 Host 保存用户级或项目级的持久笔记。`memory` 包定义共享操作、记录、id 和失败类型；`memory-local` 通过 storage-domain facility 存储一份有界文档。模型工具、UI 和发布组合仍由独立 Consumer 提供，因此只挂载本包组不会增加提示词内容或模型可见工具。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

Service Definition 与本地 Provider 可以独立于 Consumer 进行组合。

| 包 | 职责 | ctx key |
|---|---|---|
| [`memory`](memory/README.zh.md) | 定义与 Provider 无关的持久记忆记录和操作 | `ctx.memory` |
| [`memory-local`](memory-local/README.zh.md) | 在 `native_memory` domain 中持久化有界用户与项目记录 | 注册到 `ctx.memory` |

<a id="related-documentation"></a>
## 相关文档

- [存储子系统](../../docs/subsystems/storage.zh.md) - 负责存储后端、domain 声明、原子写入和 domain 生命周期。
- [能力接缝](../../docs/capability-seams.zh.md) - 解释本包组采用的 Service Definition、Provider 和 Consumer 角色。

<a id="dev-note"></a>
## 开发备注

无。
