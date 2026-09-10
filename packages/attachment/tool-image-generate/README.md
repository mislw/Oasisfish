# @deepseek-ai/dsh-tool-image-generate

English | [中文](README.zh.md)

Model-facing `image_generate` Consumer over `ctx.imageGeneration`. Its schema tells the current conversation model to refine a brief request into one detailed generation-ready English prompt and four concise candidate differences before the call. The tool automatically reuses images from the latest direct user message as edit references, launches four independent candidates, keeps partial success, and returns `已生成 N 个方案，请选择。` plus the durable image blocks. A successful call concludes the turn immediately, so the conversation model is not called again for a closing message.

## Config

| Key | Meaning |
|---|---|
| `timeoutMs` | Cooperative tool-call timeout enforced by the shared timeout policy. |

## Model Experience

### Tool schema

#### What the model sees

The model sees the generated [`image_generate` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-image-generate) and is instructed to use it when a user asks to create, draw, render, generate, or edit an image. Before calling, the same conversation-model turn expands brief wording into a coherent English prompt with task-relevant subject, environment, composition, camera, lighting, materials, color, spatial relationships, finish, and exclusions while preserving explicit text and reference constraints. It also supplies four short `variation_prompts` that change composition, material, light, camera, or graphic structure without changing shared requirements. This refinement does not make a hidden second conversation-model request. Other arguments are optional provider-supported `size` and `quality`, and `use_reference_images`. The tool uses the latest direct user message containing images by default; the model sets `use_reference_images` to `false` only when the requested image must be independent of those inputs. Reference-image requests default to high output quality.

#### Token effect

Fixed schema cost on every request where the tool is visible.

#### KV Cache effect

Prefix-stable while the definition and visibility remain unchanged. Preset changes, plugin lifecycle, or scoped restrictions may invalidate reuse from this schema.

### Generated image result

#### What the model sees

The result contains `已生成 N 个方案，请选择。` and every successful image attachment. The tool concludes the turn after the result is recorded; the conversation model selection is unchanged and no closing model request is made.

#### Token effect

The retained result text is fixed and small. Subsequent requests may incur image tokens when their adapter includes the durable image block.

#### KV Cache effect

Append-only; the result follows the reusable request prefix and does not invalidate earlier entries.

## Known Limitations and Deferred Work

- The tool requests four candidates per call and accepts partial success. It can select output quality and reference-image reuse, while provider-specific masks, backgrounds, and output formats remain out of the model-facing schema.
- Prompt refinement improves the instruction sent to the configured image model; fallback behavior depends on the optional route configured by the Host and does not expand either model's native rendering capability.
