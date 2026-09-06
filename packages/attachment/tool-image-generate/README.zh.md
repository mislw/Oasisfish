# @deepseek-ai/dsh-tool-image-generate

[English](README.md) | 中文

面向模型的 `image_generate` Consumer，调用 `ctx.imageGeneration`。工具接收完整图片描述和输出控制参数，自动复用最近一条直接用户消息中的图片作为编辑参考，保持当前对话模型不变，并在工具结果中返回文字与可持久读取的图片附件。

## 配置

| 键 | 含义 |
|---|---|
| `timeoutMs` | 由共享超时策略执行的协作式工具调用时限。 |

## 模型体验

### 工具 Schema

#### 模型看到的内容

模型会看到生成的 [`image_generate` Schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-image-generate)，并被要求在用户提出生成、绘制、渲染或编辑图片时调用。参数包括必填的完整 `prompt`、可选的提供方支持 `size` 和 `quality`，以及 `use_reference_images`。工具默认使用最近一条包含图片的直接用户消息；只有当目标图片必须与这些输入无关时，模型才把 `use_reference_images` 设为 `false`。参考图请求默认使用高输出质量。

#### Token 影响

该工具可见时，每次请求都会产生固定的 Schema 成本。

#### KV Cache 影响

工具定义与可见性不变时前缀稳定。预设变化、插件生命周期或作用域限制可能从该 Schema 起影响复用。

### 生成图片结果

#### 模型看到的内容

结果先标明辅助提供方/模型，再包含生成图片附件。当前对话模型选择保持不变。

#### Token 影响

保留的结果文本很短并随数据变化。后续请求的适配器包含该耐久图片块时，可能产生图片 token。

#### KV Cache 影响

仅追加；结果位于可复用请求前缀之后，不会使此前条目失效。

## 已知限制与后续工作

- 每次调用只生成一张图片。模型可以选择输出质量和是否复用参考图，但提供方专属的蒙版、背景、输出格式和变体选项暂不进入工具 Schema。
