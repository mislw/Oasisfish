---
description: "通过已配置的 OpenAI-compatible 路由提供辅助图片生成，支持备用路由、参考图编辑与持久附件提交。"
kind: "package-reference"
---

# @deepseek-ai/dsh-image-generation

[English](README.md) | 中文

## 概述

通过已配置的 OpenAI-compatible 路由生成一张或多张候选图片，并把每个成功结果保存为持久附件。每个候选先尝试主路由，再在非取消的提供方失败后尝试一次可选备用路由。Images API 路由支持生成、参考图编辑及显式透明或不透明背景；`chat/completions` 路由支持生成的 Markdown 图片 Data URL。服务会拒绝无法执行的必需 capability，而不是静默降级，并且本身不追加会话事件。

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

当 composition 需要辅助图片路由，并要求成功字节成为普通持久附件时，挂载本插件。

### 何时选择

当提供方暴露 OpenAI-compatible Images API，或从 `chat/completions` 返回一张以 Markdown 嵌入的图片 Data URL 时，选择本包。composition 还必须挂载 settings、凭据或启动环境解析，以及附件 provider。当生成字节必须留在提供方侧，或路由要求本包请求字段之外的提供方专属控制时，不要选择本包。

### 最小配置

在提供 `ctx.settings` 与 `ctx.attachments` 的包之后挂载本插件，并选择 `llm-pi-ai` 提供方设置中声明的路由。

```yaml
- name: '@deepseek-ai/dsh-image-generation'
  config:
    provider: relay
    model: gpt-image-1
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `provider` | 空 | 初始主提供方路由；实时设置 section 可以替换它 |
| `model` | 空 | 初始主图片模型 ID |
| `endpointPath` | `images/generations` | 主生成路径；`chat/completions` 选择 Markdown Data URL 解码 |
| `editEndpointPath` | `images/edits` | 存在参考图时使用的主路径 |
| `fallbackProvider` | 空 | 主路由非取消失败后尝试的可选提供方 |
| `fallbackModel` | 空 | 与 `fallbackProvider` 配对的模型 |
| `fallbackEndpointPath` | `images/generations` | 备用生成路径 |
| `fallbackEditEndpointPath` | `images/edits` | 备用参考图编辑路径 |
| `maxResponseBytes` | `25000000` | 提供方 JSON 正文或下载图片正文的最大字节数 |
| `maxCandidates` | `4` | 单次调用接受的独立生成候选项上限 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-image-generation)完整列出了每个受支持字段及其 JSDoc。

### 生成与备用路由

一次请求最多可以独立启动 `maxCandidates` 个候选。每个候选把共同 prompt 与可选差异发送给主路由，并且只在非取消的生成失败后尝试已配置的备用路由。部分成功会按候选顺序保留，每张图片都带有原始的零基 `candidateIndex`。取消会阻止备用请求；持久附件提交失败会直接返回，绝不会启动另一个提供方请求。

### 参考图与持久结果

Images API 路由通过 `ctx.attachments` 读取每个持久引用，并把 multipart 数据发送到编辑路径。请求指定背景透明度时，生成与编辑请求会携带对应的 `transparent` 或 `opaque` 提供方字段。成功的提供方响应经过解码与光栅类型校验，只有 `saveImage` 完成后，候选才会出现在返回批次中。每个已提交引用都附带提供方与模型身份。返回的 HTTP(S) 图片 URL 不得含内嵌凭据，且只能解析到公开地址；下载连接固定到已校验地址、不跟随重定向、不发送路由凭据，并受配置的字节上限限制。

### 必需 capability

服务接受对精确文字、本地编辑、多张参考图、透明背景与匹配纵横比的准备要求。每项要求都必须与具体请求字段一致。纵横比要求需要传输比例相同的像素尺寸；只有纵横比 metadata 并不充分。`chat/completions` 路由无法传输透明背景控制，因此会拒绝必需的透明背景。任何未知或未满足的要求都会在提供方工作之前拒绝操作，因此准备规格绝不会静默丢失必需行为。

### 可能出什么问题

必需 capability 不受支持，或所选路由缺失、没有 Base URL 或凭据、返回不受支持的响应、超过字节限制，或产生不受支持的光栅签名字节时，生成会失败。受阻的图片 URL 报告 `IMAGE_DOWNLOAD_BLOCKED`；固定连接失败报告 `IMAGE_DOWNLOAD_FAILED`，不会暴露 URL 或传输细节。提供方 HTTP 失败只暴露稳定错误码与状态摘要。所有候选路由都耗尽时请求会拒绝；候选结果混合时返回已提交图片与失败数量。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

服务安装 `image-generation` 设置 section，并为每次调用解析当前选择。候选任务不共享提供方状态，并一起 settle；每个任务先提交自己的字节，批次再收集 fulfilled 结果。提供方适配器保留为私有 helper，使备用策略、取消与附件发布留在服务内部。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服务、实时设置、路由执行、备用、取消与附件提交 |
| [`src/openai-compatible.ts`](src/openai-compatible.ts) | 端点解析、响应解码、URL 检查与光栅签名识别 |
| — | 不发布运行时不变式伴生入口；路由选择与附件发布在同一个服务操作内强制执行，不存在可独立分歧的观察。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

先阅读附件服务，再阅读调用本包的模型 Consumer。

- [附件 seam 包](../attachment/README.zh.md)——持久图片引用与存储操作。
- [`image_generate` 工具](../tool-image-generate/README.zh.md)——面向模型的提示词优化、参考图选择与结果记录。
- [生成配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-image-generation)——完整配置声明。
- [能力 seam](../../../docs/capability-seams.zh.md)——Service Definition、Provider 与 Consumer 角色如何组合。

-----

<a id="model-experience"></a>
## 模型体验

### 工具结果附件

#### 模型看到的内容

该 Host 服务本身不贡献提示词或 Schema。通过 `image_generate` Consumer，模型可见结果包含“已生成 N 个方案，请选择。”，随后是每个已提交图片块。生成字节保存在会话日志之外；每个块携带持久附件引用。

#### Token 影响

固定文字结果会保留到压缩发生。后续请求包含生成图片时，会产生所选模型适配器对应的图片 token 成本。

#### KV Cache 影响

仅追加。工具结果位于可复用请求前缀之后；后续图片投影只改变受影响的后缀。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制描述本服务当前支持的提供方中立控制。

- **参考图编辑与透明背景要求 Images API 路由**——全部参考图都发送到编辑路径且不附带蒙版；`chat/completions` 拒绝参考图、尺寸、质量与透明背景请求。
- **路由需要显式 Base URL**——不会解析端点为隐式值的提供方目录条目。
- **提供方专属控制有限**——会传输背景透明度，但不开放蒙版、输出格式、随机种子及其他专有字段。未知必需 capability 会失败，不会降级。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
