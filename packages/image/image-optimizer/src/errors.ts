/** Stable image-optimization input and domain failures. @module @deepseek-ai/dsh-image-optimizer/errors */

import type { ImageOptimizationErrorCode } from './types.ts'

/** Structural or configured-limit failure for later Tool invalid-argument mapping. */
export class ImageOptimizationInputError extends Error {
  /**
   * @param message - concrete explanation for the Consumer.
   * @param path - request or compiled field associated with the failure.
   */
  constructor(message: string, readonly path: string) {
    super(message)
    this.name = 'ImageOptimizationInputError'
  }
}

/** Stable image-optimization domain failure carrying a Consumer field path. */
export class ImageOptimizationError extends Error {
  /**
   * @param message - concrete explanation for the Consumer.
   * @param code - stable domain failure code.
   * @param path - request field associated with the failure.
   */
  constructor(
    message: string,
    readonly code: ImageOptimizationErrorCode,
    readonly path: string,
  ) {
    super(message)
    this.name = 'ImageOptimizationError'
  }
}
