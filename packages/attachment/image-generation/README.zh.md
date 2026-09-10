# @deepseek-ai/dsh-image-generation

[English](README.md) | 中文

Host 侧的辅助生图能力，调用 OpenAI-compatible 提供方路由。`image-generation` 设置命名空间保存主路由和可选的备用路由。一次请求可以并行发起多个独立候选；每个候选先尝试主路由，非取消失败后再尝试备用路由。成功候选按请求顺序通过 `ctx.attachments` 持久化，某些候选失败不会丢弃其余结果。Images API 路由接受 Base64 图片或 HTTP(S) URL 响应；`chat/completions` 路由请求文本与图片模态，并为每个候选接受一张以 Markdown 嵌入的图片 Data URL。

JSON 失败响应中的短 `error.message` 或顶层 `message` 可以进入工具错误。服务会统一空白、截断详情并隐藏解析出的 API Key；非 JSON 和无法识别的响应正文不会显示。

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `provider` | 空 | 初始提供方；通常由“模型与中转站”页面写入。 |
| `model` | 空 | 初始生图模型 ID。 |
| `endpointPath` | `images/generations` | 追加到提供方 Base URL 下的相对路径。对于通过 OpenAI-compatible 聊天响应返回 Markdown 图片 Data URL 的模型，使用 `chat/completions`。 |
| `editEndpointPath` | `images/edits` | 请求包含参考图时使用的相对路径。 |
| `fallbackProvider` | 空 | 主路由非取消失败后尝试的可选备用提供方。 |
| `fallbackModel` | 空 | 与 `fallbackProvider` 配对的生图模型 ID。 |
| `fallbackEndpointPath` | `images/generations` | 备用路由用于文本生图的相对路径。 |
| `fallbackEditEndpointPath` | `images/edits` | 备用路由用于参考图编辑的相对路径。 |
| `maxResponseBytes` | `25000000` | Images API JSON 或下载图片的最大字节数。 |

## 模型体验

### 工具结果附件

#### 模型看到的内容

该 Host 服务本身不增加提示词或 Schema。通过 `image_generate` Consumer，模型可见结果包含“已生成 N 个方案，请选择。”，随后是全部成功图片块。图片字节保存在会话日志之外，每个图片块携带可持久读取的附件引用。

#### Token 影响

固定文字结果会保留到压缩发生。后续请求再次包含图片时，会产生所选模型适配器对应的图片 token 成本。

#### KV Cache 影响

仅追加。新工具结果位于可复用请求前缀之后；后续提供方图片投影只会改变受影响的后缀。

## 已知限制与后续工作

- 参考图请求要求使用 Images API 路由，并把全部输入图片发送到 `POST /images/edits`，但不附带蒙版；chat-completions 路由不接受参考图、尺寸或质量控制。候选差异会追加到共同 prompt；当前不开放提供方专属的蒙版、背景和输出格式控制。
- 所选 `llm-pi-ai` 路由必须显式配置 `baseURL`；当前不会解析仅由内置目录隐式提供端点的路由。
