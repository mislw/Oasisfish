# DSH General Image Optimization Capability Design

English | [中文](2026-09-20-dsh-image-optimization-design.zh.md)

## Goal

DSH provides every shipped Agent and Profile with the same optimization capability for image generation and editing requests. The capability compiles user intent, reference images, exact text, composition requirements, and editing constraints into a model-independent `ImageGenerationSpec` for existing external image tools and future native DSH image executors.

This design combines the template, tag, and case organization from `freestylefly/awesome-gpt-image-2`, the production requirements in the existing DSH `oasis-wiki` Cowart workflow, and the existing DSH Skill, Tool, Attachment, Session, and Profile composition mechanisms. Integration follows one shared interface and current consumer needs; it does not copy the upstream website, billing, account, Provider application code, or duplicate workflows.

## Scope

This delivery includes an image optimization Service Definition, a bundled case-library Provider, a model-callable tool, a formal image-generation Skill, default composition in every shipped Profile, and Oasis/Cowart reuse of the shared optimization result.

This delivery excludes actual image generation, image-model discovery, Provider credential management, paid calls, budget control, generation retries, and generated-result storage. Without an image executor, the capability returns an executable optimization result marked `prepared`.

A later design owns the image executor capability. That executor must consume this design's `ImageGenerationSpec` and call the optimization service inside the execution operation instead of relying on prompt instructions to ensure optimization occurred.

## Architecture

Add a `packages/image/` package group. The group follows DSH's Service Definition, Service Provider, and Consumer roles, and its public interfaces do not name GPT Image, Gemini, Flux, or another specific model.

| Package | Responsibility |
|---|---|
| `@deepseek-ai/dsh-image-optimizer` | Declares `ctx.imageOptimizer`, request and result types, Provider registration, candidate merging, and normalized compilation |
| `@deepseek-ai/dsh-image-optimizer-library` | Provides packaged templates, visual-style tags, scene tags, and case indexes |
| `@deepseek-ai/dsh-tool-image-optimize` | Registers the model-callable `image_optimize` tool, converts the current Agent input into an optimization request, and presents the result |
| `@deepseek-ai/dsh-skill-image-generation` | Provides the general image workflow and requires generation or editing tasks to obtain an optimization result before using an available executor |

`image-optimizer` is the sole owner of compilation behavior. The Skill does not maintain case data, the Tool does not select templates, and the case-library Provider does not call tools or models. Provider registration uses `ctx.effect()` so disposal immediately removes its candidates from later compilations.

## Request Model

`ImageOptimizationRequest` describes the user task without Provider names or credentials.

```ts ignore-check
interface ImageOptimizationRequest {
  operation: 'generate' | 'edit' | 'variation'
  intent: string
  references: readonly ImageReferenceRequest[]
  exactText: readonly ExactTextRequest[]
  output: ImageOutputRequest
  preserve: readonly string[]
  avoid: readonly string[]
  locale: string
  category?: string
  styleHints: readonly string[]
  sceneHints: readonly string[]
  templateId?: string
  caseIds: readonly string[]
}
```

The related request types use these exact fields; implementations do not replace them with untyped key-value records.

```ts ignore-check
interface ImageReferenceRequest {
  inputIndex: number
  role: 'style' | 'layout' | 'content' | 'edit-target'
  priority: number
}

interface ExactTextRequest {
  text: string
  placement?: string
  preserveCase: boolean
}

interface ImageOutputRequest {
  aspectRatio?: string
  width?: number
  height?: number
  transparentBackground: boolean
  count: number
}
```

Public tool arguments identify images by one-based position in the current input. The Tool Consumer resolves each position from the initiating Agent and Session into the existing `ImageAttachmentRef`; requests must not substitute local filesystem paths for durable references.

`edit` requires exactly one `edit-target`. `variation` requires at least one `content` reference and forbids `edit-target`. `generate` can omit references. Exact text and preservation requirements remain separate fields and cannot exist only in the free-form prompt.

## Unified Result

`ImageOptimizationResult` is the closed union received by the Tool Consumer. Only the `prepared` branch carries an executable `ImageGenerationSpec`; future executors must reject every other branch.

```ts ignore-check
type ImageOptimizationResult =
  | { status: 'prepared'; spec: ImageGenerationSpec }
  | { status: 'needs_clarification'; issues: readonly ImageOptimizationIssue[] }

interface ImageGenerationSpec {
  schemaVersion: 1
  operation: 'generate' | 'edit' | 'variation'
  canonicalPrompt: string
  references: readonly ImageReferencePlan[]
  composition: readonly string[]
  visualStyle: readonly string[]
  scene: readonly string[]
  exactText: readonly ExactTextRequirement[]
  output: ImageOutputRequirement
  preserve: readonly string[]
  negativeConstraints: readonly string[]
  requiredCapabilities: readonly string[]
  evidence: readonly ImageOptimizationEvidence[]
  warnings: readonly string[]
}
```

`requiredCapabilities` describes capabilities such as multiple references, local editing, transparent backgrounds, exact text, or a particular aspect ratio, not the models that implement them. `evidence` records the Provider, template ID, case IDs, visual-style tags, and scene tags so selections remain inspectable without copying upstream case bodies into the Session.

`ImageOptimizationIssue` contains a stable `code`, the affected field path, and a concrete Agent-facing explanation. `schemaVersion` versions the optimization-result data structure, not the Session format. Tool calls and complete results remain persisted through existing `tool/call` and `tool/result` records; the first phase adds no Session event type.

## Provider Interface

The Service Definition accepts multiple Providers, while `image-optimizer` alone owns optimization orchestration.

```ts ignore-check
interface ImageOptimizationProvider {
  name: string
  rank: number
  resolve(ids: ImageOptimizationSelection, signal?: AbortSignal): Promise<readonly ImageOptimizationCandidate[]>
  match(query: ImageOptimizationQuery, signal?: AbortSignal): Promise<readonly ImageOptimizationCandidate[]>
}

interface ImageOptimizerOptions {
  signal?: AbortSignal
}

abstract class ImageOptimizer {
  registerProvider(provider: ImageOptimizationProvider): () => void
  abstract optimize(
    request: ImageOptimizationRequest,
    options?: ImageOptimizerOptions,
  ): Promise<ImageOptimizationResult>
}
```

`resolve()` handles only explicit template and case IDs and distinguishes missing IDs from duplicates. `match()` returns Provider-owned candidate scores and normalized metadata. The service produces a stable order from explicit selection, descending match score, descending Provider rank, ascending Provider name, and ascending candidate ID; duplicate Provider names are rejected within one Context.

## Selection and Compilation

The optimization service selects templates and cases in this order: explicit template or case IDs, Agent-supplied category and tags, local tag-index matches against the user intent, a category default template, and the global base template. A request without a case match still produces a valid result and adds a warning that a general template was used.

The first phase makes no auxiliary LLM request. The primary Agent derives category, visual-style, and scene hints from the user content and references; Providers perform deterministic local matching over the structured hints and original intent. A later semantic-search Provider may contribute candidates, but it must return the same candidate type and obey the same result limits and merge rules.

Merging applies explicit user requirements before domain constraints and template defaults. A lower-priority source cannot replace exact text, editing preservation requirements, reference roles, output dimensions, or user prohibitions. The compiler emits `canonicalPrompt` sections in a fixed order so the same request, configuration, and case snapshot produce the same result.

## Call Flow

1. The `image-generation` Skill catalog description covers image generation, image editing, and variation tasks.
2. The Agent loads the Skill and calls `image_optimize`.
3. The Tool Consumer resolves image references from the current direct user input, validates positions and roles, and calls `ctx.imageOptimizer.optimize()`.
4. The optimization service collects Provider candidates, sorts and merges them, and produces an `ImageGenerationSpec`.
5. The Tool returns the complete Spec; existing Session tool records retain the call arguments and result.
6. When the current environment has an external image tool, the Agent passes it the `canonicalPrompt`, durable references, and output requirements.
7. Without an executor, the Agent reports that the Spec is prepared and does not claim that an image was generated.

Skill catalog and tool instructions drive first-phase automatic routing, so this phase cannot reliably intercept an arbitrary image tool outside DSH. A future native DSH `image_generate` Consumer must call the optimization service inside execution to provide non-bypassable automatic optimization.

## Profile Composition

`dsh-base` mounts the optimization service, case-library Provider, and bundled Skill Provider on the Host plane. Headless, ordinary SDK, and ACP use the Base-owned global `image_optimize` tool.

Web continues to place model tools in Agent Presets. The `standard`, `ptc`, and `cordis` Presets each mount `tool-image-optimize`; they resolve the same Host-owned optimization service and case library without copying resources per Session.

`sdk-minimal` explicitly mounts the Skill Registry, bundled `image-generation` Skill, `tool-skill`, optimization service, case library, and `image_optimize`. It does not add user-directory Skill discovery or other Base tools. To support referenced image input, it also mounts the existing Attachment Service and local Provider; requests without references do not read Attachment data.

Desktop receives the general capability through formal package dependencies rather than `DSH_BUNDLED_SKILL_DIR` or the user-directory `gpt-image-2-style-library`. The Desktop-bundled `oasis-wiki` may remain in its existing resource directory until that domain knowledge receives a separate formal package owner.

Users and deployments can disable the Tool or Skill through a later Profile patch; every shipped DSH Profile enables them by default.

## Oasis and Cowart Integration

`oasis-wiki` continues to own UI Tree, Generation Package, Cowart visual review, component extraction, PSD-to-UMG, Native dynamic text, and editor-delivery rules. General template selection, visual-style selection, and normalized prompt compilation use `image_optimize`.

The Oasis workflow adds dynamic text, numbers, progress, hit targets, reusable controls, and editor-write restrictions to the unified Spec as explicit request constraints. It does not copy the case library or maintain a second general template-selection implementation.

Existing Provider model discovery and explicitly authorized direct generation remain in the Oasis execution phase. This design does not change their credential, authorization, or paid-call rules; the later general image-executor design decides whether to move them.

## Case Library and Source Governance

The initial Provider builds a controlled snapshot from `freestylefly/awesome-gpt-image-2`. Synchronization pins the upstream commit and emits a source manifest, resource hashes, template count, case count, and license record. Runtime reads only packaged resources and does not access the upstream network.

The upstream repository uses the MIT License, but its disclaimer notes that some public cases and images may carry third-party rights. The snapshot therefore includes categories, tags, template structures, case IDs, structured summaries, and source information by default. Case images, complete website code, account and billing code, API Providers, and complete third-party assets do not enter the DSH package. A complete case prompt enters the snapshot only when the synchronization manifest confirms that its source permits redistribution.

The synchronization script rejects unknown fields, duplicate IDs, missing source records, path traversal, executable files, and binary resources outside the allowlist. Generated snapshots use stable-key ordering for deterministic review and tests.

## Configuration and Limits

The optimization service exposes validated `maxCases`, `maxPromptBytes`, and `maxExactTextEntries` configuration. Shipped composition explicitly sets `maxCases: 3`, `maxPromptBytes: 16384`, and `maxExactTextEntries: 64`. The case Provider can configure an asset root for packaged carriers, but it must be absolute and activation validates the manifest and every required resource.

Limits apply where the complete result is known. Validation measures single oversized user fields, aggregate output, and multibyte content in UTF-8 bytes. Invalid configuration and packaged-resource failures reject plugin activation; invalid user requests return stable error codes during tool execution.

## Errors and Security

| Condition | Result |
|---|---|
| Image position does not exist | `IMAGE_REFERENCE_NOT_FOUND` |
| `edit` lacks a resolvable `edit-target` | `IMAGE_EDIT_TARGET_REQUIRED` |
| Multiple `edit-target` references | `IMAGE_EDIT_TARGET_AMBIGUOUS` |
| `variation` lacks a `content` reference | `IMAGE_VARIATION_SOURCE_REQUIRED` |
| `variation` contains an `edit-target` | `IMAGE_VARIATION_TARGET_UNSUPPORTED` |
| Exact-text requirements conflict | `needs_clarification` with affected fields |
| Explicit template or case ID does not exist | `IMAGE_OPTIMIZATION_SOURCE_NOT_FOUND` |
| No case matches automatically | Use the general template and add a warning |
| Case-library resource is corrupt | Provider activation fails |
| No image executor is available | Return `prepared` |

The optimizer does not read model credentials, discover models, call paid endpoints, download remote images, or execute case-library text. Provider output participates in merging only after public Schema validation. User input can populate request fields but cannot change the Skill, tool instructions, configuration limits, or Provider ordering rules.

## Testing

`image-optimizer` unit tests cover request validation, Provider sorting, explicit selection, tag matching, default templates, priority merging, UTF-8 byte limits, deterministic results, and Provider disposal.

Case-library Provider tests cover manifests, sources, license records, duplicate IDs, forbidden files, resource hashes, and snapshot stability. Synchronization tests use fixed input fixtures without network access.

Tool tests cover current-input image positions resolving to `ImageAttachmentRef`, role validation, stable error codes, tool presentation, and cancellation propagation. Real Loader composition tests start a Base-backed Profile, a Web Agent Preset, and `sdk-minimal` to verify that the service, Skill, and Tool are available in actual composition.

Key model-visible behavior uses keyless recorded Session Snapshots for the Skill catalog, Skill load, tool Schema, successful call, `needs_clarification`, and error results. Oasis regression tests verify that Generation Package, Cowart stages, and Provider-direct generation authorization rules remain valid.

Documentation updates include the new package-group and package README pairs, architecture capability table, Profile documentation, generated tool and configuration catalogs, and Oasis/Cowart workflow guidance. Before completion, run focused tests, Snapshots, type checking, documentation synchronization checks, and Git diff checks selected according to `dsh-pre-push-checks`.

## Implementation Phases

Phase one creates the Service Definition, case-library Provider, Tool Consumer, and formal Skill with unit tests and the case snapshot.

Phase two composes the capability into Base, Web Presets, SDK, ACP, Headless, `sdk-minimal`, and Desktop packaging dependencies, with real composition tests.

Phase three makes `oasis-wiki` and Cowart consume the unified Spec, removes their duplicate general prompt-selection rules, and adds regression coverage and Session Snapshots.

Phase four is a separately designed and implemented image-executor capability covering Provider registration, capability matching, budgets, authorization, retries, and result Attachments. Phase four is outside this design's implementation plan.

## Acceptance Criteria

- Every shipped DSH Agent and Profile can discover and call `image_optimize` by default.
- The same request, configuration, and case snapshot produce a byte-identical `ImageGenerationSpec`.
- The Spec contains no concrete image-model name, credential, or local image path.
- Without an executor, the capability returns only `prepared` and makes no paid call or false generation claim.
- `oasis-wiki` adds domain constraints to the unified Spec without maintaining a second general case library or template-selection implementation.
- Adding an image-model Provider does not require changes to the case library, formal Skill, or optimization-tool callers.
- Upstream synchronization does not add unauthorized case images, website runtime code, or resources outside the allowlist to the published package.
