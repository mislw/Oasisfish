import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as LlmPiAi from '@deepseek-ai/dsh-llm-pi-ai'
import { testProvider } from '../src/probe.ts'
import { memoryAuth } from './auth-double.ts'
import { closeMockServers, mockServer } from './mock-server.ts'

afterEach(async () => {
  await closeMockServers()
})

const chatOkEvents = [
  '{"choices":[{"delta":{"role":"assistant","content":""},"index":0,"finish_reason":null}]}',
  '{"choices":[{"delta":{"content":"OK"},"index":0,"finish_reason":null}]}',
  '{"choices":[{"delta":{},"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1}}',
  '[DONE]',
]

const responsesOkEvents = [
  JSON.stringify({ type: 'response.created', response: { id: 'resp_probe' } }),
  JSON.stringify({
    type: 'response.output_item.added',
    output_index: 0,
    item: { type: 'message', id: 'msg_probe', role: 'assistant', content: [] },
  }),
  JSON.stringify({
    type: 'response.output_text.delta',
    output_index: 0,
    content_index: 0,
    item_id: 'msg_probe',
    delta: 'OK',
  }),
  JSON.stringify({
    type: 'response.output_item.done',
    output_index: 0,
    item: {
      type: 'message',
      id: 'msg_probe',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: 'OK', annotations: [] }],
    },
  }),
  JSON.stringify({
    type: 'response.completed',
    response: {
      id: 'resp_probe',
      status: 'completed',
      output: [],
      usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 },
    },
  }),
]

function options(storedApiKey?: string) {
  return {
    auth: memoryAuth(),
    storedApiKey: () => Promise.resolve(storedApiKey),
  }
}

describe('draft provider probe', () => {
  it('tests an OpenAI Chat Completions draft with the typed credential', async () => {
    const server = await mockServer([{ events: chatOkEvents }])

    const result = await testProvider({
      provider: 'probe-route',
      baseURL: server.url,
      api: 'openai-completions',
      apiKey: 'sk-draft',
      model: 'probe-model',
    }, options('sk-stored'))

    expect(result).toMatchObject({ ok: true, stage: 'response', model: 'probe-model', text: 'OK' })
    expect(server.paths).toEqual(['/chat/completions'])
    expect(server.requests[0]).toMatchObject({ max_completion_tokens: 16 })
    expect(server.headers[0]?.authorization).toBe('Bearer sk-draft')
    expect(JSON.stringify(result)).not.toContain('sk-draft')
  })

  it('tests an OpenAI Responses draft and falls back to the stored credential', async () => {
    const server = await mockServer([{ events: responsesOkEvents }])

    const result = await testProvider({
      provider: 'probe-route',
      baseURL: `${server.url}/v1`,
      api: 'openai-responses',
      model: 'probe-model',
    }, options('sk-stored'))

    expect(result).toMatchObject({ ok: true, stage: 'response', model: 'probe-model', text: 'OK' })
    expect(server.paths).toEqual(['/v1/responses'])
    expect(server.headers[0]?.authorization).toBe('Bearer sk-stored')
    expect(JSON.stringify(result)).not.toContain('sk-stored')
  })

  it.each([401, 403])('classifies HTTP %s as an authentication failure', async (status) => {
    const server = await mockServer([{ status, body: JSON.stringify({ error: { message: 'denied' } }) }])

    const result = await testProvider({
      baseURL: server.url,
      api: 'openai-completions',
      apiKey: 'sk-secret',
      model: 'probe-model',
    }, options())

    expect(result).toMatchObject({ ok: false, stage: 'authentication', code: 'AUTH' })
    expect(JSON.stringify(result)).not.toContain('sk-secret')
  })

  it('classifies a missing credential as an authentication failure', async () => {
    const server = await mockServer([{ events: chatOkEvents }])

    await expect(testProvider({
      baseURL: server.url,
      api: 'openai-completions',
      model: 'probe-model',
    }, options())).resolves.toMatchObject({ ok: false, stage: 'authentication' })
    expect(server.paths).toEqual([])
  })

  it('redacts a credential echoed by the provider response', async () => {
    const echoed = chatOkEvents.map(event => event.replace('"OK"', '"sk-draft"'))
    const server = await mockServer([{ events: echoed }])

    const result = await testProvider({
      baseURL: server.url,
      api: 'openai-completions',
      apiKey: 'sk-draft',
      model: 'probe-model',
    }, options())

    expect(result).toMatchObject({ ok: true, text: '[redacted]' })
    expect(JSON.stringify(result)).not.toContain('sk-draft')
  })

  it('classifies a rejected model separately from endpoint and protocol failures', async () => {
    const server = await mockServer([{
      status: 404,
      body: JSON.stringify({ error: { message: 'model probe-model was not found' } }),
    }])

    await expect(testProvider({
      baseURL: server.url,
      api: 'openai-completions',
      apiKey: 'sk-test',
      model: 'probe-model',
    }, options())).resolves.toMatchObject({ ok: false, stage: 'model' })

    await expect(testProvider({
      baseURL: server.url,
      api: 'google-generative-ai',
      model: 'probe-model',
    }, options())).resolves.toMatchObject({ ok: false, stage: 'protocol' })

    await expect(testProvider({
      baseURL: 'http://127.0.0.1:9/v1',
      api: 'openai-completions',
      apiKey: 'sk-test',
      model: 'probe-model',
    }, options())).resolves.toMatchObject({ ok: false, stage: 'endpoint' })
  })

  it('classifies malformed or incomplete provider streams as response failures', async () => {
    const malformed = await mockServer([{ events: ['not-json'] }])
    const incomplete = await mockServer([{ events: chatOkEvents.slice(0, 2) }])

    await expect(testProvider({
      baseURL: malformed.url,
      api: 'openai-completions',
      apiKey: 'sk-test',
      model: 'probe-model',
    }, options())).resolves.toMatchObject({ ok: false, stage: 'response' })

    await expect(testProvider({
      baseURL: incomplete.url,
      api: 'openai-completions',
      apiKey: 'sk-test',
      model: 'probe-model',
    }, options())).resolves.toMatchObject({ ok: false, stage: 'response' })
  })

  it('reports caller cancellation as ABORTED', async () => {
    const result = await testProvider({
      baseURL: 'http://127.0.0.1:9/v1',
      api: 'openai-completions',
      model: 'probe-model',
      signal: AbortSignal.abort('cancel probe'),
    }, options())

    expect(result).toMatchObject({ ok: false, code: 'ABORTED' })
  })

  it('registers and withdraws the namespace probe with the plugin fiber', async () => {
    const server = await mockServer([{ events: chatOkEvents }])
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    const fiber = await ctx.plugin(LlmPiAi, {})

    await expect(ctx.llm.testProvider('llm-pi-ai', {
      baseURL: server.url,
      api: 'openai-completions',
      apiKey: 'sk-draft',
      model: 'probe-model',
    })).resolves.toMatchObject({ ok: true, text: 'OK' })

    await fiber.dispose()
    await expect(ctx.llm.testProvider('llm-pi-ai', {
      baseURL: server.url,
      api: 'openai-completions',
      model: 'probe-model',
    })).rejects.toMatchObject({ code: 'NO_PROVIDER_PROBE' })
  })
})
