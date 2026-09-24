---
description: "Package map for the durable image attachment capability family: what you can do with image attachments, and where your images are stored."
kind: "package-group"
---

# attachment/ — durable attachment capability family

English | [中文](README.zh.md)

## Summary

The `attachment/` group provides durable image attachments and auxiliary image generation. Storage packages admit, persist, replay, and project raster images. Generation packages call configured image routes, commit successful bytes through `ctx.attachments`, and expose durable results through a model tool. Product composition remains responsible for mounting the generation packages and selecting routes.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

These packages provide durable image storage and optional generation; each README describes its own configuration and failure behavior.

| Package | Role | ctx key |
|---|---|---|
| [`attachment/`](attachment/README.md) | Image attachments for prompts and commands that persist and come back in history | `ctx.attachments` |
| [`attachment-local/`](attachment-local/README.md) | Stores your attached images on this machine below `DSH_HOME` | registers on `ctx.attachments` |
| [`image-generation/`](image-generation/README.md) | Calls configured image routes and commits successful outputs as attachments | `ctx.imageGeneration` |
| [`tool-image-generate/`](tool-image-generate/README.md) | Gives the current Agent the `image_generate` Consumer | registers on `ctx.tools` |

-----

<a id="related-documentation"></a>
## Related documentation

Start with the subsystem reference for the service contract, then the capability-seam table and the configuration surface of the local backend.

- [Attachment subsystem reference](../../docs/subsystems/attachment.md) — service contract, payload types, and the `ctx.attachments` Cordis surface.
- [Capability seams](../../docs/capability-seams.md) — the Service Definition / Service Provider / Consumer split this family follows.
- [Generated configuration catalog](../../docs/config-catalog.md#deepseek-aidsh-attachment-local) — every accepted field of the local backend.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
