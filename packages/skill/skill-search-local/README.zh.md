---
description: "本地目录型 Skill（技能）搜索提供方，供配置私有 SQLite 索引与经过校验的设备端向量模型的部署方使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-search-local

[English](README.md) | 中文

## 概述

agent（智能体）可以搜索与 Skill 一同存储的 Markdown 和文本资源，而无需把源文本或查询发送到远程服务。该提供方把发现限制在声明的目录根内，按源位置切分文档，并把 SQLite 全文排序与经过校验的本地 Transformers.js 模型向量结合。当有界本地语料需要持久索引和确定性混合检索时，请选择本包。插件加载前必须具备可写数据库路径和完整的本地模型目录。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 `dsh-skill-search` 之后挂载此提供方，并把它指向可写 SQLite 文件和不可变的本地模型目录。

### 何时选择

当可搜索 Skill 资源使用目录资源基底、全部索引必须留在本地，且有界语料上的精确余弦搜索可以接受时，请选择此提供方。URL 或不透明资源、远程索引、近似最近邻搜索或由提供方管理的仓库应使用其他 `ctx.skillSearch` 提供方。

### 最小配置

`modelRoot` 直接包含 `model-manifest.json` 以及该 manifest 命名的所有文件。manifest 中的 `modelId` 是持久模型身份，不是额外路径段。

```yaml
- name: '@deepseek-ai/dsh-skill-search-local'
  config:
    databasePath: .dsh/cache/skill-search.sqlite
    modelRoot: .dsh/models/skill-search
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `providerName` | `local` | 一个搜索服务作用域层内的唯一提供方名称 |
| `databasePath` | 必填 | 可写 SQLite 数据库路径 |
| `modelRoot` | 必填 | 包含已校验模型 manifest 和文件的本地目录 |
| `manifestFile` | `<modelRoot>/model-manifest.json` | 可选的替代 manifest 路径 |
| `defaultResultCount` | `5` | 调用方省略 `limit` 时的结果数 |
| `maxResultCount` | `10` | 接受的最大结果数；不能超过 10 |

chunk 大小、向量批量、候选项上限、倒数排序融合、分数加权和最大边际相关性也都是经过校验的配置字段。自动生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-skill-search-local)是全部可接受字段的完整来源。

### 索引、隐私与失败

插件会校验模型 manifest、禁止远程模型下载、检查 SQLite FTS5 支持并打开存储，然后才注册提供方。设置期间失败会关闭全部资源；重复注册也会释放提供方、存储和模型。正常拆卸先注销提供方以阻止新搜索进入，再中止进行中的搜索并等待其结束；即使存储或模型的一个拆卸失败，也会尝试另一个拆卸。

存储仅在版本为零的数据库没有用户 schema 对象时，以事务方式初始化 schema 版本 1。已有内容的版本零数据库或任何不受支持的版本会失败，且不会采用或替换其 schema。

刷新会比较文档元数据和 SHA-256，只对变化的 chunk 生成向量，并在一个事务中提交来源、词法记录、向量、删除项与模型身份。发现、分块、向量生成、取消或写入失败时，之前的完整 revision 仍然可用。向量模型身份变化会重建缓存向量。

源文本、词法 token、向量、查询和 SQLite 记录均留在本地。发现会拒绝逃出 Skill 资源目录的根路径，并拒绝目录 reparse point。每个源文件都通过一个句柄读取；提供方会在读取前后检查文件身份与路径范围，再对实际读取的字节应用单文件与语料上限。诊断不包含查询或源文本。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节说明本地索引流水线；提供方中立的请求与结果类型位于 [Skill 子系统参考](../../../docs/subsystems/skills.zh.md#skill-corpus-retrieval)。

### 设计理念

每次搜索都会发现已声明根目录，按标题切分 Markdown 并按有界码点窗口切分文本，刷新一个语料 revision，再检索词法和向量候选项。倒数排序融合会合并候选列表，标题和路径精确匹配会增加有界加权，最大边际相关性负责选择最终段落。语料身份和向量模型身份共同决定已存储记录能否继续复用。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件配置、资源创建、注册、回滚与拆卸 |
| [`src/provider.ts`](src/provider.ts) | 提供方生命周期与单次搜索编排 |
| [`src/corpus.ts`](src/corpus.ts) | 受限目录发现与来源上限 |
| [`src/chunk.ts`](src/chunk.ts) | 感知标题的 Markdown 与有界文本分块 |
| [`src/embedder.ts`](src/embedder.ts) | manifest 校验与本地 Transformers.js 特征提取 |
| [`src/store.ts`](src/store.ts) | SQLite schema、事务式刷新与持久模型身份 |
| [`src/retrieval.ts`](src/retrieval.ts) | 混合排序与多样性选择 |
| — | 不发布运行时不变式伴生入口；事务与搜索结果直接观测本包拥有的索引状态。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

请阅读以下页面，了解本提供方实现的服务、接受的 Skill 资源和渲染结果的消费方。

- [Skill 子系统参考](../../../docs/subsystems/skills.zh.md)——语料声明、提供方中立请求与结果。
- [skill-search 包](../skill-search/README.zh.md)——提供方注册、作用域选择与错误 code。
- [skill 包](../skill/README.zh.md)——目录资源基底与模型调用策略。
- [tool-skill-search 包](../tool-skill-search/README.zh.md)——面向模型的搜索 schema 与引用。

-----

<a id="model-experience"></a>
## 模型体验

通过 `dsh-tool-skill-search` 等负责渲染提供方排序段落的消费方间接影响模型。

#### KV Cache 影响

提供方自身不增加模型上下文；消费方决定检索段落是否追加到保留的历史中。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明本地实现支持的语料与检索规模。

- **仅支持目录资源**——URL 和不透明 Skill 资源基底需要其他搜索提供方。
- **有界精确向量搜索**——检索会在已配置候选项上计算精确余弦；不包含近似向量索引和学习式重排器。
- **由搜索驱动刷新**——提供方在搜索时刷新语料，不公开后台重建或状态 API。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
