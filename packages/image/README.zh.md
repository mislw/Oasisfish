---
description: "提供方无关图像优化、可复用指导 Provider 与面向模型 Consumer 的包索引。"
kind: "package-group"
---

# image/ — 图像优化能力系列

[English](README.md) | 中文

## 概述

`image/` 组把结构化的生成、编辑或变体请求转换为提供方无关的 `ImageGenerationSpec`。其四种角色是 optimizer Service Definition、离线指导 Provider、随包工作流 Skill provider 与面向模型的 Tool Consumer。优化只执行确定性准备：本组各包不执行图像模型，也不使用执行器凭据。

## 目录

- [包](#packages)
- [能力归属](#capability-ownership)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

本组包括 Service Definition、离线库 Provider、随包 Skill provider 与当前输入 Tool Consumer。

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`image-optimizer/`](image-optimizer/README.zh.md) | Provider 注册表约定、候选项校验与优化请求／结果类型 | `ctx.imageOptimizer` |
| [`image-optimizer-library/`](image-optimizer-library/README.zh.md) | 经完整性校验的离线模板、案例、标签、来源与确定性匹配 | `image-optimizer-library` Provider |
| [`skill-image-generation/`](skill-image-generation/README.zh.md) | 用于生成、编辑与变体请求的随包准备工作流 | `image-generation` Skill provider |
| [`tool-image-optimize/`](tool-image-optimize/README.zh.md) | 当前 turn 直接用户图像解析与面向模型的 `image_optimize` 工具 | `ctx.tools` Consumer |

-----

<a id="capability-ownership"></a>
## 能力归属

Service Definition 负责提供方无关请求、已校验候选项元数据、稳定失败、选择限制与已准备规范。Provider 负责自身来源材料、排名输入、候选项匹配或随包工作流文本。Tool Consumer 负责模型可见 schema、当前 turn 附件序号与结果渲染。执行器授权与执行不属于本系列；执行器必须只接受 `prepared`。

-----

<a id="related-documentation"></a>
## 相关文档

- [图像优化子系统](../../docs/subsystems/image-optimization.zh.md) — 公开类型、角色归属、附件传输与服务配置。
- [能力 seam](../../docs/capability-seams.zh.md) — Service Definition／Service Provider／Consumer 职责。
- [附件能力](../attachment/README.zh.md) — 已准备规范携带的持久图像引用。

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
