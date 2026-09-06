# Agent Note: 生图工具结果预览

Status: implemented

[English](2026-08-29-generated-image-tool-result-preview.md) | 中文

## 问题

`image_generate` 工具会把生成字节保存为持久附件，并在日志中记录 `image` 结果块，但通用工具卡会把所有非文本块展开为 JSON。因此 Session 实际保留了图片，而会话界面只能看到附件元数据。

## 决策

附件展示插件拥有 `tool.call.toolview` 中 keyed `image_generate` 条目。它的紧凑工具行从已记录的调用/结果切片推导提示词与生命周期状态，筛选已结算的 `image` 块，并通过现有 `ImageGallery`、重试控件和 `ImageLightbox` 渲染。

该注册会注入按所属 Session ID 绑定的加载器。`ConversationController.resolveImage` 成为对外 conversation service 的一部分，并继续作为消息图片与生图工具结果唯一的浏览器 URL 缓存和授权附件读取路径。重新打开 Session 时会从持久附件引用与字节重建同一预览。

## 考虑过的替代方案

**让通用工具卡渲染所有图片块。** 通用工具展示不拥有附件授权与图片交互，把未来所有非文本块都视为图片还会削弱其开放的结果块处理规则。

**把生成字节复制到 assistant 消息。** 这会复制持久内容、改变模型可见 transcript，并让展示依赖后续模型回复，而不是拥有该图片的工具结果。

## 后果

- 图片在工具结算后立即行内显示，并在重新打开 Session 后继续可用。
- 附件读取失败只影响对应缩略图，可重试读取而无需重新生图。
- 点击生图缩略图会使用与用户和 assistant 消息图片相同的原图灯箱。
- 其他工具结果继续对非文本块使用通用 JSON 回退，除非其专属 keyed renderer 接管。
