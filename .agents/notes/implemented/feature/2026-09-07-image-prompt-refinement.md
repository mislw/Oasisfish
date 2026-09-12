# Agent Note: Image prompt refinement

Status: implemented

English | [中文](2026-09-07-image-prompt-refinement.zh.md)

## Problem

The image-generation capability accepted any prompt string, so an Agent could forward a brief user phrase directly to the configured image model. The provider then received too little information about composition, camera, lighting, materials, spatial relationships, finish, and likely defects even when the conversation model understood the request.

## Decision

The `image_generate` schema requires the current conversation model to refine the user's request into one coherent generation-ready English prompt and four concise candidate differences before calling the configured image model. Refinement preserves explicit subjects, counts, visible text, aspect ratios, styles, exclusions, and reference-image constraints, and adds only task-relevant visual detail. It happens inside the existing conversation-model turn; the Harness does not issue a hidden second model request or change the Session's selected conversation model.

Oasisfish packages an offline `ai-image-prompts` Skill adapted from YouMind OpenLab revision `6ef324c0aaf3bae6605e21be08f510a7a3fa0cfb`. The Skill supplies concise visual recipes for game assets, UI imagery, mockups, posters, products, portraits, illustrations, infographics, and reference edits. Its provenance and MIT license ship beside it. The packaged edition does not update itself, download examples, contact the upstream service, or append promotional attribution to model responses.

The dedicated `game-image` and `game-ui` presets use explicit local `skill_search` retrieval before image generation. The focused `game-image` path loads only `ai-image-prompts`, searches it exactly once, and does not load or search `oasis-wiki`. It also mounts `@deepseek-ai/dsh-tool-memory`, so enabled user records and records matching the Session `cwd` enter the first accepted step as logged context. The image-generation entry only opens a blank `game-image` session: it submits no bootstrap message and displays no stages. After the user enters a request, the Agent silently loads the Skill, retrieves a recipe, applies relevant visual preferences without overriding the current explicit request, refines the prompt, and generates the image. With stored visual preferences, candidate differences default to one preference-aligned direction, two adjacent explorations, and one contrasting exploration. The standard preset sees the Skill in its catalog, has the same search tool when the desktop local provider is available, and receives the refinement requirement from the `image_generate` schema. The Models page excludes explicit `gpt-image-*` routes from the conversation-default selector so prompt refinement cannot be sent to an image-only Chat Completions route. Image generation uses its separately configured primary route and tries one optional fallback route after a non-cancellation failure.

Each tool call launches four independent candidates from the shared prompt plus one candidate difference. Every candidate applies the primary-to-fallback route order independently. The result retains successful candidates in request order and concludes the turn with `已生成 N 个方案，请选择。`; failures in some candidates do not discard the others. The desktop presents the candidates as a two-column grid with original preview, download, and a selection action that adds only the chosen image to the current composer draft. Selecting “continue editing” also stores that candidate's logged difference as a durable visual preference, using project scope when the Session has a `cwd` and user scope otherwise. Preview and download are not preference signals. Memory rejection, duplication, or transport failure does not undo the draft image.

## Verification

Package tests assert the refinement and four-candidate requirements in the generated tool schema, independent fallback attempts, partial success, durable result blocks, exact candidate-to-difference recovery after partial failure, project/user memory scope selection, and non-blocking memory failures. Preset assembly tests assert the dedicated image workflow exposes `skill_search` and `memory_manage`, omits the stage tool, carries the silent-refinement and candidate-diversity instructions, searches `ai-image-prompts` once, and does not search `oasis-wiki`. A browser end-to-end test asserts that clicking image generation submits no bootstrap message and displays no stages. Desktop resource and staged-inventory tests require the Skill, visual recipes, provenance, and license. A keyless assembled snapshot performs four deterministic provider requests and records four image blocks without a closing conversation-model request; the native-memory snapshot separately pins logged first-step injection.

## Alternatives considered

**Make a second GPT request dedicated to prompt rewriting.** Rejected because it adds hidden latency, cost, failure handling, and another model-visible operation when the current conversation model can produce the tool argument in its existing turn.

**Route image generation through the conversation default.** Rejected because prompt refinement and rendering require different provider endpoints. The conversation model produces the tool arguments; the image-generation service owns its primary and optional fallback routes.

**Vendor the upstream Skill unchanged.** Rejected because runtime updates, example downloads, and response promotion are unnecessary for a self-contained desktop workflow. A pinned offline adaptation retains the useful visual guidance and its license while removing external side effects.

**Hard-code one universal prompt template.** Rejected because icons, portraits, UI backgrounds, product images, and reference edits require different composition and defect controls. Local recipes let the conversation model select compatible detail without inflating every prompt with the same adjectives.

**Treat preview or download as a preference signal.** Rejected because those actions also support inspection and comparison. “Continue editing” is the existing explicit commitment to one candidate and provides the least ambiguous automatic signal.

**Make every candidate follow stored preferences.** Rejected because repeated selections would collapse the four-candidate set into minor variations. The one-plus-two-plus-one allocation retains personalization and deliberate exploration.

## Consequences

- Brief image requests reach the configured image model as richer, task-specific English prompts.
- The product has one primary image model and one optional fallback; prompt refinement does not improve unsupported provider features or guarantee rendering quality.
- Dedicated image workflows spend local retrieval work before generation, while the actual chat and image requests retain their existing credential and network requirements.
- Literal user-visible text remains in its original language even though the surrounding generation prompt is English.
- One image request now spends up to four provider generations, and a failed primary route may add a fallback attempt for each candidate.
- Selecting a candidate can change later image prompts through durable memory; disabling memory injection preserves the records but removes that influence from future requests.
