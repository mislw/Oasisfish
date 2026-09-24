import type { Context } from '@deepseek-ai/cordis'
import type {
  ImageGenerationSpec,
  ImageOptimizationCandidate,
  ImageOptimizationProvider,
  ImageOptimizationRequest,
  ImageOptimizationResult,
  ImageOptimizerOptions,
  ImageReferenceRequest,
  ResolvedImageReference,
} from '@deepseek-ai/dsh-image-optimizer'

/** Return one complete provider candidate with optional field overrides. */
export function candidateFixture(
  overrides: Partial<ImageOptimizationCandidate> = {},
): ImageOptimizationCandidate {
  return {
    kind: 'case',
    id: 'case-fixture',
    category: 'general',
    score: 0.75,
    composition: ['centered subject'],
    visualStyle: ['editorial illustration'],
    scene: ['studio'],
    preserve: ['subject identity'],
    avoid: ['watermark'],
    requiredCapabilities: ['text'],
    visualStyleTags: ['editorial'],
    sceneTags: ['studio'],
    source: {
      title: 'Fixture source',
      url: 'https://example.test/case-fixture',
      license: 'CC0-1.0',
      redistributablePrompt: true,
    },
    ...overrides,
  }
}

/** Return one provider candidate with the identity and score used by a test. */
export function candidate(
  kind: 'template' | 'case',
  id: string,
  score: number,
): ImageOptimizationCandidate {
  return candidateFixture({ kind, id, score })
}

/** Return one deterministic provider for registry tests. */
export function provider(
  name: string,
  rank: number,
  matches: readonly ImageOptimizationCandidate[],
): ImageOptimizationProvider {
  return {
    name,
    rank,
    async resolve() {
      return matches
    },
    async match() {
      return matches
    },
  }
}

/** Return one complete generation request with optional field overrides. */
export function requestFixture(
  overrides: Partial<ImageOptimizationRequest> = {},
): ImageOptimizationRequest {
  return {
    operation: 'generate',
    intent: 'Create a square launch graphic.',
    references: [],
    exactText: [{ text: 'PLAY', placement: 'center', preserveCase: true }],
    output: {
      width: 1024,
      height: 1024,
      transparentBackground: false,
      count: 1,
    },
    preserve: ['logo geometry'],
    avoid: ['watermark'],
    locale: 'en',
    category: 'general',
    styleHints: ['editorial'],
    sceneHints: ['studio'],
    caseIds: [],
    ...overrides,
  }
}

/** Return an edit request using the supplied ordered reference roles. */
export function editRequest(
  references: readonly ImageReferenceRequest[],
): ImageOptimizationRequest {
  return requestFixture({ operation: 'edit', references })
}

/** Return a variation request using the supplied ordered reference roles. */
export function variationRequest(
  references: readonly ImageReferenceRequest[],
): ImageOptimizationRequest {
  return requestFixture({ operation: 'variation', references })
}

/** Return one edit-target reference for an input ordinal. */
export function target(inputIndex: number): ImageReferenceRequest {
  return { inputIndex, role: 'edit-target', priority: 1 }
}

/** Return one content reference for an input ordinal. */
export function content(inputIndex: number): ImageReferenceRequest {
  return { inputIndex, role: 'content', priority: 1 }
}

/** Return optimizer options carrying the supplied durable references. */
export function resolved(
  ...refs: readonly ResolvedImageReference[]
): ImageOptimizerOptions {
  return { resolvedReferences: refs }
}

/** Return the prepared specification or fail the calling test. */
export function prepared(result: ImageOptimizationResult): ImageGenerationSpec {
  if (result.status !== 'prepared') throw new Error('expected a prepared image optimization result')
  return result.spec
}

/** Return selected evidence identifiers in result order. */
export function ids(result: ImageOptimizationResult): string[] {
  return prepared(result).evidence.flatMap(evidence => [
    ...(evidence.templateId === undefined ? [] : [`${evidence.provider}:${evidence.templateId}`]),
    ...evidence.caseIds.map(id => `${evidence.provider}:${id}`),
  ])
}

/** Optimize the shared base request without resolved image inputs. */
export function optimizeBase(ctx: Context): Promise<ImageOptimizationResult> {
  return ctx.imageOptimizer.optimize(requestFixture(), resolved())
}
