---
description: "本地 native_memory 存储 Provider，供 Host 和维护者配置、设定容量或调试有界持久用户与项目记录。"
kind: "package-reference"
---

# @deepseek-ai/dsh-memory-local

[English](README.md) | 中文

## 概述

使用本包通过 `native_memory` storage domain 持久化有界用户和项目笔记。它根据规范化的工作目录派生项目身份，串行执行变更，并将启用状态和记录作为一份原子 global 文档提交。重复内容、容量溢出、疑似凭证的文本、临时路径和原始日志转储都会在持久化前被拒绝。取消会在排队工作开始写入前停止它，释放过程会注销 Provider，并等待已开始的写入和 domain 关闭完成。

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

先挂载存储后端和 domain facility，再挂载 memory Service Definition 与本 Provider。以下组合将 `native_memory.json` 存储在配置的私有存储根目录下：

```yaml
- name: '@deepseek-ai/dsh-storage'
- name: '@deepseek-ai/dsh-storage-json'
  config:
    root: /var/lib/dsh/data
- name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: json
- name: '@deepseek-ai/dsh-memory'
- name: '@deepseek-ai/dsh-memory-local'
```

### 容量配置

限制在移除首尾空白后按 Unicode code point 计数。用户总量是全局的；项目总量按每个规范化项目身份独立计算。

| 字段 | 默认值 | 含义 |
|---|---:|---|
| `maxUserItems` | `80` | 用户记录上限 |
| `maxProjectItems` | `120` | 单个项目身份的记录上限 |
| `maxItemChars` | `1200` | 单条记录的 code point 上限 |
| `maxUserChars` | `12000` | 所有用户记录的 code point 总上限 |
| `maxProjectChars` | `18000` | 单个项目所有记录的 code point 总上限 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-memory-local)是可接受字段及其 JSDoc 的完整来源。

### 失败与生命周期行为

没有 `cwd` 时创建项目记录会在存储前失败。重复或超大内容以及命中安全模式的内容会以稳定的 `MemoryError` code 失败，且错误不包含被拒绝的文本。后端写入失败会保持内存快照和持久文档不变。释放会先移除 Provider，再等待排队的持久化操作，并仅在写入链静止后关闭 domain。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现内部说明 - 点击展开</summary>

Provider 在 storage domain 之上维护一条变更链，使校验和容量决策观察最新已提交文档。domain 的 global handle 提供提交点：存储持久化完成后才更改内存值，失败的写入无法发布部分记录集。

### 持久化声明

`memoryDomainSpec` 保持已发布的 `native_memory` 名称、版本 `0`、global schema 和空表映射。global 文档存储 `enabled` 以及包含 id、作用域、可选项目身份、内容、可选来源 Session id 和创建/更新时间戳的不可变记录。本包不声明后继版本或迁移。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | Provider、项目身份、限制、内容拒绝、变更链和生命周期 |
| [`src/spec.ts`](src/spec.ts) | 已发布的 `native_memory` 版本 `0` global schema 与存储声明 |
| - | 不发布运行时 invariant companion；storage-domain 校验持久文档并负责原子性，`MemoryService` 负责 Provider 唯一性和 effect 释放。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步阅读

- [Memory Service Definition](../memory/README.zh.md) - 与 Provider 无关的操作、记录和失败。
- [memory 包地图](../README.zh.md) - 两个恢复包及其所有权拆分。
- [存储子系统](../../../docs/subsystems/storage.zh.md) - domain 持久性、校验和生命周期。
- [JSON 存储后端](../../storage/storage-json/README.zh.md) - 示例使用的人类可读单文档介质。

-----

<a id="model-experience"></a>
## 模型体验

通过读取已提交记录的 Consumer 间接影响；本 Provider 不贡献工具、提示词、schema 或 Session 事件。

#### KV Cache 影响

无直接影响；只有 Consumer 更改模型可见上下文时，存储变更才会影响请求。

## 已知限制与暂缓事项

<a id="known-limitations-and-deferred-work"></a>

这些限制说明本地 Provider 何时需要不同策略或存储协调。

- **基于模式的安全分类** - 疑似凭证、临时路径和原始日志模式会被保守拒绝；语义分类需要额外模型调用。
- **单 Host 进程持久化** - JSON 后端不为此单文档 domain 提供跨进程写锁，因此配置的存储根目录必须由一个 Harness Host 独占。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 - 点击展开</summary>

无。

</details>
