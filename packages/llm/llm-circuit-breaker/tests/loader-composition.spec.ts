import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import * as circuitBreaker from '@deepseek-ai/dsh-llm-circuit-breaker'

class FailingAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    yield {
      type: 'finish',
      reason: { kind: 'error', failure: { code: 'SERVER', message: 'provider unavailable' } },
    }
  }
}

async function drain(stream: AsyncIterable<StreamChunk>): Promise<void> {
  for await (const _chunk of stream) { /* drain */ }
}

describe('llm circuit-breaker Loader composition', () => {
  it('keeps namespace exports Loader-safe and removes policy state on disposal', async () => {
    expect('default' in circuitBreaker).toBe(false)
    const loader = Object.create(Loader.prototype) as Loader
    expect(loader.unwrapExports(circuitBreaker)).toBe(circuitBreaker)
    expect(circuitBreaker.name).toBe('llm-circuit-breaker')
    expect(circuitBreaker.inject).toEqual(['llm'])

    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    const adapter = new FailingAdapter()
    ctx.llm.registerAdapter(['mock'], adapter)
    const plugin = loader.unwrapExports(circuitBreaker) as Parameters<Context['plugin']>[0]
    const fiber = await ctx.plugin(plugin, { failureThreshold: 2, openDurationMs: 30_000 })
    const request = { provider: 'mock', model: 'mock', messages: [] }

    await drain(ctx.llm.stream(request))
    await drain(ctx.llm.stream(request))
    await drain(ctx.llm.stream(request))
    expect(adapter.requests).toHaveLength(2)

    await fiber.dispose()
    await drain(ctx.llm.stream(request))
    expect(adapter.requests).toHaveLength(3)
  })
})
