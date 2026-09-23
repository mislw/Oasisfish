---
description: "提供方中立的 Skill（技能）语料搜索服务，供声明可搜索资源的部署方和实现作用域搜索提供方的维护者使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-search

[English](README.md) | 中文

## 概述

agent（智能体）可以搜索已加载 Skill 中显式声明的资源语料，而不依赖某一种索引实现。部署方选择哪些 Skill 资源可搜索并设置字节与 chunk 上限；提供方负责存储与排序，消费方决定结果如何到达模型或用户。当多个搜索后端或消费方需要统一且能感知作用域的 API 时，请选择本包。本包自身不读取文件、不构建索引，也不注册工具。

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

用显式语料声明挂载服务，再挂载至少一个提供方和一个消费方，才能成功搜索。

### 何时选择

当部署需要带稳定错误、作用域提供方选择和提供方中立结果字段的 Skill 参考资料搜索时，请选择此服务。只需加载完整 Skill 正文时请跳过；`dsh-skill` 已负责发现和加载。可搜索资源是本地目录且适合使用本地 SQLite 索引时，请使用 `dsh-skill-search-local`。

### 最小配置

先挂载 Skill 注册表，再在本服务上声明每个可搜索语料。根目录相对于胜出 Skill 的资源基底。

```yaml
- name: '@deepseek-ai/dsh-skill'
- name: '@deepseek-ai/dsh-skill-search'
  config:
    corpora:
      - skill: api-guide
        roots: [references]
        extensions: [.md, .txt]
        maxFileBytes: 1048576
        maxCorpusBytes: 16777216
        maxChunks: 10000
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `corpora` | `[]` | 显式的可搜索 Skill 声明 |
| `corpora[].provider` | 任意胜出提供方 | 声明可选限定的 `ctx.skills` 提供方 |
| `corpora[].roots` | 必填 | 语料包含的相对资源根目录 |
| `corpora[].extensions` | 必填 | 接受的小写扩展名，包含开头的点 |
| `corpora[].maxFileBytes` | 必填 | 单个源文件允许的最大字节数 |
| `corpora[].maxCorpusBytes` | 必填 | 语料允许的源文件总字节数 |
| `corpora[].maxChunks` | 必填 | 语料保留的最大 chunk 数 |

自动生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-skill-search)是全部可接受字段的完整来源。

### 搜索行为与失败

`ctx.skillSearch.search()` 按调用方 cwd 和作用域解析胜出的 Skill，要求其允许模型调用，选择匹配的声明，再调用第一个支持该已解析资源基底的可见提供方。结果包含由提供方排序的摘录、相对路径、标题链和从 1 开始的行范围；服务把完整结果限制在请求数量且最多为 10。取消会与提供方工作竞争，因此忽略信号的提供方不能拖延调用方。

`SkillSearchError` 会在工具失败元数据中保留稳定的 `code`。这些 code 区分未知或禁止模型调用的 Skill、未声明语料、不支持的资源基底、语料上限、不可读来源、模型不可用和取消。诊断不包含查询或源文本。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节说明提供方路由与语料解析；确切签名在 [Skill 子系统参考](../../../docs/subsystems/skills.zh.md#cordis-surface)中自动生成。

### 设计理念

提供方注册位于宿主层和各作用域层。`registerProvider(name, provider)` 通过 Cordis effect 贡献一个借用的提供方，因此处置贡献它的 fiber 会精确移除该注册。搜索通过 `ctx.skills` 加载 Skill，从胜出定义和声明派生带品牌的语料标识，合并可见提供方层，再把一次完整请求委托给第一个支持该语料的提供方。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服务、语料声明、提供方路由、取消、结果上限和结构化错误 |
| [`src/brand.ts`](src/brand.ts) | 带品牌的语料标识与提供方名称 |
| — | 不发布运行时不变式伴生入口；提供方路由是注册表私有状态，不存在可能与其分离的独立观测。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

请依次阅读 Skill 定义注册表、具体提供方和面向模型的消费方。

- [Skill 子系统参考](../../../docs/subsystems/skills.zh.md)——共享的 Skill 与语料搜索词汇。
- [skill 包](../skill/README.zh.md)——每次搜索前解析的 Skill 注册表。
- [skill-search-local 包](../skill-search-local/README.zh.md)——目录型 SQLite 与向量提供方。
- [tool-skill-search 包](../tool-skill-search/README.zh.md)——面向模型的 `skill_search` 消费方。

-----

<a id="model-experience"></a>
## 模型体验

通过 `dsh-tool-skill-search` 等负责渲染搜索 schema 与结果的消费方间接影响模型。

#### KV Cache 影响

本服务自身不增加模型上下文；消费方拥有检索段落的位置与生命周期。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明服务何时需要其他声明或提供方能力。

- **语料由部署方拥有**——Skill frontmatter 不能自行选择资源加入索引；每个可搜索语料都需要显式服务声明。
- **提供方选择停在首个匹配项**——一次搜索不会聚合或重新排序多个提供方的结果。
- **没有提供方状态 API**——调用方通过搜索观察就绪状态与失败；服务不公开清单或后台索引状态。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
