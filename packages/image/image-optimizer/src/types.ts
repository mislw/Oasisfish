/** Public image-optimization request, provider, and result types. @module @deepseek-ai/dsh-image-optimizer/types */

import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { Agent } from '@deepseek-ai/dsh-agent'

/** Current-turn direct-user image inputs shared by optimizer and executor Consumers. */
export interface ImageInputImages {
  /**
   * Return a defensive copy of one live Agent's admitted current-turn images.
   * @param agent - live Agent whose current input is requested.
   * @returns durable image references in admitted message and content order.
   */
  references(agent: Agent): readonly ImageAttachmentRef[]
}

/** Image operation requested by the Consumer. */
export type ImageOperation = 'generate' | 'edit' | 'variation'

/** Semantic role assigned to one ordered image input. */
export type ImageReferenceRole = 'style' | 'layout' | 'content' | 'edit-target'

/** One model-visible reference selection expressed by input ordinal. */
export interface ImageReferenceRequest {
  inputIndex: number
  role: ImageReferenceRole
  priority: number
}

/** Exact text that the generated image must preserve. */
export interface ExactTextRequest {
  text: string
  placement?: string
  preserveCase: boolean
}

/** Requested dimensions, transparency, and output count. */
export interface ImageOutputRequest {
  aspectRatio?: string
  width?: number
  height?: number
  transparentBackground: boolean
  count: number
}

/** Provider-neutral image task submitted by a Consumer. */
export interface ImageOptimizationRequest {
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

/** Durable attachment resolved for one request input ordinal. */
export interface ResolvedImageReference {
  inputIndex: number
  attachment: ImageAttachmentRef
}

/** Cancellation and durable references supplied outside the model-visible request. */
export interface ImageOptimizerOptions {
  signal?: AbortSignal
  resolvedReferences?: readonly ResolvedImageReference[]
}

/** Resolved reference embedded in an executable generation specification. */
export interface ImageReferencePlan extends ImageReferenceRequest {
  attachment: ImageAttachmentRef
}

/** Exact-text requirement embedded in a generation specification. */
export interface ExactTextRequirement extends ExactTextRequest {}

/** Output requirement embedded in a generation specification. */
export interface ImageOutputRequirement extends ImageOutputRequest {}

/** Inspectable provider and source selection retained with a compiled specification. */
export interface ImageOptimizationEvidence {
  provider: string
  templateId?: string
  caseIds: readonly string[]
  visualStyleTags: readonly string[]
  sceneTags: readonly string[]
}

/** Complete provider-neutral instructions prepared for a future image executor. */
export interface ImageGenerationSpec {
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

/** Stable domain failure codes emitted by image optimization. */
export type ImageOptimizationErrorCode =
  | 'IMAGE_REFERENCE_NOT_FOUND'
  | 'IMAGE_EDIT_TARGET_REQUIRED'
  | 'IMAGE_EDIT_TARGET_AMBIGUOUS'
  | 'IMAGE_VARIATION_SOURCE_REQUIRED'
  | 'IMAGE_VARIATION_TARGET_UNSUPPORTED'
  | 'IMAGE_OPTIMIZATION_SOURCE_NOT_FOUND'

/** One caller-actionable clarification issue. */
export interface ImageOptimizationIssue {
  code: 'IMAGE_EXACT_TEXT_CONFLICT'
  path: string
  message: string
}

/** Closed optimization outcome returned to the Consumer. */
export type ImageOptimizationResult =
  | { status: 'prepared'; spec: ImageGenerationSpec }
  | { status: 'needs_clarification'; issues: readonly ImageOptimizationIssue[] }

/** Explicit provider-owned template and case selection. */
export interface ImageOptimizationSelection {
  templateId?: string
  caseIds: readonly string[]
}

/** Provider-neutral fields used for deterministic candidate matching. */
export interface ImageOptimizationQuery {
  intent: string
  locale: string
  category?: string
  styleHints: readonly string[]
  sceneHints: readonly string[]
}

/** Normalized, runtime-validated template or case returned by a Provider. */
export interface ImageOptimizationCandidate {
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

/** Provider that resolves explicit evidence and matches task hints. */
export interface ImageOptimizationProvider {
  name: string
  rank: number
  resolve(selection: ImageOptimizationSelection, signal?: AbortSignal): Promise<readonly ImageOptimizationCandidate[]>
  match(query: ImageOptimizationQuery, signal?: AbortSignal): Promise<readonly ImageOptimizationCandidate[]>
}
