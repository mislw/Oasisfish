import { Context } from '@deepseek-ai/cordis'
import { CIRCUIT_OPEN_CODE } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import * as circuitBreaker from '@deepseek-ai/dsh-llm-circuit-breaker'

type FinishReason = Extract<StreamChunk, { type: 'finish' }>['reason']

const baseConfig = { failureThreshold: 2, openDurationMs: 30_000 }

function terminal(reason: FinishReason): AsyncIterable<StreamChunk> {
  return (async function* () { yield { type: 'finish', reason } })()
}

function options(provider = 'mock'): GenerateOptions {
  return { provider, model: 'mock', messages: [] }
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

function invoke(
  ctx: Context,
  provider: string,
  downstream: () => AsyncIterable<StreamChunk>,
): AsyncIterable<StreamChunk> {
  return ctx.waterfall(ctx as never, 'llm/stream', options(provider), downstream)
}

function failure(code: string): AsyncIterable<StreamChunk> {
  return terminal({ kind: 'error', failure: { code, message: code } })
}

function success(): AsyncIterable<StreamChunk> {
  return terminal({ kind: 'stop' })
}

function aborted(): AsyncIterable<StreamChunk> {
  return terminal({ kind: 'aborted', failure: { code: 'ABORTED', message: 'aborted' } })
}

function setup(config: circuitBreaker.Config = baseConfig): {
  ctx: Context
  setNow: (value: number) => void
} {
  let current = 0
  const ctx = new Context()
  circuitBreaker.apply(ctx, config, { now: () => current })
  return { ctx, setNow: (value) => { current = value } }
}

async function request(
  ctx: Context,
  provider: string,
  result: AsyncIterable<StreamChunk>,
  calls: { value: number },
): Promise<StreamChunk[]> {
  return collect(invoke(ctx, provider, () => {
    calls.value += 1
    return result
  }))
}

async function open(ctx: Context, calls: { value: number }, provider = 'mock'): Promise<void> {
  await request(ctx, provider, failure('SERVER'), calls)
  await request(ctx, provider, failure('SERVER'), calls)
}

describe('llm circuit-breaker config', () => {
  it.each([
    [{ failureThreshold: 0 }, /failureThreshold/],
    [{ failureThreshold: 1.5 }, /failureThreshold/],
    [{ failureThreshold: Number.MAX_SAFE_INTEGER + 1 }, /failureThreshold/],
    [{ openDurationMs: 0 }, /openDurationMs/],
    [{ openDurationMs: 2_147_483_648 }, /openDurationMs/],
    [{ failureCodes: [] }, /failureCodes/],
    [{ failureCodes: ['SERVER', 'SERVER'] }, /duplicate/],
    [{ failureCodes: [''] }, /non-empty/],
    [{ failureCodes: ['ABORTED'] }, /ABORTED/],
    [{ failureCodes: ['CIRCUIT_OPEN'] }, /CIRCUIT_OPEN/],
  ])('rejects %o', (config, message) => {
    expect(() => circuitBreaker.apply(new Context(), config)).toThrow(message)
  })
})

describe('llm provider-route circuit-breaker', () => {
  it('uses the default clock and failure-code policy', async () => {
    const ctx = new Context()
    circuitBreaker.apply(ctx, { failureThreshold: 1 })
    const calls = { value: 0 }
    await request(ctx, 'mock', failure('SERVER'), calls)
    await request(ctx, 'mock', success(), calls)
    expect(calls.value).toBe(1)
  })

  it('opens at the configured consecutive failure threshold', async () => {
    const { ctx } = setup()
    const calls = { value: 0 }
    await open(ctx, calls)

    const chunks = await request(ctx, 'mock', success(), calls)

    expect(chunks.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'error', failure: { code: CIRCUIT_OPEN_CODE } },
    })
    expect(calls.value).toBe(2)
  })

  it('resets consecutive failures after a successful response', async () => {
    const { ctx } = setup()
    const calls = { value: 0 }
    await request(ctx, 'mock', failure('SERVER'), calls)
    await request(ctx, 'mock', success(), calls)
    await request(ctx, 'mock', failure('SERVER'), calls)
    await request(ctx, 'mock', success(), calls)
    expect(calls.value).toBe(4)
  })

  it.each([
    ['AUTH', failure('AUTH')],
    ['aborted', aborted()],
  ])('does not increment the failure count for %s results', async (_name, ignored) => {
    const { ctx } = setup()
    const calls = { value: 0 }
    await request(ctx, 'mock', ignored, calls)
    await request(ctx, 'mock', failure('SERVER'), calls)
    await request(ctx, 'mock', success(), calls)
    expect(calls.value).toBe(3)
  })

  it('isolates provider routes', async () => {
    const { ctx } = setup()
    const calls = { value: 0 }
    await open(ctx, calls, 'a')
    const chunks = await request(ctx, 'b', success(), calls)
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    expect(calls.value).toBe(3)
  })

  it('admits exactly one half-open probe', async () => {
    const { ctx, setNow } = setup()
    const calls = { value: 0 }
    await open(ctx, calls)
    setNow(30_000)

    const probe = invoke(ctx, 'mock', () => {
      calls.value += 1
      return success()
    })
    const rejected = await request(ctx, 'mock', success(), calls)

    expect(rejected.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'error', failure: { code: CIRCUIT_OPEN_CODE } },
    })
    expect(calls.value).toBe(3)
    await collect(probe)
  })

  it('closes after a successful half-open probe', async () => {
    const { ctx, setNow } = setup()
    const calls = { value: 0 }
    await open(ctx, calls)
    setNow(30_000)
    await request(ctx, 'mock', success(), calls)
    await request(ctx, 'mock', success(), calls)
    expect(calls.value).toBe(4)
  })

  it('reopens after a transient half-open failure', async () => {
    const { ctx, setNow } = setup()
    const calls = { value: 0 }
    await open(ctx, calls)
    setNow(30_000)
    await request(ctx, 'mock', failure('SERVER'), calls)
    setNow(59_999)
    await request(ctx, 'mock', success(), calls)
    expect(calls.value).toBe(3)
    setNow(60_000)
    await request(ctx, 'mock', success(), calls)
    expect(calls.value).toBe(4)
  })

  it('closes after a definitive half-open error', async () => {
    const { ctx, setNow } = setup()
    const calls = { value: 0 }
    await open(ctx, calls)
    setNow(30_000)
    await request(ctx, 'mock', failure('AUTH'), calls)
    await request(ctx, 'mock', success(), calls)
    expect(calls.value).toBe(4)
  })

  it.each([
    ['aborted finish', () => aborted(), false],
    ['stream without finish', () => (async function* (): AsyncIterable<StreamChunk> {})(), false],
    ['throwing stream', () => (async function* (): AsyncIterable<StreamChunk> { throw new Error('probe failed') })(), true],
  ] as const)('releases half-open ownership after a %s', async (_name, probeResult, throws) => {
    const { ctx, setNow } = setup()
    const calls = { value: 0 }
    await open(ctx, calls)
    setNow(30_000)
    if (throws) await expect(request(ctx, 'mock', probeResult(), calls)).rejects.toThrow('probe failed')
    else await expect(request(ctx, 'mock', probeResult(), calls)).resolves.toBeDefined()
    await request(ctx, 'mock', success(), calls)
    expect(calls.value).toBe(4)
  })

  it('releases half-open ownership after early iterator return', async () => {
    const { ctx, setNow } = setup()
    const calls = { value: 0 }
    await open(ctx, calls)
    setNow(30_000)
    const stream = invoke(ctx, 'mock', () => {
      calls.value += 1
      return (async function* (): AsyncIterable<StreamChunk> {
        yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
        yield* success()
      })()
    })
    for await (const _chunk of stream) break
    await request(ctx, 'mock', success(), calls)
    expect(calls.value).toBe(4)
  })

  it('releases half-open ownership after a synchronous downstream throw', async () => {
    const { ctx, setNow } = setup()
    const calls = { value: 0 }
    await open(ctx, calls)
    setNow(30_000)
    expect(() => invoke(ctx, 'mock', () => {
      calls.value += 1
      throw new Error('sync probe failure')
    })).toThrow('sync probe failure')
    await request(ctx, 'mock', success(), calls)
    expect(calls.value).toBe(4)
  })

  it('leaves a closed route available after a synchronous downstream throw', async () => {
    const { ctx } = setup()
    const calls = { value: 0 }
    expect(() => invoke(ctx, 'mock', () => {
      calls.value += 1
      throw new Error('sync closed failure')
    })).toThrow('sync closed failure')
    await request(ctx, 'mock', success(), calls)
    expect(calls.value).toBe(2)
  })

  it('ignores stale closed completions after a newer generation opens', async () => {
    const { ctx } = setup()
    const calls = { value: 0 }
    const first = invoke(ctx, 'mock', () => { calls.value += 1; return failure('SERVER') })
    const second = invoke(ctx, 'mock', () => { calls.value += 1; return failure('SERVER') })
    const staleSuccess = invoke(ctx, 'mock', () => { calls.value += 1; return success() })
    await collect(first)
    await collect(second)
    await collect(staleSuccess)
    await request(ctx, 'mock', success(), calls)
    expect(calls.value).toBe(3)
  })

  it('does not let resolved probe cleanup overwrite the closed generation', async () => {
    const { ctx, setNow } = setup()
    const calls = { value: 0 }
    await open(ctx, calls)
    setNow(30_000)
    const probe = invoke(ctx, 'mock', () => { calls.value += 1; return success() })
    await collect(probe)
    await request(ctx, 'mock', failure('SERVER'), calls)
    await request(ctx, 'mock', success(), calls)
    expect(calls.value).toBe(5)
  })

  it('ignores a stale second terminal result from the completed probe', async () => {
    const { ctx, setNow } = setup()
    const calls = { value: 0 }
    await open(ctx, calls)
    setNow(30_000)
    await request(ctx, 'mock', (async function* (): AsyncIterable<StreamChunk> {
      yield* success()
      yield* failure('SERVER')
    })(), calls)
    await request(ctx, 'mock', success(), calls)
    expect(calls.value).toBe(4)
  })
})
