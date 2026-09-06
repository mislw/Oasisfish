# @deepseek-ai/dsh-tool-image-generate

English | [中文](README.zh.md)

Model-facing `image_generate` Consumer over `ctx.imageGeneration`. It accepts a complete image prompt and output controls, automatically reuses images from the latest direct user message as edit references, keeps the conversation model unchanged, and returns text plus a durable image block in the tool result.

## Config

| Key | Meaning |
|---|---|
| `timeoutMs` | Cooperative tool-call timeout enforced by the shared timeout policy. |

## Model Experience

### Tool schema

#### What the model sees

The model sees the generated [`image_generate` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-image-generate) and is instructed to use it when a user asks to create, draw, render, generate, or edit an image. Its arguments are a required complete `prompt`, optional provider-supported `size` and `quality`, and `use_reference_images`. The tool uses the latest direct user message containing images by default; the model sets `use_reference_images` to `false` only when the requested image must be independent of those inputs. Reference-image requests default to high output quality.

#### Token effect

Fixed schema cost on every request where the tool is visible.

#### KV Cache effect

Prefix-stable while the definition and visibility remain unchanged. Preset changes, plugin lifecycle, or scoped restrictions may invalidate reuse from this schema.

### Generated image result

#### What the model sees

The result names the auxiliary provider/model and includes the generated image attachment after that text. The conversation model selection is unchanged.

#### Token effect

The retained result text is small and data-dependent. Subsequent requests may incur image tokens when their adapter includes the durable image block.

#### KV Cache effect

Append-only; the result follows the reusable request prefix and does not invalidate earlier entries.

## Known Limitations and Deferred Work

- The tool creates one image per call. It can select output quality and reference-image reuse, while provider-specific masks, backgrounds, output formats, and variations remain out of the model-facing schema.
