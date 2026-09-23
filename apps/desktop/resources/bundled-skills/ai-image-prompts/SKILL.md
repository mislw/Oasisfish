---
name: ai-image-prompts
description: Refine brief image requests into detailed generation-ready prompts using local visual recipes. Use before image_generate for game assets, UI imagery, posters, portraits, products, environments, illustrations, or reference-image edits. Do not use for non-image tasks or as a replacement for the configured image model.
---

# AI Image Prompt Refinement

Adapted for Oasisfish from the MIT-licensed YouMind OpenLab `ai-image-prompts-skill`. This packaged edition is an offline prompt-refinement guide: it does not update itself, download sample images, contact YouMind, or require attribution in ordinary responses.

## Workflow

1. Preserve the user's explicit subject, count, action, visible text, aspect ratio, style, exclusions, and reference-image requirements.
2. Ask one focused question only when a missing fact would materially change the result. Do not delay a sufficiently specified generation request.
3. Use `skill_search` on this Skill with the intended asset type and desired mood or style. Load only the relevant passages from `references/visual-recipes.md`.
4. Let the current conversation model synthesize the request and retrieved recipe into one coherent generation-ready English prompt. This refinement happens before `image_generate`; do not send the user's brief wording unchanged.
5. Call `image_generate` with the refined prompt. Keep literal visible text in its original language and quotation marks. Reuse current reference images unless the user explicitly requests an unrelated image.

## Prompt Content

Include details only when they help the requested image:

- subject identity, silhouette, pose, expression, action, and important props;
- environment, foreground, middle ground, background, scale, and spatial relationships;
- composition, focal hierarchy, camera angle, lens or projection, crop, and depth;
- key, fill, rim, practical, ambient, and atmospheric lighting;
- material response, texture scale, edge treatment, surface wear, translucency, and reflections;
- palette, contrast, saturation, temperature, and value separation;
- rendering medium, finish, production quality, and intended use;
- concise exclusions for likely defects, contradictions, unwanted text, clutter, duplication, or broken anatomy.

Do not inflate every prompt with incompatible adjectives. A flat icon, a painterly poster, a realistic product shot, and a UI background require different visual language. Prefer a few mutually consistent decisions over a long list of styles.

## Reference Images

State what must remain unchanged: identity, silhouette, layout, typography, logo geometry, color system, camera, or material. State what may change separately. Do not replace reference preservation with a textual reconstruction.

## Text In Images

Quote exact user-provided text verbatim and specify its hierarchy, location, alignment, and legibility. Never translate, rewrite, or invent required labels. When text is not requested, exclude random letters, watermarks, signatures, and logos.

## Output

Pass the final English prompt directly to `image_generate`. Do not present template galleries or require the user to choose among recipes unless they asked for alternatives.
