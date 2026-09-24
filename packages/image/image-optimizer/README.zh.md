---
description: "提供方无关图像优化 Service Definition、已校验配置与公开请求／结果类型。"
kind: "package-reference"
---

# @deepseek-ai/dsh-image-optimizer

[English](README.md) | 中文

## 概述

为提供方无关的图像生成、编辑与变体准备定义 `ctx.imageOptimizer`。本包校验请求、部署限制与 Provider 候选项，负责可逆 Provider 注册与确定性候选项编译，并发布请求／结果类型。它准备 `ImageGenerationSpec`，不会调用图像模型或执行该规范。

## 目录

- [使用本包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 Cordis 组合中挂载一次 Service Definition：

```yaml
- name: '@deepseek-ai/dsh-image-optimizer'
```

服务通过 `ctx.imageOptimizer` 提供。Provider 插件使用 `registerProvider(provider)` 注册借用的同进程贡献；重复名称会使注册失败，返回的 disposer 会移除对应贡献。Consumer 调用 `optimize(request, options)`，并可把持久 `resolvedReferences` 与模型可见请求分开传输。取消信号会传给每次 Provider 调用。

本包还声明 optimizer 与 executor Consumer 共用的 `ctx.imageInputImages` 查询，但不提供该查询。`dsh-tool-image-optimize` 提供当前 turn 的直接用户图像清单，准备模式图像执行器在解析引用序号时使用相同顺序。

| 字段 | 默认值 | 含义 |
|---|---:|---|
| `maxCases` | `3` | 最多自动选择的 case 候选项数量。 |
| `maxPromptBytes` | `16384` | 完整序列化 prepared 结果的最大 UTF-8 字节数。 |
| `maxExactTextEntries` | `64` | 单个请求接受的 exact-text 要求上限。 |

所有值都必须是正整数。无效的自包含配置会在插件激活期间失败。

Provider 结果在选择前通过导出的 `parseCandidate()` parser。该 parser 拒绝未声明字段，并校验所有 Provider 共享的规范化 template／case 元数据。显式来源排在自动匹配之前；自动候选项依次按 score、Provider rank、Provider 名称与候选项 ID 排序。显式 case 不占用 `maxCases`；该限制只适用于自动 case。

`ImageOptimizationInputError` 携带无效请求结构或配置限制溢出的路径；Tool Consumer 将它映射为 Tool 运行时的稳定 invalid-argument 失败。`ImageOptimizationError` 携带六种稳定领域代码之一以及受影响的请求路径。成功优化返回 `status: 'prepared'`；exact-text 冲突返回 `status: 'needs_clarification'`。只有 prepared 分支包含 `ImageGenerationSpec`。

编译会把用户的 exact text、输出、保留项与禁止项置于 Provider 默认值之前，按首次出现去重合并数组，按 Provider 汇总 evidence，根据请求推导执行器 capability，并按 `Task`、`References`、`Composition`、`Visual style`、`Scene`、`Exact text`、`Output`、`Preserve`、`Avoid` 的固定顺序输出规范提示词章节。`maxPromptBytes` 作用于完整序列化 prepared 结果的 UTF-8 编码。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现内部 — 点击展开</summary>

本包负责 `ctx.imageOptimizer` Service Definition，并声明 `ctx.imageInputImages` 共享查询类型。Provider 包负责可复用 template 与 case 来源，并返回同一种规范化候选项。优化 Tool Consumer 提供当前 turn 的附件顺序并解析 optimizer 请求；生成 Tool Consumer 在执行 prepared 引用序号时读取同一查询。持久附件引用通过 `ImageOptimizerOptions.resolvedReferences` 传递，因此提供方无关请求字段包含输入序号，而不包含存储路径或凭据。

`src/types.ts` 不含运行时代码。`src/schema.ts` 包含 Provider 候选项 parser，`src/registry.ts` 负责 effect 作用域贡献与候选项排序，`src/compiler.ts` 负责校验与确定性编译，`src/index.ts` 负责 Cordis 激活与公开服务。

本包不发布运行时不变式 companion。服务只有一个权威 Provider 注册表，没有可能分歧的独立观测关系；注册与处置行为应由直接服务测试覆盖，而不是使用空的 `./invariant` 导出。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [图像能力系列](../README.zh.md) — Service Definition、Provider 与 Consumer 之间的角色归属。
- [图像优化设计](../../../docs/superpowers/specs/2026-09-20-dsh-image-optimization-design.zh.md) — 请求／结果语义与确定性编译。
- [附件服务](../../attachment/attachment/README.zh.md) — 已准备规范使用的持久图像引用。

-----

<a id="model-experience"></a>
## 模型体验

### 已准备的优化结果

#### 模型看到什么

Consumer 可以为模型渲染完整 `ImageOptimizationResult`。prepared 结果包含规范提示词、约束、输出要求、已选 evidence 与警告；clarification 结果包含 issue 代码、路径与消息。Provider 来源提示词、凭据与本地路径不属于公开结果。

#### Token 影响

可变。完整序列化 prepared 结果受 `maxPromptBytes` 限制，exact-text 条目受 `maxExactTextEntries` 限制。optimizer 不发起辅助模型请求。

#### KV Cache 影响

返回不同优化结果会改变 Consumer 所属的工具结果后缀。它不会改写工具调用之前的模型请求前缀。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **没有图像执行器** — `prepared` 结果是执行器无关的指令集，不是生成的图像；独立执行器必须授权输入，并拒绝所有非 prepared 结果。
- **没有独立 Provider 内容** — Service Definition 本身不提供 template 或 case；部署需要单独组合 Provider 包。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
