import { describe, expect, it } from 'vitest'
import type { LlmTokenPricing, TokenUsage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { summarizeUsagePeriod } from '../src/usage-cost.ts'

const FLASH: LlmTokenPricing = {
  uncachedInput: { minimumNanoUsd: 150, maximumNanoUsd: 300 },
  cacheRead: { minimumNanoUsd: 3, maximumNanoUsd: 6 },
  output: { minimumNanoUsd: 600, maximumNanoUsd: 1_200 },
}

function event(seq: number, time: number, type: string, data: unknown): SessionEvent {
  return { seq, time, type, data } as unknown as SessionEvent
}

function header(seq: number, time: number, model = 'deepseek-flash'): SessionEvent {
  return event(seq, time, 'request/header', {
    header: { config: { provider: 'deepseek-official', model } },
  })
}

function usageEvent(
  seq: number,
  time: number,
  type: 'assistant/attempt' | 'assistant/message',
  usage: TokenUsage,
  step = 1,
): SessionEvent {
  return event(seq, time, type, {
    turn: 1,
    step,
    stream: [{ type: 'chunk', time, chunk: { type: 'usage', usage } }],
    ...(type === 'assistant/message' ? { usage } : {}),
  })
}

const pricing = (_provider: string, model: string): LlmTokenPricing | undefined =>
  model === 'deepseek-flash' ? FLASH : undefined

describe('usage cost summaries', () => {
  it('replaces same-attempt samples and prices disjoint cache buckets', () => {
    const value = summarizeUsagePeriod([
      header(0, 1),
      event(1, 2, 'turn/start', { turn: 1 }),
      usageEvent(2, 3, 'assistant/attempt', {
        inputTokens: 8, cacheReadTokens: 80, outputTokens: 4,
      }),
      usageEvent(3, 4, 'assistant/message', {
        inputTokens: 10, cacheReadTokens: 90, outputTokens: 5,
      }),
    ], pricing, 0, 10)

    expect(value).toMatchObject({
      uncachedInputTokens: 10,
      cacheReadTokens: 90,
      cacheWriteTokens: 0,
      outputTokens: 5,
      turns: 1,
      pricedRequests: 1,
      unpricedRequests: 0,
      minimumNanoUsd: 4_770,
      maximumNanoUsd: 9_540,
    })
  })

  it('adds retried attempts and filters by request occurrence time', () => {
    const value = summarizeUsagePeriod([
      header(0, 1),
      usageEvent(1, 4, 'assistant/attempt', { inputTokens: 2, outputTokens: 1 }),
      event(2, 5, 'llm/retry-started', { turn: 1, step: 1, retry: 1, retryId: 'r' }),
      usageEvent(3, 6, 'assistant/message', { inputTokens: 3, outputTokens: 2 }),
      usageEvent(4, 20, 'assistant/message', { inputTokens: 100, outputTokens: 100 }, 2),
    ], pricing, 0, 10)

    expect(value).toMatchObject({
      uncachedInputTokens: 5,
      outputTokens: 3,
      pricedRequests: 2,
      minimumNanoUsd: 2_550,
      maximumNanoUsd: 5_100,
    })
  })

  it('refuses to guess cache-write prices the provider did not publish', () => {
    const value = summarizeUsagePeriod([
      header(0, 1),
      usageEvent(1, 2, 'assistant/message', {
        inputTokens: 10, cacheReadTokens: 20, cacheWriteTokens: 30, outputTokens: 4,
      }),
    ], pricing, 0, 10)

    expect(value).toMatchObject({
      cacheWriteTokens: 30,
      pricedRequests: 0,
      unpricedRequests: 1,
      minimumNanoUsd: 0,
      maximumNanoUsd: 0,
    })
  })
})
