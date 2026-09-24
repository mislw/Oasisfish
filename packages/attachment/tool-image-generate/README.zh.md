---
description: "面向模型的 image_generate 工具，优化图片请求、选择直接用户参考图并记录持久生成结果。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-image-generate

[English](README.md) | 中文

## 概述

为对话模型提供 `image_generate` 工具，用于创建或编辑四个图片候选。同一个模型轮次把简短请求扩展为一个详细英文 prompt 与四条简短差异。工具可以复用最近一条直接用户消息中的图片，只记录完成持久提交的结果，并且无需另一次模型调用即可结束本轮。成功结果 metadata 会为 Client presenter 保留实际提供方与模型。

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

在 `ctx.tools` 与 `ctx.imageGeneration` 可用后挂载这个 Consumer。

### 何时选择

当当前 Agent 应自行决定何时生成图片，并且结果必须能通过会话重放继续使用时，选择本包。当图片生成只由固定 workflow 驱动，或产品必须收集工具 Schema 之外的提供方专属参数时，不要选择本包。

### 最小配置

工具需要一个超时值与图片生成服务。

```yaml
- name: '@deepseek-ai/dsh-tool-image-generate'
  config:
    timeoutMs: 180000
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `timeoutMs` | 必填 | 提供方工作、下载与附件提交的协作式时限 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-image-generate)完整列出了受支持字段及其 JSDoc。

### 参考图授权

工具从执行 Agent 的非 seeded Session 派生消息，并向后扫描角色与来源都属于直接用户输入的最近消息。通过 fork 继承、由插件创作或来自其他间接消息的图片会被忽略。模型可以把 `use_reference_images` 设为 `false`；否则选中的参考图会发送给服务，并且未提供质量时，参考图编辑默认使用高质量。

### 完成与持久 metadata

工具要求恰好四条候选差异，并请求服务生成四个独立候选。允许部分成功。渲染结果包含固定选择文字与持久图片块，presentation metadata 则记录每个附件 ID、实际提供方、实际模型、对应差异与失败数量。工具只在生成成功后结束本轮，因此之后不会再产生额外的对话模型回复。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

插件注册一个由 effect 持有的工具定义。executor 选择获授权的参考图、校验四候选关系、把提供方与存储工作委托给 `ctx.imageGeneration`，然后记录结构化值。工具 runtime 负责结果渲染、持久 presentation metadata、轮次结束、超时与卸载。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 工具 Schema、参考图选择、服务调用、结果块、metadata 与轮次结束 |
| — | 不发布运行时不变式伴生入口；一个由 effect 持有的工具注册与一个 executor 操作拥有全部可观察关系。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

先阅读 provider 服务了解路由与提交行为，再阅读 UI presenter 了解重放结果。

- [图片生成服务](../image-generation/README.zh.md)——提供方路由、备用、取消与持久提交。
- [附件 seam 包](../attachment/README.zh.md)——持久图片引用语义。
- [附件 Client UI](../../client/ui-attachment/README.zh.md)——keyed 结果 presenter 与 Session 授权 gallery。
- [生成工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-image-generate)——从源码生成的模型可见 Schema。

-----

<a id="model-experience"></a>
## 模型体验

### 工具 Schema

#### 模型看到的内容

模型会看到生成的 [`image_generate` Schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-image-generate)，并被要求将它用于图片创建或编辑。调用前，同一个模型轮次把请求扩展为一个连贯英文 prompt，同时保留明确文字与参考图约束，并提供恰好四条简短差异。可选参数选择提供方支持的尺寸、质量与参考图复用。不会发生隐藏的第二次提示词优化请求。

#### Token 影响

该工具可见时，Schema 为每次请求增加固定成本。

#### KV Cache 影响

工具定义与可见性不变时前缀稳定。preset、生命周期或作用域变化可能从该 Schema 起影响复用。

### 生成图片结果

#### 模型看到的内容

结果包含“已生成 N 个方案，请选择。”和每个成功的持久图片块。工具在结果记录后结束本轮，因此不会再次调用当前对话模型生成收尾文字。

#### Token 影响

保留文字固定且很短。后续适配器包含生成图片时，可能产生图片 token。

#### KV Cache 影响

仅追加。结果位于可复用请求前缀之后，不会使此前条目失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制描述固定候选 workflow 与提供方中立 Schema。

- **恰好四个候选**——每次调用都要求四条差异；模型不能请求其他数量。
- **只有当前 Agent 最近一条直接用户图片消息符合条件**——fork 继承图片绝不会成为参考图；一旦存在更新的符合条件图片消息，更早的图片就会被忽略。
- **缺少提供方专属控制**——蒙版、背景、输出格式与随机种子仍不进入模型可见 Schema。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
