---
description: "与 Provider 无关的持久记忆（ctx.memory），供 Host 和维护者组合、调用或调试用户级与项目级记录。"
kind: "package-reference"
---

# @deepseek-ai/dsh-memory

[English](README.md) | 中文

## 概述

当 Provider 与 Consumer 需要统一 API 管理持久用户和项目笔记时，使用本包。调用方可以列出可见记录、添加或替换内容、幂等移除记录并更改有效启用状态，而无需了解具体持久化后端。每个进程由一个 effect 所有的 Provider 提供服务；Provider 缺失或重复注册时使用稳定的 `MemoryError` code 失败。取消会在派发前或排队的本地写入开始前拒绝，且不会暴露中止原因。

## 目录

- [使用本包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [进一步阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

先挂载 Service Definition，再挂载且仅挂载一个 Provider，例如 [`@deepseek-ai/dsh-memory-local`](../memory-local/README.zh.md)；单独使用 Service 时会因没有已注册的持久化后端而拒绝操作。

### 何时选择

当多个 Host Consumer 需要相同的不可变记录和失败分类，同时持久化策略仍可替换时，选择本包。当功能只拥有进程内临时状态，或数据应进入 Session 事件日志而不是非 Session 存储时，不要使用本包。

### 最小配置

Service Definition 没有配置项：

```yaml
- name: '@deepseek-ai/dsh-memory'
```

Provider 从自己的组合行注册到 `ctx.memory`。注册第二个 Provider 会以 `MEMORY_DUPLICATE_PROVIDER` 失败；释放贡献该注册的 fiber 会腾出槽位，没有 Provider 时调用操作会以 `MEMORY_PROVIDER_UNAVAILABLE` 失败。

### 作用域、变更与取消

用户记录对所有调用方上下文可见。项目记录仅在其存储的项目身份与调用方规范化后的 `cwd` 匹配时可见；没有工作目录时创建项目记忆会以 `MEMORY_PROJECT_UNAVAILABLE` 失败。所有返回记录和快照都不可变，移除操作是幂等的，中止的操作会在 Provider 开始新的持久化工作前以已净化的 `AbortError` 拒绝。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现内部说明 - 点击展开</summary>

`MemoryService` 拥有一个 Provider 注册，并在检查取消后委托五个公开操作。Service Definition 拥有请求、结果、品牌化的 `MemoryId`、Remote 管理方法和稳定错误；Provider 负责存储、容量和内容策略，Consumer 负责渲染与模型可见行为。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | Service 入口、Provider 注册、取消和 Remote 方法 |
| [`src/types.ts`](src/types.ts) | 记录、请求、结果、Provider 接口、品牌 id 和 `MemoryError` |
| - | 不发布运行时 invariant companion；`MemoryService` 同步强制 Provider 存在性和唯一性，注册释放由贡献该注册的 effect 所有。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步阅读

- [memory 包地图](../README.zh.md) - Service Definition 与本地 Provider 的拆分。
- [本地 memory Provider](../memory-local/README.zh.md) - 有界持久化与内容策略。
- [能力接缝](../../../docs/capability-seams.zh.md) - Service Definition、Provider 和 Consumer 的所有权。
- [Session 包](../../core/session/README.zh.md) - 负责作为变更来源的品牌化 Session id。

-----

<a id="model-experience"></a>
## 模型体验

通过选择记录并拥有全部模型可见渲染的 Consumer 间接影响；本包不注册工具、提示词或 Session 事件。

#### KV Cache 影响

无直接影响；任何请求前缀变化和缓存失效均由 Consumer 负责。

## 已知限制与暂缓事项

<a id="known-limitations-and-deferred-work"></a>

此限制说明组合何时需要另一种 Provider 选择机制。

- **每个进程一个 Provider** - 注册第二个 Provider 会失败，而不是隐式选择；在出现两个生产后端前，Provider 选择机制保持暂缓。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 - 点击展开</summary>

无。

</details>
