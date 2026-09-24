---
description: "Package map for provider-neutral image optimization, reusable guidance Providers, and model-facing Consumers."
kind: "package-group"
---

# image/ — image optimization capability family

English | [中文](README.zh.md)

## Summary

The `image/` group turns a structured generation, edit, or variation request into a provider-neutral `ImageGenerationSpec`. Its four roles are the optimizer Service Definition, offline guidance Provider, packaged workflow Skill provider, and model-facing Tool Consumer. Optimization is deterministic preparation only: packages in this group do not execute an image model or use executor credentials.

## Table of Contents

- [Packages](#packages)
- [Capability ownership](#capability-ownership)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

The group includes the Service Definition, offline library Provider, packaged Skill provider, and current-input Tool Consumer.

| Package | Role | ctx key |
|---|---|---|
| [`image-optimizer/`](image-optimizer/README.md) | Provider registry contract, candidate validation, and optimization request/result types | `ctx.imageOptimizer` |
| [`image-optimizer-library/`](image-optimizer-library/README.md) | Integrity-checked offline templates, cases, tags, sources, and deterministic matching | `image-optimizer-library` Provider |
| [`skill-image-generation/`](skill-image-generation/README.md) | Packaged preparation workflow for generation, editing, and variation requests | `image-generation` Skill provider |
| [`tool-image-optimize/`](tool-image-optimize/README.md) | Current-turn direct-user image resolution and the model-facing `image_optimize` tool | `ctx.tools` Consumer |

-----

<a id="capability-ownership"></a>
## Capability ownership

The Service Definition owns provider-independent requests, validated candidate metadata, stable failures, selection limits, and prepared specifications. Providers own their source material, ranking inputs, candidate matching, or packaged workflow text. The Tool Consumer owns the model-visible schema, current-turn attachment ordinals, and result rendering. Executor authorization and execution stay outside this family; an executor must accept only `prepared`.

-----

<a id="related-documentation"></a>
## Related documentation

- [Image optimization subsystem](../../docs/subsystems/image-optimization.md) — public types, role ownership, attachment transport, and service configuration.
- [Capability seams](../../docs/capability-seams.md) — Service Definition / Service Provider / Consumer responsibilities.
- [Attachment capability](../attachment/README.md) — durable image references carried by prepared specifications.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
