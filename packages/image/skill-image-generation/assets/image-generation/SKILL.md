---
name: image-generation
description: Prepare image generation, editing, and variation requests before using an available image executor.
---

# Image Generation Preparation

Use this workflow for generic image generation, editing, and variation requests. It prepares an executor-neutral specification; it does not generate an image or choose a model.

## Prepare the request

1. Classify the operation as `generate`, `edit`, or `variation`.
2. State the user's visual intent and derive concise category, style, and scene hints without inventing requirements.
3. Preserve every exact text requirement as a separate structured entry with its text, optional placement, and case-preservation requirement.
4. For each image in the current input, assign its one-based position, semantic role, and priority. Do not reuse positions from earlier messages or infer an unavailable image.
5. Record requested output dimensions or aspect ratio, transparency, count, preservation requirements, and negative constraints.
6. Call `image_optimize` with the structured request before calling any available image executor.

If `image_optimize` returns `needs_clarification`, stop. Ask the user to resolve the reported issues, then prepare the request again. Do not call an executor with an unresolved result.

When optimization is ready, pass only the prepared prompt, references, output settings, and required capabilities to the selected executor. Do not pass optimizer evidence, internal case identifiers, or unrelated metadata as executor instructions.

## Report the outcome

Call an image executor only when one is available in the current environment. Without an executor, report that the request is **prepared** and provide the prepared specification; never say that an image was generated. With an executor, report generation only after the executor returns a successful result.

Oasis/Cowart workflows apply their domain constraints after this generic optimization step. Those constraints may refine the prepared request, but they do not replace `image_optimize` or change the clarification rule.
