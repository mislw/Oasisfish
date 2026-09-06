# Agent Note: Reference-aware image edits

Status: implemented

English | [中文](2026-09-06-reference-aware-image-edits.zh.md)

## Problem

The generated-image tool could see image attachments in the conversation, but its service accepted only text and always called the generation endpoint. A request to preserve or revise an uploaded design therefore discarded the original pixels and asked the image model to reconstruct them from text.

## Decision

The `image_generate` Consumer finds the most recent direct user message containing images and passes all of those durable attachment references to `ctx.imageGeneration`. Reference reuse is the default; `use_reference_images: false` is the explicit escape hatch for an unrelated new image. The Consumer defaults reference-image requests to high output quality while allowing the model to select another exposed quality.

The image-generation provider reads the referenced attachments and sends them as repeated `image[]` multipart fields to its configurable `editEndpointPath`, which defaults to `images/edits`. Requests without references retain the JSON `images/generations` path. The provider does not send `input_fidelity`: `gpt-image-2` processes image inputs at high fidelity automatically and rejects attempts to change that setting. This extends the auxiliary route selected by the [default image model](2026-08-28-default-image-model.md); it does not switch the Session's conversation model.

## Alternatives considered

**Describe the uploaded image and generate from text.** This loses exact geometry, typography, identity, and layout before generation begins, so prompt improvements cannot restore the missing pixels reliably.

**Expose attachment IDs as model arguments.** The model already acts inside a Session with durable image blocks. Requiring it to copy opaque IDs creates avoidable failure cases and leaks storage vocabulary into a task-facing schema.

**Always reuse every image in the Session.** Older images may belong to completed iterations or unrelated requests. Selecting the latest direct user message preserves the user's current visual input while keeping an explicit opt-out.

## Consequences

- Uploaded references reach the image model as image bytes instead of a text-only reconstruction.
- Generation-only requests retain the existing JSON request and endpoint behavior.
- Reference images add image-input token cost, and high output quality can increase cost and latency.
- Masks, variations, background control, and output-format selection remain outside this operation.
