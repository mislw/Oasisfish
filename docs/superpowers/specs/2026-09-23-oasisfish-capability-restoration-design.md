# Oasisfish Capability Restoration Design

English | [中文](2026-09-23-oasisfish-capability-restoration-design.zh.md)

## Goal

The official Oasisfish Desktop application restores the released default-model preference, local Skill retrieval, native memory, auxiliary image generation, and image optimization capabilities on the current Desktop architecture. The restored capabilities preserve released user data and observable behavior while keeping the current updater, Oasis UI workflow, Codex bridge, bundled Oasis Wiki, and Wallpaper Engine integration.

## Scope

This delivery restores five independently testable capabilities from the `v1.20260912.4` product line and the completed local image-optimization implementation. Each capability uses current Cordis services, Settings, Session logging, attachment storage, profile composition, and Desktop packaging rather than importing an earlier application tree.

This delivery does not merge the historical branch, restore superseded Desktop startup code, replace the current updater, change the Agent Loop, add an implicit intent interceptor, send local corpora to a remote model, or enable these product-specific defaults in ordinary non-Desktop profiles.

## Integration Strategy

Implementation starts from `codex/release-v1.20260923.1` in an isolated worktree. Historical source supplies behavior, public types, released storage declarations, tests, and documentation evidence. A historical file is copied only when its ownership and dependencies still match the current repository; otherwise the current owner receives a forward port of the same behavior.

Each capability lands as a separate reviewed commit with its own behavior tests and composition evidence. The final composition commit enables the restored packages in the official Desktop profile and selected Oasisfish Agent presets without changing generic Web, Headless, SDK, SDK Minimal, or ACP defaults.

## Component Ownership

| Capability | Service Definition | Provider | Consumer and UI |
|---|---|---|---|
| Default model preference | Existing `agentDefaultModel` service | Existing Settings-backed implementation | Models settings page and current session-model operations |
| Local Skill retrieval | `skill-search` | `skill-search-local` | `skill_search` tool |
| Native memory | `memory` | `memory-local` | `memory_manage` tool and memory settings page |
| Auxiliary image generation | `image-generation` | OpenAI-compatible route adapter | `image_generate` tool, Models settings, and attachment result view |
| Image optimization | `image-optimizer` | Offline prompt-library provider | `image_optimize` tool and image-generation Skill |

## Default Model Preference

The Models settings page reads the current model directory and the complete default selection. It lets the user select a provider, model, and supported reasoning effort, then saves the complete `{ provider, model, reasoningEffort? }` value through the current Host API. Omitting the effort clears any stored effort.

An existing Session with a durable request header keeps its recorded selection. A blank Session and a newly created Agent read the live default when they first resolve a route. A selected provider may serve a model that its advisory catalog does not list, but the UI offers only models present in the current directory. Removing a Provider configuration remains blocked while that Provider owns the default.

## Local Skill Retrieval

The `skill-search` service owns corpus declarations, loaded-Skill resolution, Provider selection, cancellation, and structured failures. Desktop declares only reviewed corpus roots from the bundled Oasis Wiki and image-generation guidance; the service never scans every Skill resource implicitly.

The local Provider confines discovery beneath the loaded Skill resource base, chunks supported text with heading context, builds lexical and embedding indexes transactionally, and persists a compatible SQLite cache under application-owned mutable storage. A pinned local embedding model is packaged in signed Desktop resources, verified by manifest and hashes, and never downloaded at runtime.

The explicit `skill_search` tool returns bounded excerpts with Skill identity, relative path, and one-based line ranges through ordinary tool events. Cancellation or refresh failure preserves the last committed index. Missing model resources, invalid corpora, unsupported files, and configured limits fail explicitly without sending source or query text to a model Provider.

## Native Memory

The `memory` service accepts one Provider and exposes user-scoped and project-scoped records. Project identity derives from the normalized Session working directory; callers never supply a project key. Memory remains an explicit durable fact selected by the model through `memory_manage` or edited by the user in Settings.

The local Provider continues to open the released `native_memory` storage domain at version `0`. It retains the released record fields, enable state, capacity limits, duplicate checks, project visibility, atomic updates, and sensitive-content rejection. Existing records remain in place and require no migration.

On the first accepted step of each turn, the memory Consumer reads the effective snapshot. When memory is enabled and visible records exist, it injects one sourced user message before the request is committed. The message enters the Session log, so replay reconstructs every model-visible memory snapshot. Disabling memory preserves records and suppresses later injection.

## Auxiliary Image Generation

Image generation remains independent from the conversation model. Models settings select one primary image route and an optional fallback route, with explicit model ids and endpoint paths backed by current Provider settings and credential references. Changing an image route does not change the Session conversation route.

The `image_generate` tool accepts generation or supported reference-edit input, resolves only direct-user images authorized for the current Agent, calls the configured Provider, and commits the successful binary through the current attachment service before returning its result. The result records the actual Provider and model and renders through the current attachment UI.

A non-cancellation primary failure may start one configured fallback attempt. Cancellation never starts the fallback. A successful result concludes at the tool result without forcing another conversation-model request after the image is durable.

## Image Optimization

The `image-optimizer` service validates provider-neutral generation, edit, or variation requests and compiles a deterministic `ImageGenerationSpec`. The specification carries canonical instructions, authorized attachment references, exact text, output requirements, constraints, selected source evidence, and warnings; it contains no credentials, concrete execution Provider, or local storage path.

The offline library Provider contributes validated templates, case metadata, visual-style tags, and scene tags from packaged resources. The Provider performs no network request. Its synchronized resources retain source and license metadata, and packaged prompts require explicit redistribution permission.

The explicit `image_optimize` tool resolves one-based direct-user image ordinals and returns either a prepared specification or structured clarification issues. The packaged image-generation Skill instructs the model to call `image_optimize` before `image_generate` when structured preparation is useful. The optimizer does not execute image requests or intercept ordinary turns.

## Composition and Packaging

Shared Service Definitions and model-facing tools enter `dsh-base` only where every shipped profile already owns the required dependencies and behavior. Product-specific Providers, corpora, local model resources, Client settings packages, and default Agent-preset activation remain Desktop or Oasisfish profile contributions. SDK Minimal receives a component only when its package contract already requires that capability explicitly.

The Desktop runtime packages every new workspace dependency, the local embedding model, prompt-library resources, and generated Client modules without runtime installation. Profile preparation adds restored official packages through current bundle and resolver manifests. Existing Desktop recovery continues to disable optional product bundles without disabling the core application.

## Persistence and Compatibility

The restored memory Provider uses the released storage-domain name and version without changing its stored type. Any required implementation adapter surrounds that declaration rather than rewriting committed data. A future stored-type change requires a version-named successor and the repository persistence acknowledgement workflow.

Skill indexes and generated caches are rebuildable artifacts, not user records. Cache compatibility uses explicit model, tokenizer, corpus, and index-format identities; an incompatible cache is replaced atomically after a successful rebuild. Attachments and Session logs keep their current formats because restored model-visible behavior uses existing message, tool, and attachment records.

Settings writes preserve complete selections where omission has clearing meaning. New settings namespaces use current Settings validation and credentials remain in the credential service. No API key, prompt corpus, memory content, or attachment byte sequence is copied into unrelated configuration or diagnostics.

## Failure Behavior

| Condition | Required behavior |
|---|---|
| Default route is not served | Prompt submission reports model unavailability; no silent fallback changes the default |
| Local Skill model or corpus is invalid | `skill_search` fails explicitly and does not download or disclose content |
| Memory Provider is missing or duplicated | Memory activation or operation fails with the stable memory error |
| Project memory has no working directory | The operation fails with `MEMORY_PROJECT_UNAVAILABLE` |
| Memory content resembles a secret or exceeds limits | The write fails without echoing rejected sensitive content |
| Image primary route fails | One configured fallback may run only for a non-cancellation failure |
| Image bytes cannot be persisted | The tool fails and does not report a successful image |
| Optimizer needs exact-text clarification | The tool returns structured issues and no executable specification |
| Desktop resource is absent from the signed runtime | Packaging or the packaged smoke fails before release acceptance |

## Testing

Each capability follows test-driven implementation with focused unit tests for public operations, validation, cancellation, disposal, and failure codes. Provider registries prove that their effects unwind. Concurrent tests own temporary directories, databases, ports, processes, and environment changes.

Real Loader composition tests boot the affected profile rows instead of mounting only hand-built contexts. Keyless Session snapshots cover memory injection, `memory_manage`, `skill_search`, `image_optimize`, and `image_generate` results. Client tests cover localized settings, complete-selection writes, project visibility, route failures, attachment rendering, and disposal.

Desktop staging tests verify package inclusion, resolver manifests, local model hashes, prompt-library resources, and generated Client modules. A packaged Windows smoke starts the real Desktop profile, searches a bundled corpus, restarts with the same index and memory storage, executes fixture-backed image optimization and generation, and confirms that the current updater and Wallpaper Engine bundle still activate.

Focused checks follow `dsh-pre-push-checks`. Documentation changes run translation pairing, quick documentation checks, and `doc-sync`; package changes run their targeted typecheck, tests, snapshots, and built smokes. The full repository suite remains CI-owned unless a discovered dependency makes the change irreducibly repository-wide.

## Delivery Sequence

1. Restore the default-model settings UI over the existing service and Host operations.
2. Restore local Skill retrieval, its packaged model, explicit corpora, and `skill_search` composition.
3. Restore native memory, the released storage declaration, tool, settings UI, and Session snapshot coverage.
4. Restore auxiliary image generation, route settings, attachment result rendering, and reference handling.
5. Integrate image optimization, offline library resources, `image_optimize`, and the generation Skill.
6. Enable the complete Oasisfish composition, run packaged verification, and record product-visible workflows.

Each sequence item ends in a reviewable commit whose tests pass independently. Later items consume only published interfaces from earlier items and do not reach into their private implementation.

## Alternatives

Merging the historical product branch would restore files quickly but would also reintroduce superseded Desktop startup, Client composition, and persistence implementations across a large divergent history. The design rejects a history merge in favor of behavior-preserving forward ports.

Mounting all restored code in one compatibility bundle would isolate the diff but would duplicate settings, routing, and lifecycle ownership beside current first-party packages. The design retains package ownership by capability and uses Desktop composition only for product-specific activation.

Restoring only memory and the default-model picker would reduce the first delivery but leave the Oasis UI workflow without the local retrieval, optimization, and generation capabilities its prompts require. The approved scope restores the complete dependency chain in independently reviewable stages.

## Acceptance Criteria

- Models settings can save the complete default provider, model, and optional reasoning effort, and a new or blank Session observes the saved default.
- The official Desktop can search declared Oasis Wiki and image-guidance corpora locally after a clean installation and after restart, without a network model download.
- Released `native_memory` version `0` records remain readable and editable; enabled visible records appear in the durable request history once per turn.
- Users and the model can add, update, remove, enable, and disable memory through the authorized UI or tool paths with user and project visibility enforced.
- Image generation uses an independently selected route, stores successful output as a durable attachment, and performs at most one configured non-cancellation fallback.
- Image optimization produces deterministic executable specifications or structured clarification issues from authorized references and packaged offline guidance.
- The current updater, Oasis UI workflow, Codex bridge, bundled Oasis Wiki, and Wallpaper Engine integration retain their existing activation and recovery behavior.
- Ordinary non-Desktop profile defaults do not gain Oasisfish-specific Providers, corpora, resources, or UI activation.
- Focused unit, composition, snapshot, documentation, and packaged Desktop checks reject missing resources, persistence regressions, undisposed registrations, unlogged model context, and broken restored workflows.
