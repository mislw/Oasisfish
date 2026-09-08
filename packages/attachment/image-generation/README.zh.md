# @deepseek-ai/dsh-image-generation

[English](README.md) | 中文

Host 侧的辅助生图能力，调用 OpenAI-compatible Images API 路由。`image-generation` 设置命名空间保存 `provider`、`model`、`endpointPath` 和 `editEndpointPath`；执行时从 `llm-pi-ai` 读取所选中转站，通过 `ctx.credentials` 解析凭证，并根据请求调用文本生图或参考图编辑。服务接受 Base64 图片或 HTTP(S) URL 响应，验证图片格式后通过 `ctx.attachments` 持久化结果。

JSON 失败响应中的短 `error.message` 或顶层 `message` 可以进入工具错误。服务会统一空白、截断详情并隐藏解析出的 API Key；非 JSON 和无法识别的响应正文不会显示。

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `provider` | 空 | 初始提供方；通常由“模型与中转站”页面写入。 |
| `model` | 空 | 初始生图模型 ID。 |
| `endpointPath` | `images/generations` | 追加到提供方 Base URL 下的相对路径。 |
| `editEndpointPath` | `images/edits` | 请求包含参考图时使用的相对路径。 |
| `maxResponseBytes` | `25000000` | Images API JSON 或下载图片的最大字节数。 |

## 模型体验

### 工具结果附件

#### 模型看到的内容

该 Host 服务本身不增加提示词或 Schema。通过 `image_generate` Consumer，模型会看到一段标明辅助提供方/模型的文本，随后是生成图片块。图片字节保存在会话日志之外，图片块携带可持久读取的附件引用。

#### Token 影响

文本结果随数据变化并保留到压缩发生。后续请求再次包含图片时，会产生所选模型适配器对应的图片 token 成本。

#### KV Cache 影响

仅追加。新工具结果位于可复用请求前缀之后；后续提供方图片投影只会改变受影响的后缀。

## 已知限制与后续工作

- 每次请求返回一张图片。参考图请求会把全部输入图片发送到 `POST /images/edits`，但不附带蒙版；当前不开放变体、蒙版、背景和输出格式控制。
- 所选 `llm-pi-ai` 路由必须显式配置 `baseURL`；当前不会解析仅由内置目录隐式提供端点的路由。
