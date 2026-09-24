# Image optimization

English | [中文](image-optimization.zh.md)

Image optimization converts structured generation, editing, or variation intent into a provider-neutral `ImageGenerationSpec`. Four shipped components divide responsibility: the Service Definition owns public types, limits, Provider registration, validation, selection, and deterministic compilation; the offline library Provider contributes reusable guidance; the packaged Skill describes the preparation workflow; and the Tool Consumer collects model-visible requests, provides the shared current-turn image inventory, resolves attachment ordinals, and renders results. A separate generation Tool Consumer uses that same inventory when it executes prepared references. This subsystem prepares instructions only: it does not execute an image or model call, read credentials, or authorize an executor.

Source: [`packages/image/image-optimizer/src/types.ts`](../../packages/image/image-optimizer/src/types.ts)

## Request and attachment transport

The model-visible request refers by one-based ordinal only to direct-user images admitted for the calling Agent's current turn. The Tool Consumer resolves those ordinals to durable attachments in `ImageOptimizerOptions.resolvedReferences`, which stays outside the request and prevents provider names, credentials, storage paths, or attachment implementation details from entering the task vocabulary. Later accepted steps append images in message and content order; a new turn replaces the list.

```ts type-equiv
/** Current-turn direct-user image inputs shared by optimizer and executor Consumers. */
interface ImageInputImages {
  /**
   * Return a defensive copy of one live Agent's admitted current-turn images.
   * @param agent - live Agent whose current input is requested.
   * @returns durable image references in admitted message and content order.
   */
  references(agent: Agent): readonly ImageAttachmentRef[]
}
```

```ts type-equiv
/** Image operation requested by the Consumer. */
type ImageOperation = 'generate' | 'edit' | 'variation'
```

```ts type-equiv
/** Semantic role assigned to one ordered image input. */
type ImageReferenceRole = 'style' | 'layout' | 'content' | 'edit-target'
```

```ts type-equiv
/** One model-visible reference selection expressed by input ordinal. */
interface ImageReferenceRequest {
  inputIndex: number
  role: ImageReferenceRole
  priority: number
}
```

```ts type-equiv
/** Exact text that the generated image must preserve. */
interface ExactTextRequest {
  text: string
  placement?: string
  preserveCase: boolean
}
```

```ts type-equiv
/** Requested dimensions, transparency, and output count. */
interface ImageOutputRequest {
  aspectRatio?: string
  width?: number
  height?: number
  transparentBackground: boolean
  count: number
}
```

```ts type-equiv
/** Provider-neutral image task submitted by a Consumer. */
interface ImageOptimizationRequest {
  operation: ImageOperation
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

```ts type-equiv
/** Durable attachment resolved for one request input ordinal. */
interface ResolvedImageReference {
  inputIndex: number
  attachment: ImageAttachmentRef
}
```

```ts type-equiv
/** Cancellation and durable references supplied outside the model-visible request. */
interface ImageOptimizerOptions {
  signal?: AbortSignal
  resolvedReferences?: readonly ResolvedImageReference[]
}
```

## Prepared specification and outcomes

Only a `prepared` result carries instructions that a separate executor may accept. A Consumer must not interpret `needs_clarification` as executable work. Evidence records selected Provider identities and source ids without copying Provider-owned prompt bodies into the result.

```ts type-equiv
/** Resolved reference embedded in an executable generation specification. */
interface ImageReferencePlan extends ImageReferenceRequest {
  attachment: ImageAttachmentRef
}
```

```ts type-equiv
/** Exact-text requirement embedded in a generation specification. */
interface ExactTextRequirement extends ExactTextRequest {}
```

```ts type-equiv
/** Output requirement embedded in a generation specification. */
interface ImageOutputRequirement extends ImageOutputRequest {}
```

```ts type-equiv
/** Inspectable provider and source selection retained with a compiled specification. */
interface ImageOptimizationEvidence {
  provider: string
  templateId?: string
  caseIds: readonly string[]
  visualStyleTags: readonly string[]
  sceneTags: readonly string[]
}
```

```ts type-equiv
/** Complete provider-neutral instructions prepared for a future image executor. */
interface ImageGenerationSpec {
  schemaVersion: 1
  operation: ImageOperation
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

```ts type-equiv
/** Stable domain failure codes emitted by image optimization. */
type ImageOptimizationErrorCode =
  | 'IMAGE_REFERENCE_NOT_FOUND'
  | 'IMAGE_EDIT_TARGET_REQUIRED'
  | 'IMAGE_EDIT_TARGET_AMBIGUOUS'
  | 'IMAGE_VARIATION_SOURCE_REQUIRED'
  | 'IMAGE_VARIATION_TARGET_UNSUPPORTED'
  | 'IMAGE_OPTIMIZATION_SOURCE_NOT_FOUND'
```

```ts type-equiv
/** One caller-actionable clarification issue. */
interface ImageOptimizationIssue {
  code: 'IMAGE_EXACT_TEXT_CONFLICT'
  path: string
  message: string
}
```

```ts type-equiv
/** Closed optimization outcome returned to the Consumer. */
type ImageOptimizationResult =
  | { status: 'prepared'; spec: ImageGenerationSpec }
  | { status: 'needs_clarification'; issues: readonly ImageOptimizationIssue[] }
```

## Provider contract

Providers receive explicit ids through `resolve()` and provider-neutral task hints through `match()`. They return one normalized candidate form. `parseCandidate()` rejects undeclared candidate and source fields before registry admission. Provider source material, ranking implementation, and licenses remain Provider-owned.

```ts type-equiv
/** Explicit provider-owned template and case selection. */
interface ImageOptimizationSelection {
  templateId?: string
  caseIds: readonly string[]
}
```

```ts type-equiv
/** Provider-neutral fields used for deterministic candidate matching. */
interface ImageOptimizationQuery {
  intent: string
  locale: string
  category?: string
  styleHints: readonly string[]
  sceneHints: readonly string[]
}
```

```ts type-equiv
/** Normalized, runtime-validated template or case returned by a Provider. */
interface ImageOptimizationCandidate {
  kind: 'template' | 'case'
  id: string
  category?: string
  score: number
  composition: readonly string[]
  visualStyle: readonly string[]
  scene: readonly string[]
  preserve: readonly string[]
  avoid: readonly string[]
  requiredCapabilities: readonly string[]
  visualStyleTags: readonly string[]
  sceneTags: readonly string[]
  source: { title: string; url: string; license: string; redistributablePrompt: boolean }
}
```

```ts type-equiv
/** Provider that resolves explicit evidence and matches task hints. */
interface ImageOptimizationProvider {
  name: string
  rank: number
  resolve(selection: ImageOptimizationSelection, signal?: AbortSignal): Promise<readonly ImageOptimizationCandidate[]>
  match(query: ImageOptimizationQuery, signal?: AbortSignal): Promise<readonly ImageOptimizationCandidate[]>
}
```

## Service, configuration, and failures

Mounting `@deepseek-ai/dsh-image-optimizer` publishes `ctx.imageOptimizer`. Its public operations are `registerProvider(provider): () => void` and `optimize(request, options): Promise<ImageOptimizationResult>`. Provider registration is borrowed same-process state; the returned disposer owns the exact contribution. Cancellation travels through `ImageOptimizerOptions.signal`.

The same Service Definition package declares `ctx.imageInputImages` because optimizer and executor Consumers must share one ordinal inventory. `@deepseek-ai/dsh-tool-image-optimize` provides it from accepted current-turn direct-user messages, consumes it to resolve optimization references, and returns defensive copies. Prepared `@deepseek-ai/dsh-tool-image-generate` execution consumes the same lookup to resolve `ImageGenerationSpec.references`; it does not rebuild ordering from the latest message.

| Field | Default | Requirement |
|---|---:|---|
| `maxCases` | `3` | Positive integer limiting automatically selected case candidates. |
| `maxPromptBytes` | `16384` | Positive integer limiting the complete serialized prepared result in UTF-8 bytes. |
| `maxExactTextEntries` | `64` | Positive integer limiting exact-text requirements. |

Invalid self-contained configuration fails during plugin activation. `ImageOptimizationInputError` carries the path for structural request and configured-limit failures; Tool Consumers map it to the Tool runtime's stable invalid-argument failure. `ImageOptimizationError` carries a stable `ImageOptimizationErrorCode` and request `path`; clarification issues remain ordinary `needs_clarification` results. Tool Consumers own model-visible presentation.

The bundled library selects deterministically from validated local resources and performs no network or auxiliary model request. Its shipped bootstrap contains the DSH-owned global fallback; a reviewed synchronized snapshot may add redistributable template guidance and metadata-only upstream cases, but no case prompt, prompt preview, or image without an explicit redistribution grant.

The prepared specification contains no concrete model, credential, or local path. It is persisted and shown only through the Consumer's existing `tool/call` and `tool/result` handling; this subsystem adds no Session event type. Executor selection, credential use, input authorization, image execution, and result storage remain separate responsibilities.

See [durable attachments](attachment.md) for `ImageAttachmentRef` and [tools](tools.md) for Consumer execution and result ownership.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctximageoptimizer--imageoptimizer"></a>

### `ctx.imageOptimizer` — `ImageOptimizer`

Concrete service owner for image optimization configuration and operations.

```ts cordis-catalog
/**
 * Register one borrowed Provider until the returned disposer runs.
 * @param provider - Provider contributing explicit resolution and matching.
 * @returns disposer for the exact Provider registration.
 * @throws {Error} when the Provider identity is invalid or its name is already registered.
 */
registerProvider(provider: ImageOptimizationProvider): () => void

/**
 * Select Provider evidence and prepare an executor-neutral specification.
 * @param request - complete Provider-neutral user task.
 * @param options - optional cancellation and durable reference transport.
 * @returns a prepared specification or caller-actionable clarification issues.
 * @throws {ImageOptimizationInputError} when request structure or configured limits are invalid.
 * @throws {ImageOptimizationError} when references, roles, or explicit source ids cannot be resolved.
 * @throws {DOMException} when cancellation is requested before compilation completes.
 */
async optimize( request: ImageOptimizationRequest, options?: ImageOptimizerOptions, ): Promise<ImageOptimizationResult>
```

Source: [`packages/image/image-optimizer/src/index.ts`](../../packages/image/image-optimizer/src/index.ts)
<!-- END GENERATED cordis-surface -->
