/**
 * Request-local provider connection testing for configuration drafts.
 *
 * @module dsh-llm-pi-ai/probe
 */

import {
  assertUsableApiKey,
  createUserMessage,
  errorChain,
  isHarnessError,
} from '@deepseek-ai/dsh-llm'
import type {
  LlmFailure,
  LlmProviderProbeRequest,
  LlmProviderProbeResult,
  LlmProviderProbeStage,
} from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from './adapter.ts'
import type { PiAiAuthInjection } from './adapter.ts'
import { resolveProfiles } from './config.ts'
import { supportedProtocols } from './provider.ts'

const PROBE_TIMEOUT_MS = 15_000
// Some OpenAI-compatible gateways reject smaller caps before model execution.
const PROBE_MAX_TOKENS = 16
const MAX_RESPONSE_TEXT = 200

/** Dependencies needed to test one draft without joining the live adapter registry. */
export interface PiAiProviderProbeOptions {
  /** Stable auth injectables shared with normal pi-ai collections. */
  auth: PiAiAuthInjection
  /** Resolve the stored key for an existing draft route, when one exists. */
  storedApiKey: (provider: string | undefined) => Promise<string | undefined>
}

/** Return one sanitized failure result without provider bodies or credentials. */
function failureResult(
  startedAt: number,
  stage: LlmProviderProbeStage,
  code: string,
  message: string,
): LlmProviderProbeResult {
  return { ok: false, stage, code, message, elapsedMs: Date.now() - startedAt }
}

/** Classify one adapter failure using stable codes and pi-ai's normalized status text. */
function classifyFailure(
  failure: LlmFailure,
  sawResponse: boolean,
): LlmProviderProbeStage {
  if (failure.code === 'AUTH' || failure.code === 'INVALID_CREDENTIAL' || failure.code === 'MISSING_CREDENTIAL') {
    return 'authentication'
  }
  if (/\bno api key\b/i.test(failure.message)) return 'authentication'
  if (failure.code === 'UNKNOWN_MODEL' || /\b404\b.*\bmodel\b|\bmodel\b.*\b404\b/i.test(failure.message)) {
    return 'model'
  }
  if (failure.code === 'TRANSPORT' || failure.code === 'TIMEOUT') return sawResponse ? 'response' : 'endpoint'
  return 'response'
}

/** User-facing text for a classified probe failure. */
function failureMessage(stage: LlmProviderProbeStage, model: string): string {
  switch (stage) {
    case 'endpoint': return 'Provider endpoint could not be reached.'
    case 'authentication': return 'Provider rejected the credential.'
    case 'protocol': return 'The selected protocol cannot test this provider.'
    case 'model': return `Provider rejected model "${model}".`
    case 'response': return 'Provider returned an unusable response.'
  }
}

/** Remove any request credential from the short assistant sample. */
function sanitizeText(text: string, secrets: readonly (string | undefined)[]): string {
  let sanitized = text
  for (const secret of secrets) {
    if (secret !== undefined && secret.length > 0) sanitized = sanitized.replaceAll(secret, '[redacted]')
  }
  return sanitized.slice(0, MAX_RESPONSE_TEXT)
}

/**
 * Test one draft provider profile through a temporary pi-ai adapter.
 * @param request - request-local endpoint, protocol, credential, model, and cancellation.
 * @param options - shared auth and stored-key resolution dependencies.
 * @returns a sanitized result that never changes settings or live routing.
 */
export async function testProvider(
  request: LlmProviderProbeRequest,
  options: PiAiProviderProbeOptions,
): Promise<LlmProviderProbeResult> {
  const startedAt = Date.now()
  const api = request.api ?? 'openai-completions'
  if (!supportedProtocols().includes(api)) {
    return failureResult(startedAt, 'protocol', 'UNSUPPORTED_PROTOCOL', failureMessage('protocol', request.model))
  }
  const baseURL = request.baseURL
  if (baseURL === undefined || baseURL.length === 0) {
    return failureResult(startedAt, 'endpoint', 'INVALID_ENDPOINT', failureMessage('endpoint', request.model))
  }

  const provider = request.provider ?? '__probe__'
  const storedApiKey = request.apiKey === undefined
    ? await options.storedApiKey(request.provider)
    : undefined
  let apiKey = request.apiKey ?? storedApiKey
  try {
    if (apiKey !== undefined) apiKey = assertUsableApiKey(apiKey, 'llm-pi-ai', 'provider probe credential')
  } catch (error: unknown) {
    const code = isHarnessError(error) ? error.code : 'INVALID_CREDENTIAL'
    return failureResult(startedAt, 'authentication', code, failureMessage('authentication', request.model))
  }

  let profiles
  try {
    profiles = resolveProfiles({
      [provider]: {
        api,
        baseURL,
        models: [{ id: request.model }],
        streamIdleTimeoutMs: PROBE_TIMEOUT_MS,
      },
    })
  } catch (_invalidDraft) {
    return failureResult(startedAt, 'protocol', 'INVALID_PROTOCOL', failureMessage('protocol', request.model))
  }

  const adapter = new PiAiAdapter({
    profiles: () => profiles,
    resolveApiKey: () => Promise.resolve(apiKey),
    auth: options.auth,
  })
  const timeoutSignal = AbortSignal.timeout(PROBE_TIMEOUT_MS)
  const signal = request.signal === undefined
    ? timeoutSignal
    : AbortSignal.any([request.signal, timeoutSignal])
  let text = ''
  let sawResponse = false

  try {
    for await (const chunk of adapter.stream({
      provider,
      model: request.model,
      messages: [createUserMessage({
        content: [{ type: 'text', text: 'Reply with exactly OK.' }],
        source: { kind: 'plugin', plugin: 'llm-pi-ai' },
      })],
      maxTokens: PROBE_MAX_TOKENS,
      signal,
    })) {
      if (chunk.type === 'text-delta') {
        sawResponse = true
        text += chunk.text
        continue
      }
      if (chunk.type === 'block-start' || chunk.type === 'block-end') sawResponse = true
      if (chunk.type !== 'finish') continue
      if (chunk.reason.kind === 'stop' && text.length > 0) {
        return {
          ok: true,
          stage: 'response',
          model: request.model,
          text: sanitizeText(text, [request.apiKey, storedApiKey]),
          elapsedMs: Date.now() - startedAt,
        }
      }
      if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') {
        if (request.signal?.aborted) {
          return failureResult(startedAt, 'endpoint', 'ABORTED', 'Provider test was cancelled.')
        }
        if (timeoutSignal.aborted) {
          return failureResult(startedAt, sawResponse ? 'response' : 'endpoint', 'TIMEOUT', 'Provider test timed out.')
        }
        const stage = classifyFailure(chunk.reason.failure, sawResponse)
        return failureResult(startedAt, stage, chunk.reason.failure.code, failureMessage(stage, request.model))
      }
      return failureResult(startedAt, 'response', 'INCOMPLETE_RESPONSE', failureMessage('response', request.model))
    }
  } catch (error: unknown) {
    if (request.signal?.aborted) {
      return failureResult(startedAt, 'endpoint', 'ABORTED', 'Provider test was cancelled.')
    }
    if (timeoutSignal.aborted) {
      return failureResult(startedAt, sawResponse ? 'response' : 'endpoint', 'TIMEOUT', 'Provider test timed out.')
    }
    const failure: LlmFailure = {
      code: isHarnessError(error) ? error.code : 'PROBE_FAILED',
      message: errorChain(error),
    }
    const stage = classifyFailure(failure, sawResponse)
    return failureResult(startedAt, stage, failure.code, failureMessage(stage, request.model))
  }

  return failureResult(startedAt, 'response', 'INCOMPLETE_RESPONSE', failureMessage('response', request.model))
}
