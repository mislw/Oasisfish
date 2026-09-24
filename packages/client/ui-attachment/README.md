---
description: "Attachment presentation for the conversation UI: mixed draft-attachment rail, document drop target, history-image gallery, and original-image lightbox; for users and maintainers of the Web attachment experience."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-attachment

English | [中文](README.zh.md)

## Summary

This package renders everything the conversation UI shows about attachments: one ordered draft rail under the composer, a full-viewport drop invitation, durable images in Chat, Trajectory, and Tool results, and a lightbox for the original image. The `image_generate` result view also shows its prompt and actual provider/model routes without exposing attachment ids. Attachment data, upload state, image loading, and callbacks come from the declared slot owners. Choose it for the DeepSeek Chat-style attachment experience.

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

Mount this plugin alongside [`ui-conversation`](../ui-conversation/README.md) and [`ui-tool`](../ui-tool/README.md) when tool results need an image gallery. It waits for their slot declarations and registers its components into them. Users then see the mixed draft-attachment rail, DeepSeek Web file cards with upload controls, the drop overlay with its limits line, message images sized by count, the tool card's gallery, and the Escape/mask/close lightbox.

### Draft attachments

Images and generic files retain pick order in one non-wrapping horizontal rail. Every item is 64px high: an image is a 64px square thumbnail, while a generic file is a 240px-wide DeepSeek Web card with a 16px radius, blue gradient document glyph, filename, and uppercase extension plus byte size. Edge arrows page hidden overflow, the scrollbar stays hidden, and a newly added item is revealed at the rail's end. Uploading replaces a file glyph with a spinner and shows byte progress when the carrier reports it, with an indeterminate bar before the first report; failure shows retry, and removal controls appear on hover or keyboard focus while remaining visible on touch devices. Clicking an image opens the original.

### Message images and the lightbox

In Chat, one user message presents files and images in a right-aligned wrapping flow that preserves source order. A lone image without another attachment renders at 240px on its longer edge (aspect clamped to [0.25, 4], never upscaled); when the message has more than one attachment, each image is a fixed 64px square beside 240×64px file cards. A loaded image opens the document-level lightbox on click; a failed load shows a retry control instead. The lightbox closes on Escape, a mask press, or its close control, and restores focus to its opener.

Trajectory attachment rows request 48px square thumbnails that contain the complete image without cropping. Loading and retry icons keep the same box, with localized tooltips and accessible names; the image opens the same lightbox. A slot owner may supply a presentation-only image label for the thumbnail and lightbox without changing the durable reference or the cache lookup.

### Generated image results

An `image_generate` tool result derives its view from the settled raw content and persisted presentation metadata. Valid results show the recorded prompt, a session-authorized gallery, each successful candidate's actual provider/model route, and the durable result text; attachment ids remain hidden. Missing, malformed, failed, or mismatched data falls back to the generic tool name and durable text instead of inventing UI state.

### Drop overlay

While a file drag is over the page, the full-viewport overlay announces the drop: illustration, title, and a limits line when drops are accepted. The overlay only shows state — the owner's document-level listeners decide accept or reject.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin waits for the conversation attachment slots and `tool.call.toolview` through `ctx.slots.inject`. It registers the composer rail, shared history galleries, and the keyed `image_generate` result view. That result declares its own `image-generation.result.images` child slot, so its gallery receives the Tool view's session-authorized loader without competing with the generic `tool.call.images` owner. The presentation components are driven entirely by props: slot owners supply attachment data, image loading, callbacks, and the locale translator; the package entry exports no components.

| File | Role |
|---|---|
| [`src/client/ComposerAttachments.tsx`](src/client/ComposerAttachments.tsx) | Ordered image/file rail + drop overlay assembly |
| [`src/client/drop-events.ts`](src/client/drop-events.ts) | Document drag-and-drop listeners installed by each mounted attachment view's effect |
| [`src/AttachmentRail.tsx`](src/AttachmentRail.tsx) | Horizontal attachment overflow, wheel translation, edge arrows |
| [`src/client/MessageImages.tsx`](src/client/MessageImages.tsx) | Per-message gallery + lightbox assembly |
| [`src/client/ImageGenerateResult.tsx`](src/client/ImageGenerateResult.tsx) | Durable `image_generate` result derivation, route labels, and child gallery owner |
| [`src/MessageImage.tsx`](src/MessageImage.tsx) | Single image sizing, load/retry, click-to-open; local submission-echo previews render their object URL directly |
| [`src/ImageLightbox.tsx`](src/ImageLightbox.tsx) | Document-level modal preview over the shared mask |
| [`src/DropOverlay.tsx`](src/DropOverlay.tsx) | Pointer-inert drag invitation portal |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the attachment surface is not enough. They move from the slots this package fills to the conversation shell that owns the input flow.

- [ui-conversation](../ui-conversation/README.md) — declares the attachment slots and owns the composer and image intake.
- [Web client architecture](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md) — how browser plugin rows load and register slots.
- [Client package map](../README.md) — adjacent browser UI packages.

-----

<a id="model-experience"></a>
## Model Experience

None, as the plugin only renders attachment state supplied by the conversation UI and contributes no model-visible input.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define the current attachment surface. They are package constraints, not a general image-viewer comparison or a task backlog.

- **No zoom or download in the lightbox** — the preview renders the original at fit-to-viewport size only.
- **The lightbox does not trap focus** — it sets `aria-modal` and restores focus on close, but Tab can reach the page behind it.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The package contributes only effect-owned slot entries; the slot registry owns their lifecycle and validates their declarations.
