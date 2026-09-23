/** Official DeepSeek token-price ranges used for user-facing cost estimates. */

import type { LlmTokenPricing, LlmTokenUnitPriceRange } from '@deepseek-ai/dsh-llm'

function range(minimumNanoUsd: number, maximumNanoUsd: number): LlmTokenUnitPriceRange {
  return { minimumNanoUsd, maximumNanoUsd }
}

const FLASH: LlmTokenPricing = Object.freeze({
  cacheRead: range(3, 6),
  uncachedInput: range(150, 300),
  output: range(600, 1_200),
})

const V4_PRO: LlmTokenPricing = Object.freeze({
  cacheRead: range(22, 44),
  uncachedInput: range(660, 1_320),
  output: range(1_980, 3_960),
})

/**
 * Resolve the published peak/off-peak price interval for an official DeepSeek model.
 * The provider's holiday and discount classification is intentionally retained
 * as a range; custom model ids remain unpriced.
 * @param model - exact DeepSeek model id.
 * @returns immutable per-token USD ranges, or `undefined` for an unknown model.
 */
export function deepSeekTokenPricing(model: string): LlmTokenPricing | undefined {
  if (model === 'deepseek-flash') return FLASH
  if (model === 'deepseek-v4-pro') return V4_PRO
  return undefined
}
