---
description: "持久图片附件能力族的包映射：你可以用图片附件做什么，以及你的图片存放在哪里。"
kind: "package-group"
---

# attachment/：持久附件能力族

[English](README.md) | 中文

## 概述

`attachment/` 组提供持久图片附件和辅助图片生成。存储包负责接受、持久化、重放并投影光栅图片。生成包调用已配置的图片路由，通过 `ctx.attachments` 提交成功的字节，并通过模型 tool 暴露持久结果。产品 composition 仍负责挂载生成包并选择路由。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

这些包提供持久图片存储和可选生成；每个 README 描述本包自己的配置与失败行为。

| 包 | 角色 | ctx 键 |
|---|---|---|
| [`attachment/`](attachment/README.zh.md) | 可用于提示词与命令、会持久保存并回到历史中的图片附件 | `ctx.attachments` |
| [`attachment-local/`](attachment-local/README.zh.md) | 把附加图片存储在本机 `DSH_HOME` 下 | 注册到 `ctx.attachments` |
| [`image-generation/`](image-generation/README.zh.md) | 调用已配置的图片路由，并把成功输出提交为附件 | `ctx.imageGeneration` |
| [`tool-image-generate/`](tool-image-generate/README.zh.md) | 向当前 Agent 提供 `image_generate` Consumer | 注册到 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相关文档

先从子系统参考了解服务约定，再看能力 seam 表与本地后端的配置面。

- [附件子系统参考](../../docs/subsystems/attachment.zh.md)——服务约定、载荷类型与 `ctx.attachments` 的 Cordis 接口面。
- [能力 seam](../../docs/capability-seams.zh.md)——本家族遵循的 Service Definition / Service Provider / Consumer 拆分。
- [生成配置目录](../../docs/config-catalog.zh.md#deepseek-aidsh-attachment-local)——本地后端的每个受支持字段。

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
