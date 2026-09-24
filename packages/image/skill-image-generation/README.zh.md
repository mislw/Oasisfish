---
description: "随包附带的指令，用于在执行前准备图片生成、编辑和变体请求。"
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-image-generation

[English](README.md) | 中文

## 概述

Agent（智能体）可以加载与提供方无关的工作流，用于组织图片生成、编辑和变体请求，调用 `image_optimize`，并把已准备规范交给另行授权的执行器。本包只包含指令；准备过程不选择模型、不使用执行器凭据、不调用图片服务，也不提供网络访问。

## 目录

- [使用本包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

将本提供方与 skill 注册表及 `dsh-tool-skill` 一同挂载，即可在会话目录中提供 `image-generation`。需要执行图片任务的部署必须另行提供 `image_optimize` 和图片执行器。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-skill-image-generation'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `assetRoot` | 包内的 `assets/` | 包含 `image-generation/SKILL.md` 的绝对资源目录；部署可将其放在应用归档之外。 |

相对路径、资源缺失或 skill 文件的 YAML frontmatter 缺少描述都会导致激活失败。卸载插件会移除其候选项。项目和用户 skill 的优先级仍由 skill 注册表负责。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现细节 - 点击展开</summary>

提供方在激活时从随包 YAML frontmatter 读取候选项描述，并在加载时返回不含该元数据的指令正文。加载后的 skill 暴露其文件系统目录，供需要资源路径的消费者使用。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 提供方注册与配置资源路径。 |
| [`assets/image-generation/SKILL.md`](assets/image-generation/SKILL.md) | 与模型无关的准备工作流。 |
| - | 不发布运行时不变量伴随入口：提供方拥有一个不可变候选项，skill 注册表负责注册生命周期和优先级。 |

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [skill 注册表](../../skill/skill/README.zh.md) - 发现与优先级。
- [skill 工具](../../skill/tool-skill/README.zh.md) - 模型可见目录与正文。
- [图片优化器](../image-optimizer/README.zh.md) - 请求验证与准备后的规格。

-----

<a id="model-experience"></a>
## 模型体验

通过 `dsh-tool-skill` 间接呈现，由其渲染目录项与选中的指令正文。

#### KV 缓存影响

挂载提供方会增加一个目录项；加载 skill 时，其正文进入既有 skill 工具的插入位置。提供方不另增提示词分区。

## 已知限制与暂缓事项

<a id="known-limitations-and-deferred-work"></a>

- 提供方不安装 `image_optimize`、图片执行器、模型或网络凭据。
- 工作流可以准备请求，但没有执行器结果时无法确认生成成功。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 - 点击展开</summary>

无。

</details>
