/**
 * Process-local circuit breaking for physical LLM provider-route requests.
 * @module @deepseek-ai/dsh-llm-circuit-breaker
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { CIRCUIT_OPEN_CODE } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'

const DEFAULT_FAILURE_CODES = Object.freeze([
  'EMPTY_RESPONSE',
  'RATE_LIMIT',
  'SERVER',
  'TIMEOUT',
  'TRANSPORT',
])
const MAX_DURATION_MS = 2_147_483_647

/** Cordis plugin name used by Loader diagnostics. */
export const name = 'llm-circuit-breaker'

/** Service required to register the model-stream policy. */
export const inject = ['llm']

/** Circuit policy applied uniformly to every provider route. */
export interface Config {
  /** Consecutive configured failures required to open a route. */
  failureThreshold?: number
  /** Milliseconds before an open route admits one recovery probe. */
  openDurationMs?: number
  /** Provider failure codes that count as transient route failures. */
  failureCodes?: string[]
}

/** Runtime schema for {@link Config}; semantic limits are checked during activation. */
export const Config: z<Config> = z.object({
  failureThreshold: z.number().default(6),
  openDurationMs: z.number().default(30_000),
  failureCodes: z.array(z.string()).default([...DEFAULT_FAILURE_CODES]),
})

/** Non-serializable hooks used to make time and identity deterministic in tests. */
export interface CircuitBreakerInternals {
  /** Monotonic-enough millisecond clock used for open intervals. */
  now?: () => number
  /** Unique identity factory for state generations and probes. */
  token?: () => object
}

interface ResolvedConfig {
  failureThreshold: number
  openDurationMs: number
  failureCodes: ReadonlySet<string>
}

type CircuitState =
  | { kind: 'closed'; generation: object; failures: number }
  | { kind: 'open'; generation: object; probeAt: number }
  | { kind: 'half-open'; generation: object; probe: object }

type Ticket =
  | { kind: 'closed'; provider: string; generation: object }
  | { kind: 'probe'; provider: string; generation: object; probe: object }

function resolveConfig(config: Config): ResolvedConfig {
  const failureThreshold = config.failureThreshold ?? 6
  const openDurationMs = config.openDurationMs ?? 30_000
  const failureCodes = config.failureCodes ?? [...DEFAULT_FAILURE_CODES]
  if (!Number.isSafeInteger(failureThreshold) || failureThreshold <= 0) {
    throw new Error('llm-circuit-breaker: failureThreshold must be a positive safe integer')
  }
  if (!Number.isSafeInteger(openDurationMs) || openDurationMs <= 0 || openDurationMs > MAX_DURATION_MS) {
    throw new Error(`llm-circuit-breaker: openDurationMs must be a positive safe integer at most ${MAX_DURATION_MS}`)
  }
  if (!Array.isArray(failureCodes) || failureCodes.length === 0) {
    throw new Error('llm-circuit-breaker: failureCodes must be a non-empty array')
  }
  const unique = new Set<string>()
  for (const code of failureCodes) {
    if (typeof code !== 'string' || code.trim() === '') {
      throw new Error('llm-circuit-breaker: failureCodes entries must be non-empty strings')
    }
    if (unique.has(code)) throw new Error(`llm-circuit-breaker: duplicate failure code "${code}"`)
    if (code === 'ABORTED' || code === CIRCUIT_OPEN_CODE) {
      throw new Error(`llm-circuit-breaker: failureCodes must not contain reserved code "${code}"`)
    }
    unique.add(code)
  }
  return { failureThreshold, openDurationMs, failureCodes: unique }
}

function circuitOpen(provider: string): AsyncIterable<StreamChunk> {
  return (async function* (): AsyncIterable<StreamChunk> {
    yield {
      type: 'finish',
      reason: {
        kind: 'error',
        failure: {
          code: CIRCUIT_OPEN_CODE,
          message: `LLM provider "${provider}" is temporarily unavailable because its circuit is open; retry later.`,
        },
      },
    }
  })()
}

/**
 * Install one process-local circuit breaker shared by all calls in this plugin context.
 * @param ctx - plugin context that owns the stream listener and route state.
 * @param config - thresholds and transient provider failure codes.
 * @param internals - deterministic time and identity hooks for tests.
 */
export function apply(ctx: Context, config: Config = {}, internals: CircuitBreakerInternals = {}): void {
  const resolved = resolveConfig(config)
  const now = internals.now ?? Date.now
  const token = internals.token ?? (() => ({}))
  const states = new Map<string, CircuitState>()

  function currentClosed(provider: string): Extract<CircuitState, { kind: 'closed' }> {
    const created = { kind: 'closed' as const, generation: token(), failures: 0 }
    states.set(provider, created)
    return created
  }

  function releaseProbe(ticket: Extract<Ticket, { kind: 'probe' }>): void {
    states.set(ticket.provider, { kind: 'open', generation: token(), probeAt: now() })
  }

  function classify(ticket: Ticket, chunk: Extract<StreamChunk, { type: 'finish' }>): void {
    const current = states.get(ticket.provider)
    if (ticket.kind === 'closed') {
      if (current?.kind !== 'closed' || current.generation !== ticket.generation) return
      if (chunk.reason.kind === 'error' && resolved.failureCodes.has(chunk.reason.failure.code)) {
        const failures = current.failures + 1
        if (failures >= resolved.failureThreshold) {
          states.set(ticket.provider, {
            kind: 'open',
            generation: token(),
            probeAt: now() + resolved.openDurationMs,
          })
          ctx.logger.info(`llm-circuit-breaker: opened provider route "${ticket.provider}" after ${failures} failures`)
        } else {
          states.set(ticket.provider, { ...current, failures })
        }
      } else if (chunk.reason.kind !== 'error' && chunk.reason.kind !== 'aborted' && current.failures !== 0) {
        states.set(ticket.provider, { ...current, failures: 0 })
      }
      return
    }

    if (current?.kind !== 'half-open'
      || current.generation !== ticket.generation
      || current.probe !== ticket.probe) return
    if (chunk.reason.kind === 'aborted') return
    if (chunk.reason.kind === 'error' && resolved.failureCodes.has(chunk.reason.failure.code)) {
      states.set(ticket.provider, {
        kind: 'open',
        generation: token(),
        probeAt: now() + resolved.openDurationMs,
      })
      ctx.logger.info(`llm-circuit-breaker: reopened provider route "${ticket.provider}" after a failed probe`)
      return
    }
    states.set(ticket.provider, { kind: 'closed', generation: token(), failures: 0 })
    ctx.logger.info(`llm-circuit-breaker: closed provider route "${ticket.provider}" after a recovery probe`)
  }

  function observe(ticket: Ticket, downstream: AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
    return (async function* (): AsyncIterable<StreamChunk> {
      let resolvedOutcome = false
      try {
        for await (const chunk of downstream) {
          if (chunk.type === 'finish') {
            classify(ticket, chunk)
            resolvedOutcome = chunk.reason.kind !== 'aborted'
          }
          yield chunk
        }
      } finally {
        if (ticket.kind === 'probe' && !resolvedOutcome) releaseProbe(ticket)
      }
    })()
  }

  ctx.on('llm/stream', (options: GenerateOptions, next): AsyncIterable<StreamChunk> => {
    const provider = options.provider
    const state = states.get(provider) ?? currentClosed(provider)
    let ticket: Ticket
    if (state.kind === 'closed') {
      ticket = { kind: 'closed', provider, generation: state.generation }
    } else if (state.kind === 'open' && now() >= state.probeAt) {
      const probe = token()
      states.set(provider, { kind: 'half-open', generation: state.generation, probe })
      ticket = { kind: 'probe', provider, generation: state.generation, probe }
      ctx.logger.info(`llm-circuit-breaker: probing provider route "${provider}"`)
    } else {
      return circuitOpen(provider)
    }

    try {
      return observe(ticket, next())
    } catch (error: unknown) {
      if (ticket.kind === 'probe') releaseProbe(ticket)
      throw error
    }
  })
}
