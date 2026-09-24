---
description: "Model-facing image_generate tool that refines image requests, selects direct-user references, and records durable generated-image results."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-image-generate

English | [中文](README.zh.md)

## Summary

Give the conversation model an `image_generate` tool for creating or editing durable image candidates. Prepared mode executes the prompt, selected references, output settings, and required capabilities returned by `image_optimize`; direct mode expands a brief request into one detailed English prompt and exactly four variations. The tool records only durably committed results and concludes the turn without another model call. Successful result metadata preserves the actual provider and model for the Client presenter.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this Consumer after `ctx.tools` and `ctx.imageGeneration` are available.

### When to choose it

Choose this package when the current Agent should decide when to generate an image and the result must remain available through session replay. Avoid it when image generation is driven only by a fixed workflow or when a product must collect provider-specific arguments that are not in the tool schema.

### Minimal configuration

The tool requires one timeout and the image-generation service.

```yaml
- name: '@deepseek-ai/dsh-tool-image-generate'
  config:
    timeoutMs: 180000
```

| Field | Default | Meaning |
|---|---|---|
| `timeoutMs` | required | Cooperative limit for provider work, downloads, and attachment commit |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-tool-image-generate) is the exhaustive source for accepted fields and JSDoc.

### Execution modes

Prepared mode accepts only the executor fields from one ready `image_optimize` result. It selects exact one-based positions from the shared current-turn direct-user image inventory in `prepared.references`, uses the prepared candidate count subject to the image-generation service's configured limit, maps paired positive width and height values to the provider size, and forwards the aspect ratio, transparency choice, and required capabilities. Mixing prepared and direct arguments fails instead of overriding the prepared specification.

Direct mode requires a refined prompt and exactly four variation prompts. The tool derives messages from the executing Agent's non-seeded Session and scans backward for the latest message whose role and source are both direct user input. Images inherited through a fork, plugin-authored images, and other indirect messages are ignored. The model may set `use_reference_images` to `false`; otherwise all eligible images are sent to the service, and reference editing defaults to high quality when no quality is supplied.

### Completion and durable metadata

Partial success is valid in both modes. The rendered result contains fixed selection text plus durable image blocks, while presentation metadata records each attachment id, actual provider, actual model, and failed count; direct mode also records the variation at the original candidate position. The tool concludes the turn only after generation succeeds, so no extra conversation-model response follows it.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin registers one effect-owned tool definition. Its executor validates the selected mode, resolves authorized references, delegates provider and storage work to `ctx.imageGeneration`, then records a structured value. The tool runtime owns result rendering, persisted presentation metadata, turn conclusion, timeout, and disposal.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Tool schema, reference selection, service call, result blocks, metadata, and turn conclusion |
| — | No runtime invariant companion is published; one effect-owned tool registration and one executor operation own all observable relations. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read the provider service for route and commit behavior, then the UI presenter for replayed results.

- [Image generation service](../image-generation/README.md) — provider routes, fallback, cancellation, and durable commit.
- [Attachment seam package](../attachment/README.md) — durable image reference semantics.
- [Attachment Client UI](../../client/ui-attachment/README.md) — keyed result presenter and session-authorized gallery.
- [Generated tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-image-generate) — model-visible schema generated from the source.

-----

<a id="model-experience"></a>
## Model Experience

### Tool schema

#### What the model sees

The model sees the generated [`image_generate` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-image-generate) and is instructed to use it for image creation or editing. After `image_optimize` returns a ready specification, the model copies only its prepared executor fields into `prepared`. Without that result, direct mode expands the request into one coherent English prompt, preserves explicit text and reference constraints, and supplies exactly four short variations. No hidden second prompt-refinement request occurs.

#### Token effect

The schema adds a fixed cost to each request where this tool is visible.

#### KV Cache effect

Prefix-stable while the definition and visibility remain unchanged. Preset, lifecycle, or scope changes may invalidate reuse from this schema.

### Generated image result

#### What the model sees

The result contains `已生成 N 个方案，请选择。` and every successful durable image block. The tool concludes the turn after the result is recorded, so the current conversation model is not called again for closing text.

#### Token effect

The retained text is fixed and small. A later adapter that includes a generated image may incur image tokens.

#### KV Cache effect

Append-only. The result follows the reusable request prefix and does not invalidate earlier entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits describe the two execution modes and provider-neutral schema.

- **Direct mode always creates four candidates** — prepared mode can use another positive candidate count, but the image-generation service rejects counts above its configured `maxCandidates`.
- **Prepared references use the optimizer's current-turn inventory** — positions follow admitted direct-user images across accepted steps in message and content order; a new turn replaces the inventory.
- **Direct references use only the latest direct-user image message** — direct mode may use all images from that message. Fork-inherited and older images are never direct-mode references.
- **Prepared capabilities must be executable** — the service rejects unknown requirements instead of silently degrading them; provider-specific masks, output formats, seeds, and other unsupported controls remain unavailable.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
