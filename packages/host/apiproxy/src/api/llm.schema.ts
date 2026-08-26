/**
 * llm domain zod schemas (names derived from map keys: llmProvidersRequestSchema /
 * llmProvidersValueSchema / llmModelsRequestSchema / llmModelsValueSchema).
 */

import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'
import type { ConfigurableProviderView, DiscoveredModelView, ProviderProbeView } from './llm.ts'
import { modelCatalogFailureSchema, modelProviderGroupSchema, modelSelectionSchema } from './sessions.schema.ts'

/** ConfigurableProviderView row of llm.providers. */
export const configurableProviderViewSchema = z.object({
  provider: z.string().min(1),
  displayName: z.string().min(1),
  settingsNs: z.string(),
  settingsPath: z.array(z.string()),
  active: z.boolean(),
  declared: z.boolean().optional(),
}) satisfies z.ZodType<Wire<ConfigurableProviderView>>

/** llm.providers request payload. */
export const llmProvidersRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'llm.providers'>>>

/** llm.providers response value. */
export const llmProvidersValueSchema = z.object({
  providers: z.array(configurableProviderViewSchema),
}) satisfies z.ZodType<Wire<ResponseValue<'llm.providers'>>>

/** llm.models request payload. */
export const llmModelsRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'llm.models'>>>

/** llm.models response value. */
export const llmModelsValueSchema = z.object({
  groups: z.array(modelProviderGroupSchema),
  failures: z.array(modelCatalogFailureSchema),
}) satisfies z.ZodType<Wire<ResponseValue<'llm.models'>>>

/** llm.defaultModel request payload. */
export const llmDefaultModelRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'llm.defaultModel'>>>

/** llm.defaultModel response value. */
export const llmDefaultModelValueSchema = z.object({
  selected: modelSelectionSchema,
}) satisfies z.ZodType<Wire<ResponseValue<'llm.defaultModel'>>>

/** llm.selectDefaultModel request payload. */
export const llmSelectDefaultModelRequestSchema = modelSelectionSchema satisfies z.ZodType<Wire<RequestPayload<'llm.selectDefaultModel'>>>

/** llm.selectDefaultModel response value. */
export const llmSelectDefaultModelValueSchema = z.object({
  selected: modelSelectionSchema,
}) satisfies z.ZodType<Wire<ResponseValue<'llm.selectDefaultModel'>>>

/** Sanitized result row returned by llm.testProvider. */
export const providerProbeViewSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    stage: z.literal('response'),
    model: z.string().min(1),
    text: z.string(),
    elapsedMs: z.number().nonnegative(),
  }),
  z.object({
    ok: z.literal(false),
    stage: z.enum(['endpoint', 'authentication', 'protocol', 'model', 'response']),
    code: z.string().min(1),
    message: z.string(),
    elapsedMs: z.number().nonnegative(),
  }),
]) satisfies z.ZodType<Wire<ProviderProbeView>>

/** llm.testProvider request payload. */
export const llmTestProviderRequestSchema = z.object({
  settingsNs: z.string().min(1),
  provider: z.string().min(1).optional(),
  baseURL: z.string().min(1).optional(),
  api: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
  model: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'llm.testProvider'>>>

/** llm.testProvider response value. */
export const llmTestProviderValueSchema = z.object({
  probe: providerProbeViewSchema,
}) satisfies z.ZodType<Wire<ResponseValue<'llm.testProvider'>>>

/** DiscoveredModelView row of llm.discoverModels. */
export const discoveredModelViewSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  contextWindow: z.number().int().positive().optional(),
  maxTokens: z.number().int().positive().optional(),
}) satisfies z.ZodType<Wire<DiscoveredModelView>>

/** llm.discoverModels request payload. */
export const llmDiscoverModelsRequestSchema = z.object({
  settingsNs: z.string().min(1),
  provider: z.string().min(1).optional(),
  baseURL: z.string().min(1).optional(),
  api: z.string().min(1).optional(),
  // Write-only at the host: used for this one interrogation, never stored and
  // never returned. It does ride the client's outgoing envelope like every
  // other secret-bearing payload (`credentials.set`, `settings.update`), which
  // `subscribeEnvelopes()` observers can see — redacting that tap is a
  // configuration-plane-wide change, not this method's to make alone.
  apiKey: z.string().min(1).optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'llm.discoverModels'>>>

/** llm.discoverModels response value. */
export const llmDiscoverModelsValueSchema = z.object({
  models: z.array(discoveredModelViewSchema),
}) satisfies z.ZodType<Wire<ResponseValue<'llm.discoverModels'>>>
