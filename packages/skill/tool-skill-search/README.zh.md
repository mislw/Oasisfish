---
description: "面向模型的 skill_search 工具，供 agent（智能体）查询已声明的 Skill（技能）语料并引用排序后的来源段落。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-skill-search

[English](README.md) | 中文

## 概述

agent（智能体）可以查询已加载 Skill 的声明语料，并获得带相对来源引用的排序摘录。`skill_search` 工具接收精确 Skill 名称、自然语言或符号查询和可选结果上限；它保留结构化搜索失败，并把完成的命中项呈现为文件与行匹配。当模型需要从不适合随 Skill 正文整体加载的大型参考资料中获取针对性事实时，请选择本包。本包需要已配置的 `ctx.skillSearch` 服务与提供方。

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

在工具注册表和 Skill 搜索服务可用后，把该插件挂载到 agent 组合中。

### 何时选择

当模型应按需搜索已声明的 Skill 参考资料，并引用返回的相对路径和行范围时，请选择此消费方。完整 Skill 正文已包含全部所需信息时，或搜索只是不能由模型调用的宿主或用户工作流时，请跳过。

### 最小配置

插件没有配置字段。它的依赖项提供语料声明、搜索提供方与工具注册表。

```yaml
- name: '@deepseek-ai/dsh-tool-skill-search'
```

### 调用与结果行为

工具要求非空的精确 Skill `name` 和非空 `query`。`limit` 默认为 5，且必须是 1 到 10 的整数。调用会继承 agent 的 cwd、作用域与取消信号。成功命中项包含 rank、score、相对路径、标题链、从 1 开始的起止行和摘录；渲染后的引用使用 `path:start-end`。空结果会建议采用更窄或同义的查询。

`SkillSearchError` 保持为带稳定 code 的结构化工具失败。呈现器会公开通用的等待中搜索，并按相对文件与起始行对已完成的可回放元数据分组。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节说明消费方适配器；自动生成的[工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-skill-search)拥有确切 schema。

### 设计理念

插件在 `ctx.tools` 上注册一个类型化工具。执行会校验调用方输入，借用当前 agent 上下文进行作用域搜索，并把提供方中立命中项映射为稳定的结构化输出。文本渲染和呈现元数据都从同一输出派生，因此回放不需要在线搜索提供方。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 工具 schema、校验、搜索委托、文本渲染与纯呈现元数据 |
| — | 不发布运行时不变式伴生入口；核心工具注册表拥有注册、执行与处置。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

请阅读以下页面，了解搜索服务、本地提供方和搜索前的 Skill 加载工作流。

- [Skill 子系统参考](../../../docs/subsystems/skills.zh.md)——提供方中立搜索词汇与自动生成的服务 API。
- [skill-search 包](../skill-search/README.zh.md)——语料声明、作用域选择与结构化错误。
- [skill-search-local 包](../skill-search-local/README.zh.md)——本地索引与检索提供方。
- [tool-skill 包](../tool-skill/README.zh.md)——搜索参考资料前使用的目录与 `skill` 加载工具。

-----

<a id="model-experience"></a>
## 模型体验

### 工具 schema

#### 模型看到的内容

模型会看到自动生成的 [`skill_search` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-skill-search)。其描述要求模型搜索已加载 Skill 的声明语料以回答事实或 API 问题，并引用相对路径和行范围。

#### Token 影响

可见工具会给每次请求增加固定的 schema 成本。

#### KV Cache 影响

当工具定义与作用域可见性不变时，稳定 schema 会保留已经可复用的请求前缀。可见性变化会从该次请求开始改变请求工具列表。

### 工具结果

#### 模型看到的内容

每次成功调用都会追加排序后的引用与摘录，或稳定的空结果提示。结构化失败会保留 `SkillSearchError` 的名称、code 与诊断。

#### Token 影响

结果成本为追加式，并随所选命中项数量和摘录长度增长。

#### KV Cache 影响

每个持久 `tool/result` 都会追加新后缀，不替换之前可复用的 token。查询、limit、语料 revision 或排序变化会改变该后缀。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明向模型公开的搜索工作流。

- **每次调用一个 Skill**——工具不会在一次调用中聚合或比较多个已声明的 Skill 语料。
- **不自动检索**——模型必须加载 Skill 并调用 `skill_search`；插件不会注入段落或启动后台索引。
- **引用由提供方拥有**——有用的相对路径和行范围依赖所选提供方保留来源位置。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
