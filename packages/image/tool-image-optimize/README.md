---
description: "Model-facing image optimization over durable images admitted in the current user turn."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-image-optimize

English | [中文](README.zh.md)

## Summary

Register the `image_optimize` tool, provide the shared `ctx.imageInputImages` current-turn inventory, and resolve one-based positions against direct-user images admitted for the live Agent's current turn. The tool returns the complete provider-neutral `ImageOptimizationResult`; preparation is deterministic and offline, calls no image or auxiliary model, reads no executor credential, and does not execute the specification.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount the Tool Consumer after `dsh-tools` and `dsh-image-optimizer`:

```yaml
- name: '@deepseek-ai/dsh-tool-image-optimize'
```

`image_optimize` requires `ToolRunContext.agent`. Its `references[].inputIndex` values are one-based positions in direct-user image content admitted by `agent/pre-step`; plugin-authored images and prior-turn images are unavailable. Later accepted steps in the same turn append images in message and content order, a new turn replaces the list, and `agent/disposed` clears it. A nonpositive or unsafe position returns `INVALID_ARGUMENTS` before lookup; a valid missing position returns `IMAGE_REFERENCE_NOT_FOUND` before Provider work.

The plugin publishes that inventory through `ctx.imageInputImages`. `image_optimize` resolves request ordinals from it, and prepared `image_generate` execution reads the same defensive-copy lookup so both Consumers interpret a position identically.

The request schema rejects undeclared fields at the root and in every nested object. It exposes generation, edit, and variation operations, reference roles, exact text, output requirements, preservation and prohibition lists, locale, optional category and template selection, style and scene hints, and case IDs. The optimizer validates positive safe integers and cross-field requirements. `needs_clarification` is a successful structured result, not a Tool failure.

<a id="understand-the-implementation"></a>
## Understand the implementation

The pre-step listener always awaits `next()` and observes only the returned `enter.messages`, so later listeners control the accepted input. Capture state is a `WeakMap` keyed by live Agent and never scans Session events. The process-local `ctx.imageInputImages` Provider returns a defensive copy and is owned by this plugin's lifecycle. Tool presentation is pure: the result card reads only the persisted metadata projection containing status, operation, evidence IDs, warnings, and issue codes. No local path or Provider prompt body enters metadata.

No runtime invariant companion is published. The captured list has one owner and no independently observed relation that can diverge; admission, reset, and disposal behavior is covered by direct lifecycle and Loader-composition tests.

<a id="model-experience"></a>
## Model Experience

### Image optimization tool

#### What the model sees

The model sees the `image_optimize` schema and one compact JSON text block containing the complete `ImageOptimizationResult`. Prepared results include the canonical prompt, durable references, output requirements, selected evidence, and warnings. Clarification results include issue codes, paths, and messages.

#### Token effect

Variable. The tool adds one schema to prompt assembly and returns the optimizer's complete bounded result. It makes no auxiliary model request.

#### KV Cache effect

The tool schema changes the assembled tool-schema prefix when the plugin is mounted or removed. Each result changes only the tool-result suffix for its call.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Current live input only** — positions cannot address images from earlier turns or non-user messages.
- **No image executor** — `prepared` means instructions are ready for a separately authorized executor; it does not mean an image was generated.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
