# @deepseek-ai/dsh-client-ui-attachment

English | [中文](README.zh.md)

Dynamic attachment presentation plugin for the conversation UI. It waits for the conversation package's `conversation.input.attachments` and `conversation.message.images` declarations through `ctx.slots.inject`, then registers the composer draft-image rail, document drop target, chat-history image gallery, and original-image lightbox. The conversation slot owner supplies attachment data, image loading, callbacks, and its namespace translator; presentation components remain pure props and are not exported from the package entry.

## Attachment rail

`AttachmentRail` renders pending draft images as fixed 64px thumbnails (16px radius) in one horizontally scrolling row whose scrollbar stays hidden. Overflow is announced by circular edge arrows instead: each pages one viewport (minus one card of context, floored at 200px) with smooth scrolling (instant under `prefers-reduced-motion: reduce`), and arrow visibility is recomputed from scroll geometry on scroll, item-count changes, and rail size changes (a ResizeObserver on the rail element, so sidebar and panel resizes count, not only window resizes). The rail scrolls horizontally only: a non-passive listener consumes every wheel tick with a vertical component — nothing scrolls the conversation behind the composer — converting a pure vertical wheel to a horizontal step (LINE/PAGE deltas normalized to pixels, per-tick travel clamped to 60px) and keeping a diagonal pan's horizontal intent, while purely horizontal pans stay native. A newly added item is revealed at the rail's end; removal keeps the scroll position, and a rail that mounts over an already-populated draft keeps its start position. Each thumbnail opens its original through `onOpen` on a single click, and its remove control sits inside the card's top-right corner, hidden until the card is hovered or the control keyboard-focused; coarse-pointer (touch) surfaces show it permanently because they have no hover. The owner decides mounting and renders the rail only while items exist.

## Message images and the lightbox

`MessageImage` renders one durable history image, loading a session-authorized URL through the owner's `ImageLoader`; a failed load renders an explicit retry control, and a settled load answers a single click by opening `ImageLightbox` (clicks during loading are ignored). Sizing follows DeepSeek Chat: a message's lone image (`variant="single"`) renders at 240px on its longer edge with the displayed aspect ratio clamped to [0.25, 4] — the overflow is cropped by `object-fit: cover`, anchored to the top of very tall images and the left of very wide ones — and never upscales past its natural size; an image among several (`variant="tile"`) is a fixed 64px square. `ImageGallery` wraps a message's images in one aligned wrapping flex group (`end` for user messages, `start` for assistant messages), picks the variant from the image count, and renders nothing for an empty list. `ImageLightbox` is a document-level modal preview over the shared dialog mask (`--dsw-alias-bg-mask-1` + `--dsw-mask-blur`, painted on its own layer so the blur never touches the previewed image) that closes on Escape, a mask press, or its close control, and restores focus to its opener on unmount.

The plugin also registers the keyed `image_generate` entry in `tool.call.toolview`. A settled generated-image result renders its durable `image` blocks as a two-column candidate grid with retry, original-image preview, download, and “continue editing” actions instead of flattening them to JSON. The editing action copies only the selected durable image into the owning Session's composer draft and does not submit a prompt. It also records the selected candidate difference as a durable visual preference through the existing Memory Remote, using project scope when the Session has a `cwd` and user scope otherwise; preview and download actions do not write memory. A failed or duplicate memory write does not undo the draft image. Its loader calls `ConversationController.resolveImage` with the owning Session id, so reopening a Session reads the persisted attachment through the authorized attachment route. The compact row derives its prompt, candidate differences, and lifecycle state only from the logged Tool call/result slice.

## Drop overlay

`DropOverlay` is the full-viewport invitation shown while a file drag is over the page: illustration, title, and a limits line while drops are accepted (`disabled` swaps the blocked illustration and hides the limits line). The layer is pointer-inert — the owner's document-level drag listeners keep the enter/leave count and decide accept/reject; the overlay only shows state. It portals to the body like the lightbox.

## Model Experience

None, as the selection action contributes no input to the current model turn; its durable visual-preference record may enter later requests through `@deepseek-ai/dsh-tool-memory` when the selected Agent Preset includes that Consumer and memory injection is enabled.

#### KV Cache effect

The current turn is unchanged. A committed preference changes a later memory snapshot and may reduce prefix reuse for that later request.

## Known Limitations and Deferred Work

- **Images only** — non-image files have no rail card or history renderer yet; DeepSeek Chat-style file cards and upload-progress states wait until the composer accepts non-image attachments.
- **No zoom or download in the lightbox** — the preview renders the original at fit-to-viewport size only.
- **The lightbox does not trap focus** — it sets `aria-modal` and restores focus on close, but Tab can reach the page behind it.
