/** Image optimization Service Definition (`ctx.imageOptimizer`). @module @deepseek-ai/dsh-image-optimizer */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'
import type {
  ImageOptimizationProvider,
  ImageOptimizationRequest,
  ImageOptimizationResult,
  ImageInputImages,
  ImageOptimizerOptions,
} from './types.ts'
import { compileCandidates, prepareRequest } from './compiler.ts'
import { ImageOptimizationRegistry } from './registry.ts'

export { parseCandidate } from './schema.ts'
export { ImageOptimizationError, ImageOptimizationInputError } from './errors.ts'
export type * from './types.ts'

/** Image optimizer configuration. All fields receive defaults during plugin activation. */
export interface Config {
  /** Maximum automatic case candidates selected for one optimization. */
  maxCases?: number
  /** Maximum UTF-8 bytes accepted in the complete serialized prepared result. */
  maxPromptBytes?: number
  /** Maximum exact-text requirements accepted for one optimization. */
  maxExactTextEntries?: number
}

interface ResolvedConfig {
  maxCases: number
  maxPromptBytes: number
  maxExactTextEntries: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    imageOptimizer: ImageOptimizer
    /** Current-turn image ordinals shared by image preparation and execution. */
    imageInputImages: ImageInputImages
  }
}

/** Concrete service owner for image optimization configuration and operations. */
export class ImageOptimizer extends Service {
  static Config: Schema<Config> = z.object({
    maxCases: z.number().step(1).min(1).default(3),
    maxPromptBytes: z.number().step(1).min(1).default(16384),
    maxExactTextEntries: z.number().step(1).min(1).default(64),
  })

  /** Validated deployment limits with every default materialized. */
  readonly config: ResolvedConfig

  private readonly registry: ImageOptimizationRegistry

  /**
   * Register one borrowed Provider until the returned disposer runs.
   * @param provider - Provider contributing explicit resolution and matching.
   * @returns disposer for the exact Provider registration.
   * @throws {Error} when the Provider identity is invalid or its name is already registered.
   */
  registerProvider(provider: ImageOptimizationProvider): () => void {
    return this.registry.registerProvider(this.ctx, provider)
  }

  /**
   * Select Provider evidence and prepare an executor-neutral specification.
   * @param request - complete Provider-neutral user task.
   * @param options - optional cancellation and durable reference transport.
   * @returns a prepared specification or caller-actionable clarification issues.
   * @throws {ImageOptimizationInputError} when request structure or configured limits are invalid.
   * @throws {ImageOptimizationError} when references, roles, or explicit source ids cannot be resolved.
   * @throws {DOMException} when cancellation is requested before compilation completes.
   */
  async optimize(
    request: ImageOptimizationRequest,
    options?: ImageOptimizerOptions,
  ): Promise<ImageOptimizationResult> {
    const prepared = prepareRequest(request, options, this.config.maxExactTextEntries)
    if (prepared.status === 'needs_clarification') return prepared
    const candidates = await this.registry.collect({
      ...(request.templateId === undefined ? {} : { templateId: request.templateId }),
      caseIds: request.caseIds,
    }, {
      intent: request.intent,
      locale: request.locale,
      ...(request.category === undefined ? {} : { category: request.category }),
      styleHints: request.styleHints,
      sceneHints: request.sceneHints,
    }, options?.signal)
    return {
      status: 'prepared',
      spec: compileCandidates(request, prepared, candidates, this.config),
    }
  }

  constructor(ctx: Context, config: Config) {
    super(ctx, 'imageOptimizer')
    this.config = config as ResolvedConfig
    this.registry = new ImageOptimizationRegistry()
  }
}

export default ImageOptimizer
