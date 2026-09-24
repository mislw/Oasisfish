---
description: "Bundled instructions for preparing image generation, editing, and variation requests before execution."
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-image-generation

English | [中文](README.zh.md)

## Summary

Agents can load a provider-independent workflow that structures image generation, editing, and variation requests, calls `image_optimize`, and hands a prepared specification to a separately authorized executor. The package contains instructions only; preparation selects no model, uses no executor credential, calls no image service, and provides no network access.

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

Mount this provider beside the skill registry and `dsh-tool-skill` to expose `image-generation` in the session catalog. A deployment that expects execution must separately provide `image_optimize` and an image executor.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-skill-image-generation'
```

| Field | Default | Meaning |
|---|---|---|
| `assetRoot` | Packaged `assets/` | Absolute resource directory containing `image-generation/SKILL.md`; deployments can place it outside an application archive. |

Relative paths, missing resources, and skill files without a YAML frontmatter description reject activation. Disposing the plugin removes its candidate. Project and user skill precedence remains owned by the skill registry.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals - click to expand</summary>

The provider reads the candidate description from packaged YAML frontmatter during activation and returns the instruction body without that metadata when loaded. The loaded skill exposes its filesystem directory for resource-aware consumers.

| File | Responsibility |
|---|---|
| [`src/index.ts`](src/index.ts) | Provider registration and configured resource path. |
| [`assets/image-generation/SKILL.md`](assets/image-generation/SKILL.md) | Model-independent preparation workflow. |
| - | No runtime invariant companion is published: the provider owns one immutable candidate, and the skill registry owns registration lifecycle and precedence. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Skill registry](../../skill/skill/README.md) - discovery and precedence.
- [Skill tool](../../skill/tool-skill/README.md) - model-visible catalogs and bodies.
- [Image optimizer](../image-optimizer/README.md) - request validation and prepared specifications.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `dsh-tool-skill`, which renders the catalog entry and selected instruction body.

#### KV Cache effect

Mounting the provider adds one catalog entry; loading the skill adds its body at the existing skill-tool insertion point. The provider does not add a separate prompt section.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The provider does not install `image_optimize`, an image executor, a model, or network credentials.
- The workflow prepares requests but cannot establish that generation succeeded without an executor result.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers - click to expand</summary>

None.

</details>
