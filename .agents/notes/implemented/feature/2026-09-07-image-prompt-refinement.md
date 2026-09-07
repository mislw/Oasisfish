# Agent Note: Image prompt refinement

Status: implemented

English | [中文](2026-09-07-image-prompt-refinement.zh.md)

## Problem

The image-generation capability accepted any prompt string, so an Agent could forward a brief user phrase directly to the configured image model. The provider then received too little information about composition, camera, lighting, materials, spatial relationships, finish, and likely defects even when the conversation model understood the request.

## Decision

The `image_generate` schema requires the current conversation model to refine the user's request into one coherent generation-ready English prompt before calling the configured image model. Refinement preserves explicit subjects, counts, visible text, aspect ratios, styles, exclusions, and reference-image constraints, and adds only task-relevant visual detail. It happens inside the existing conversation-model turn; the Harness does not issue a hidden second model request or change the Session's selected conversation model.

Oasisfish packages an offline `ai-image-prompts` Skill adapted from YouMind OpenLab revision `6ef324c0aaf3bae6605e21be08f510a7a3fa0cfb`. The Skill supplies concise visual recipes for game assets, UI imagery, mockups, posters, products, portraits, illustrations, infographics, and reference edits. Its provenance and MIT license ship beside it. The packaged edition does not update itself, download examples, contact the upstream service, or append promotional attribution to model responses.

The dedicated `game-image` and `game-ui` presets load the Skill and use explicit local `skill_search` retrieval before image generation. The image-generation entry only opens a blank `game-image` session: it submits no bootstrap message and displays no stages. After the user enters a request, the Agent silently loads the Skills, retrieves a recipe, refines the prompt, and generates the image. The standard preset sees the Skill in its catalog, has the same search tool when the desktop local provider is available, and receives the refinement requirement from the `image_generate` schema. All paths call the one default image provider selected in Settings.

## Verification

Package tests assert the refinement requirement in the generated tool schema. Preset assembly tests assert the dedicated image workflow exposes `skill_search`, omits the stage tool, and carries the silent-refinement instructions. A browser end-to-end test asserts that clicking image generation submits no bootstrap message and displays no stages. Desktop resource and staged-inventory tests require the Skill, visual recipes, provenance, and license. A keyless assembled snapshot loads the real packaged Skill and retrieves its game-item visual recipe without calling a chat or image provider.

## Alternatives considered

**Make a second GPT request dedicated to prompt rewriting.** Rejected because it adds hidden latency, cost, failure handling, and another model-visible operation when the current conversation model can produce the tool argument in its existing turn.

**Replace the configured image provider or add a provider router.** Rejected because prompt detail and rendering capability are separate concerns. This change improves the request sent to the selected model without pretending to add model diversity or provider-native features.

**Vendor the upstream Skill unchanged.** Rejected because runtime updates, example downloads, and response promotion are unnecessary for a self-contained desktop workflow. A pinned offline adaptation retains the useful visual guidance and its license while removing external side effects.

**Hard-code one universal prompt template.** Rejected because icons, portraits, UI backgrounds, product images, and reference edits require different composition and defect controls. Local recipes let the conversation model select compatible detail without inflating every prompt with the same adjectives.

## Consequences

- Brief image requests reach the configured image model as richer, task-specific English prompts.
- The product still has one selected default image model; prompt refinement does not improve unsupported provider features or guarantee rendering quality.
- Dedicated image workflows spend local retrieval work before generation, while the actual chat and image requests retain their existing credential and network requirements.
- Literal user-visible text remains in its original language even though the surrounding generation prompt is English.
