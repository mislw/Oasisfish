import { describe, expect, it } from 'vitest'
import { deepSeekTokenPricing } from '../src/common/token-pricing.ts'

describe('DeepSeek token pricing', () => {
  it('publishes the official flash peak and off-peak range', () => {
    expect(deepSeekTokenPricing('deepseek-flash')).toEqual({
      cacheRead: { minimumNanoUsd: 3, maximumNanoUsd: 6 },
      uncachedInput: { minimumNanoUsd: 150, maximumNanoUsd: 300 },
      output: { minimumNanoUsd: 600, maximumNanoUsd: 1_200 },
    })
  })

  it('publishes the official pro peak and off-peak range', () => {
    expect(deepSeekTokenPricing('deepseek-v4-pro')).toEqual({
      cacheRead: { minimumNanoUsd: 22, maximumNanoUsd: 44 },
      uncachedInput: { minimumNanoUsd: 660, maximumNanoUsd: 1_320 },
      output: { minimumNanoUsd: 1_980, maximumNanoUsd: 3_960 },
    })
  })

  it('leaves custom and future model ids unpriced', () => {
    expect(deepSeekTokenPricing('custom-model')).toBeUndefined()
  })
})
