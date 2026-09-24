---
description: "Provider-neutral image optimization Service Definition, validated configuration, and public request/result types."
kind: "package-reference"
---

# @deepseek-ai/dsh-image-optimizer

English | [中文](README.zh.md)

## Summary

Define `ctx.imageOptimizer` for provider-neutral image generation, editing, and variation preparation. The package validates requests, deployment limits, and Provider candidates; owns reversible Provider registration and deterministic candidate compilation; and publishes the request/result types. It prepares an `ImageGenerationSpec`; it does not call an image model or execute the specification.

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

Mount the Service Definition once in a Cordis composition:

```yaml
- name: '@deepseek-ai/dsh-image-optimizer'
```

The service is available as `ctx.imageOptimizer`. Provider plugins use `registerProvider(provider)` for borrowed same-process contributions; duplicate names fail registration, and the returned disposer removes the exact contribution. Consumers call `optimize(request, options)` and may transport durable `resolvedReferences` separately from the model-visible request. Cancellation is forwarded to every Provider call.

The package also declares the shared `ctx.imageInputImages` lookup used by optimizer and executor Consumers. It does not provide that lookup. `dsh-tool-image-optimize` provides the current-turn direct-user inventory, and a prepared image executor consumes the same ordering when it resolves reference ordinals.

| Field | Default | Meaning |
|---|---:|---|
| `maxCases` | `3` | Maximum automatically selected case candidates. |
| `maxPromptBytes` | `16384` | Maximum UTF-8 bytes in the complete serialized prepared result. |
| `maxExactTextEntries` | `64` | Maximum exact-text requirements accepted for one request. |

All values must be positive integers. Invalid self-contained configuration fails during plugin activation.

Provider results pass through the exported `parseCandidate()` parser before selection. The parser rejects undeclared fields and validates the normalized template/case metadata shared by every Provider. Explicit sources precede automatic matches; automatic candidates sort by score, Provider rank, Provider name, and candidate ID. Explicit cases do not consume `maxCases`; the limit applies to automatic cases.

`ImageOptimizationInputError` carries the path for invalid request structure or configured-limit overflow; Tool Consumers map it to the Tool runtime's stable invalid-argument failure. `ImageOptimizationError` carries one of six stable domain codes plus the affected request path. A successful optimization returns `status: 'prepared'`; exact-text conflicts return `status: 'needs_clarification'`. Only the prepared branch contains an `ImageGenerationSpec`.

Compilation preserves user exact text, output, preservation, and prohibitions ahead of Provider defaults. It deduplicates merged arrays by first occurrence, groups evidence by Provider, derives executor capabilities from the request, and emits canonical prompt sections in the fixed order `Task`, `References`, `Composition`, `Visual style`, `Scene`, `Exact text`, `Output`, `Preserve`, and `Avoid`. `maxPromptBytes` applies to the complete serialized prepared result encoded as UTF-8.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package owns the `ctx.imageOptimizer` Service Definition and declares the `ctx.imageInputImages` shared lookup type. Provider packages own reusable template and case sources and return one normalized candidate form. The optimization Tool Consumer provides current-turn attachment ordering and resolves optimizer requests; the generation Tool Consumer reads the same lookup when it executes prepared reference ordinals. Durable attachment references travel through `ImageOptimizerOptions.resolvedReferences`, so provider-independent request fields contain input ordinals rather than storage paths or credentials.

`src/types.ts` is runtime-free. `src/schema.ts` contains the Provider-candidate parser, `src/registry.ts` owns effect-scoped contributions and candidate ordering, `src/compiler.ts` owns validation and deterministic compilation, and `src/index.ts` owns Cordis activation and the public service.

No runtime invariant companion is published. The service has one authoritative Provider registry and no independently observed relation that can diverge; registration and disposal behavior belongs in direct service tests instead of an empty `./invariant` export.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Image capability family](../README.md) — role ownership across Service Definition, Providers, and Consumers.
- [Image optimization design](../../../docs/superpowers/specs/2026-09-20-dsh-image-optimization-design.md) — request/result semantics and deterministic compilation.
- [Attachment service](../../attachment/attachment/README.md) — durable image references used by prepared specifications.

-----

<a id="model-experience"></a>
## Model Experience

### Prepared optimization result

#### What the model sees

A Consumer may render the complete `ImageOptimizationResult` for the model. A prepared result contains the canonical prompt, constraints, output requirements, selected evidence, and warnings; a clarification result contains issue codes, paths, and messages. Provider source prompts, credentials, and local paths are not part of the public result.

#### Token effect

Variable. The complete serialized prepared result is capped by `maxPromptBytes`, and exact-text entries are capped by `maxExactTextEntries`. The optimizer makes no auxiliary model request.

#### KV Cache effect

Returning a different optimization result changes the Consumer-owned tool-result suffix. It does not rewrite the model-request prefix that precedes the tool call.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No image executor** — a `prepared` result is an executor-neutral instruction set, not a generated image; a separate executor must authorize inputs and reject every non-prepared result.
- **No standalone Provider content** — the Service Definition supplies no templates or cases by itself; deployments compose Provider packages separately.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
