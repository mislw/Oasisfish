/** Provider-priced request usage folds for Session and time-range summaries. */

import { lastAssistantStreamChunk, type LlmTokenPricing, type TokenUsage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'
import type { TokenUsageProjection } from './projection.ts'

/** One priced or explicitly unpriced request contribution. */
export interface UsageCostRequest {
  readonly provider: string
  readonly model: string
  readonly occurredAt: number
  readonly usage: TokenUsageProjection
  readonly minimumNanoUsd?: number | undefined
  readonly maximumNanoUsd?: number | undefined
}

/** Cumulative request-cost estimate with the most recent request disclosure. */
export interface UsageCostProjection {
  readonly minimumNanoUsd: number
  readonly maximumNanoUsd: number
  readonly pricedRequests: number
  readonly unpricedRequests: number
  readonly latest?: UsageCostRequest | undefined
}

/** Token and cost totals over an explicit event-time interval. */
export interface UsagePeriodSummary extends UsageCostProjection, TokenUsageProjection {
  readonly turns: number
}

/** Synchronous route-price resolver supplied by the mounted LLM runtime. */
export type TokenPricingResolver = (
  provider: string,
  model: string,
  occurredAt: number,
) => LlmTokenPricing | undefined

type UsageCostProjectionDefinition = ProjectionDefinition<'usageCost', UsageCostState> & {
  wire: NonNullable<ProjectionDefinition<'usageCost', UsageCostState>['wire']>
}

interface CostContribution {
  readonly minimumNanoUsd: number
  readonly maximumNanoUsd: number
  readonly pricedRequests: number
  readonly unpricedRequests: number
}

interface UsageCostState extends UsageCostProjection {
  readonly route?: { readonly provider: string; readonly model: string } | undefined
  readonly last?: (UsageCostRequest & CostContribution & { readonly turn: number; readonly step: number }) | undefined
}

const usageSchema = z.object({
  uncachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
}).strict()

const requestSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  occurredAt: z.number().int().nonnegative(),
  usage: usageSchema,
  minimumNanoUsd: z.number().int().nonnegative().optional(),
  maximumNanoUsd: z.number().int().nonnegative().optional(),
}).strict()

const projectionSchemaObject = z.object({
  minimumNanoUsd: z.number().int().nonnegative(),
  maximumNanoUsd: z.number().int().nonnegative(),
  pricedRequests: z.number().int().nonnegative(),
  unpricedRequests: z.number().int().nonnegative(),
  latest: requestSchema.optional(),
}).strict()

const projectionSchema = projectionSchemaObject as unknown as z.ZodType<UsageCostProjection>

const stateSchema = projectionSchemaObject.extend({
  route: z.object({ provider: z.string().min(1), model: z.string().min(1) }).strict().optional(),
  last: requestSchema.extend({
    minimumNanoUsd: z.number().int().nonnegative(),
    maximumNanoUsd: z.number().int().nonnegative(),
    pricedRequests: z.number().int().nonnegative(),
    unpricedRequests: z.number().int().nonnegative(),
    turn: z.number().int().nonnegative(),
    step: z.number().int().nonnegative(),
  }).strict().optional(),
}).strict()

const zeroUsage = (): TokenUsageProjection => ({
  uncachedInputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
})

const usageOf = (event: SessionEvent): TokenUsage | undefined => {
  if (event.type === 'assistant/message' && event.data.usage !== undefined) return event.data.usage
  if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return undefined
  return lastAssistantStreamChunk(event.data.stream, 'usage')?.usage
}

const usageBuckets = (usage: TokenUsage): TokenUsageProjection => ({
  uncachedInputTokens: usage.inputTokens,
  outputTokens: usage.outputTokens,
  cacheReadTokens: usage.cacheReadTokens ?? 0,
  cacheWriteTokens: usage.cacheWriteTokens ?? 0,
})

function addPrice(tokens: number, price: { minimumNanoUsd: number; maximumNanoUsd: number }): CostContribution {
  return {
    minimumNanoUsd: tokens * price.minimumNanoUsd,
    maximumNanoUsd: tokens * price.maximumNanoUsd,
    pricedRequests: 0,
    unpricedRequests: 0,
  }
}

function priceUsage(usage: TokenUsageProjection, pricing: LlmTokenPricing | undefined): CostContribution {
  if (pricing === undefined || (usage.cacheWriteTokens > 0 && pricing.cacheWrite === undefined)) {
    return { minimumNanoUsd: 0, maximumNanoUsd: 0, pricedRequests: 0, unpricedRequests: 1 }
  }
  const parts = [
    addPrice(usage.uncachedInputTokens, pricing.uncachedInput),
    addPrice(usage.cacheReadTokens, pricing.cacheRead),
    addPrice(usage.outputTokens, pricing.output),
    ...(pricing.cacheWrite === undefined ? [] : [addPrice(usage.cacheWriteTokens, pricing.cacheWrite)]),
  ]
  return {
    minimumNanoUsd: parts.reduce((sum, part) => sum + part.minimumNanoUsd, 0),
    maximumNanoUsd: parts.reduce((sum, part) => sum + part.maximumNanoUsd, 0),
    pricedRequests: 1,
    unpricedRequests: 0,
  }
}

function subtract(left: CostContribution, right: CostContribution | undefined): CostContribution {
  return {
    minimumNanoUsd: left.minimumNanoUsd - (right?.minimumNanoUsd ?? 0),
    maximumNanoUsd: left.maximumNanoUsd - (right?.maximumNanoUsd ?? 0),
    pricedRequests: left.pricedRequests - (right?.pricedRequests ?? 0),
    unpricedRequests: left.unpricedRequests - (right?.unpricedRequests ?? 0),
  }
}

function add(left: CostContribution, right: CostContribution): CostContribution {
  return {
    minimumNanoUsd: left.minimumNanoUsd + right.minimumNanoUsd,
    maximumNanoUsd: left.maximumNanoUsd + right.maximumNanoUsd,
    pricedRequests: left.pricedRequests + right.pricedRequests,
    unpricedRequests: left.unpricedRequests + right.unpricedRequests,
  }
}

function requestOf(
  event: SessionEvent<'assistant/message'> | SessionEvent<'assistant/attempt'>,
  route: UsageCostState['route'],
  resolvePricing: TokenPricingResolver,
): (UsageCostRequest & CostContribution & { readonly turn: number; readonly step: number }) | undefined {
  const usage = usageOf(event)
  if (usage === undefined || route === undefined) return undefined
  const buckets = usageBuckets(usage)
  const cost = priceUsage(buckets, resolvePricing(route.provider, route.model, event.time))
  return {
    ...route,
    occurredAt: event.time,
    usage: buckets,
    ...cost,
    turn: event.data.turn,
    step: event.data.step,
  }
}

function publicRequest(request: NonNullable<UsageCostState['last']>): UsageCostRequest {
  return {
    provider: request.provider,
    model: request.model,
    occurredAt: request.occurredAt,
    usage: request.usage,
    ...(request.pricedRequests === 0 ? {} : {
      minimumNanoUsd: request.minimumNanoUsd,
      maximumNanoUsd: request.maximumNanoUsd,
    }),
  }
}

function foldCostState(
  state: UsageCostState,
  event: SessionEvent,
  resolvePricing: TokenPricingResolver,
): UsageCostState {
  if (event.type === 'request/header') {
    const { provider, model } = event.data.header.config
    return state.route?.provider === provider && state.route.model === model
      ? state
      : { ...state, route: { provider, model } }
  }
  if (event.type === 'llm/retry-started') {
    if (state.last?.turn !== event.data.turn || state.last.step !== event.data.step) return state
    const { last: _removed, ...withoutLast } = state
    return withoutLast
  }
  if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return state
  const request = requestOf(event, state.route, resolvePricing)
  if (request === undefined) return state
  const previous = state.last?.turn === request.turn && state.last.step === request.step
    ? state.last
    : undefined
  const totals = add(subtract(state, previous), request)
  return { ...state, ...totals, last: request, latest: publicRequest(request) }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Provider-priced request totals and the latest request disclosure. */
    usageCost: UsageCostProjection
  }
  interface SessionProjectionStateMap {
    usageCost: UsageCostState
  }
}

/**
 * Build the request-cost Session projection with the current adapter-price resolver.
 * @param resolvePricing - synchronous provider/model price lookup.
 * @returns projection definition registered by token-meter.
 */
export function usageCostProjectionDefinition(resolvePricing: TokenPricingResolver): UsageCostProjectionDefinition {
  return {
    key: 'usageCost',
    stateVersion: 1,
    stateSchema,
    init: () => ({ minimumNanoUsd: 0, maximumNanoUsd: 0, pricedRequests: 0, unpricedRequests: 0 }),
    apply: (state, event) => foldCostState(state, event, resolvePricing),
    wire: {
      viewSchema: projectionSchema,
      view: state => ({
        minimumNanoUsd: state.minimumNanoUsd,
        maximumNanoUsd: state.maximumNanoUsd,
        pricedRequests: state.pricedRequests,
        unpricedRequests: state.unpricedRequests,
        ...state.latest === undefined ? {} : { latest: state.latest },
      }),
    },
  } satisfies ProjectionDefinition<'usageCost', UsageCostState> & { wire: NonNullable<ProjectionDefinition<'usageCost', UsageCostState>['wire']> }
}

/**
 * Summarize usage whose final request sample occurred inside one time interval.
 * @param events - one Session's non-inherited durable events in log order.
 * @param resolvePricing - synchronous provider/model price lookup.
 * @param fromInclusive - interval start in Unix epoch milliseconds.
 * @param toExclusive - interval end in Unix epoch milliseconds.
 * @returns detached usage, Turn, request, and estimated-cost totals.
 */
export function summarizeUsagePeriod(
  events: readonly SessionEvent[],
  resolvePricing: TokenPricingResolver,
  fromInclusive: number,
  toExclusive: number,
): UsagePeriodSummary {
  let state: UsageCostState = {
    minimumNanoUsd: 0,
    maximumNanoUsd: 0,
    pricedRequests: 0,
    unpricedRequests: 0,
  }
  let usage = zeroUsage()
  let lastUsage: (TokenUsageProjection & { turn: number; step: number; occurredAt: number }) | undefined
  const turns = new Set<number>()
  for (const event of events) {
    if (event.type === 'request/header') {
      state = foldCostState(state, event, resolvePricing)
      continue
    }
    if (event.type === 'turn/start' && event.time >= fromInclusive && event.time < toExclusive) turns.add(event.data.turn)
    if (event.type === 'llm/retry-started'
      && lastUsage?.turn === event.data.turn && lastUsage.step === event.data.step) {
      lastUsage = undefined
      state = foldCostState(state, event, resolvePricing)
      continue
    }
    if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') continue
    const sample = usageOf(event)
    if (sample === undefined || event.time < fromInclusive || event.time >= toExclusive) continue
    state = foldCostState(state, event, resolvePricing)
    const next = { ...usageBuckets(sample), turn: event.data.turn, step: event.data.step, occurredAt: event.time }
    const previous = lastUsage?.turn === next.turn && lastUsage.step === next.step ? lastUsage : undefined
    usage = {
      uncachedInputTokens: usage.uncachedInputTokens - (previous?.uncachedInputTokens ?? 0) + next.uncachedInputTokens,
      outputTokens: usage.outputTokens - (previous?.outputTokens ?? 0) + next.outputTokens,
      cacheReadTokens: usage.cacheReadTokens - (previous?.cacheReadTokens ?? 0) + next.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens - (previous?.cacheWriteTokens ?? 0) + next.cacheWriteTokens,
    }
    lastUsage = next
  }
  return {
    ...usage,
    turns: turns.size,
    minimumNanoUsd: state.minimumNanoUsd,
    maximumNanoUsd: state.maximumNanoUsd,
    pricedRequests: state.pricedRequests,
    unpricedRequests: state.unpricedRequests,
    ...state.latest === undefined ? {} : { latest: state.latest },
  }
}
