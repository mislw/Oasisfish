import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { AttachmentId, type SaveImageAttachment } from '@deepseek-ai/dsh-attachment'
import { SettingsProvider, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { publicHttpNetwork } from '../../../web/web-fetch-http/src/network.ts'
import ImageGenerationService, {
  IMAGE_GENERATION_SETTINGS_NAMESPACE,
  type Config,
} from '../src/index.ts'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb])
const REFERENCE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])
const contexts: Context[] = []

class MemorySettings extends SettingsProvider {
  constructor(ctx: Context, private readonly rawDocument: Record<string, unknown>) {
    super(ctx)
  }

  get writable(): boolean { return true }
  protected load(): Promise<Record<string, unknown>> { return Promise.resolve(structuredClone(this.rawDocument)) }
  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.rawDocument[ns] = structuredClone(section)
    return Promise.resolve()
  }
}

interface ProviderProfile {
  apiKeyEnv?: string
  baseURL?: string
  headers?: Record<string, string>
}

interface SetupOptions {
  config?: Config
  providers?: Record<string, ProviderProfile>
  attachments?: boolean
  credential?: string | undefined
}

function formEntry(form: FormData, name: string): FormDataEntryValue {
  const value = form.get(name)
  if (value === null) throw new Error(`missing form entry ${name}`)
  return value
}

const attachment = {
  attachmentId: AttachmentId('sha256:generated'),
  mediaType: 'image/png' as const,
  bytes: PNG.byteLength,
  width: 1,
  height: 1,
  name: 'generated.png',
}

async function setup(options: SetupOptions = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(MemorySettings, {
    'llm-pi-ai': { providers: options.providers ?? {} },
  })
  ctx.settings.register('llm-pi-ai', z.any())
  const saveImage = vi.fn((_input: SaveImageAttachment) => Promise.resolve(attachment))
  const readImage = vi.fn()
  if (options.attachments !== false) ctx.provide('attachments', { saveImage, readImage } as never)
  if ('credential' in options) {
    const resolve = vi.fn(() => Promise.resolve(options.credential === undefined
      ? undefined
      : { value: options.credential, source: 'test' }))
    ctx.provide('credentials', { resolve } as never)
  }
  await ctx.plugin(ImageGenerationService, {
    provider: options.config?.provider ?? 'relay',
    model: options.config?.model ?? 'gpt-image-1',
    endpointPath: options.config?.endpointPath ?? 'images/generations',
    editEndpointPath: options.config?.editEndpointPath ?? 'images/edits',
    fallbackProvider: options.config?.fallbackProvider ?? '',
    fallbackModel: options.config?.fallbackModel ?? '',
    fallbackEndpointPath: options.config?.fallbackEndpointPath ?? 'images/generations',
    fallbackEditEndpointPath: options.config?.fallbackEditEndpointPath ?? 'images/edits',
    maxResponseBytes: options.config?.maxResponseBytes ?? 1024,
  })
  return { ctx, saveImage, readImage }
}

function imageResponse(value: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function parsedRequestBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== 'string') throw new TypeError('expected a JSON request body')
  return JSON.parse(body) as unknown
}

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

describe('ImageGenerationService', () => {
  it('runs four independent candidates and keeps partial success', async () => {
    const { ctx, saveImage } = await setup({
      config: {
        provider: 'primary', model: 'primary-image',
        fallbackProvider: 'backup', fallbackModel: 'backup-image',
      },
      providers: {
        primary: { baseURL: 'https://primary.example/v1' },
        backup: { baseURL: 'https://backup.example/v1' },
      },
    })
    const encoded = Buffer.from(PNG).toString('base64')
    const fetchMock = vi.fn(async (_url: URL | string, init?: RequestInit) => {
      const body = parsedRequestBody(init?.body) as { prompt: string }
      if (body.prompt.endsWith('Candidate variation: variation 4')) return new Response('{}', { status: 503 })
      if (String(_url).includes('primary.example') && body.prompt.endsWith('Candidate variation: variation 2')) {
        return new Response('{}', { status: 503 })
      }
      return imageResponse({ data: [{ b64_json: encoded }] })
    })
    vi.stubGlobal('fetch', fetchMock)
    saveImage.mockImplementation(async ({ name }: SaveImageAttachment) => ({
      ...attachment, name: name ?? 'generated.png',
    }))

    await expect(ctx.imageGeneration.generate({
      prompt: 'shared prompt', count: 4,
      variations: ['variation 1', 'variation 2', 'variation 3', 'variation 4'],
    })).resolves.toMatchObject({
      images: [
        { provider: 'primary', candidateIndex: 0, attachment: { name: 'generated-1.png' } },
        { provider: 'backup', candidateIndex: 1, attachment: { name: 'generated-2.png' } },
        { provider: 'primary', candidateIndex: 2, attachment: { name: 'generated-3.png' } },
      ],
      failedCount: 1,
    })
    expect(fetchMock).toHaveBeenCalledTimes(6)
    expect(saveImage).toHaveBeenCalledTimes(3)
  })

  it('registers its settings namespace from composition defaults', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(MemorySettings, {})
    await ctx.plugin(ImageGenerationService, {
      endpointPath: 'images/generations',
      maxResponseBytes: 25_000_000,
    })

    await vi.waitFor(() => {
      expect(ctx.settings.describe().find(view => view.ns === IMAGE_GENERATION_SETTINGS_NAMESPACE)?.value)
        .toEqual({
          provider: '', model: '',
          endpointPath: 'images/generations', editEndpointPath: 'images/edits',
          fallbackProvider: '', fallbackModel: '',
          fallbackEndpointPath: 'images/generations', fallbackEditEndpointPath: 'images/edits',
        })
    })
  })

  it('uses a stored credential, provider headers, live selection, and Base64 response', async () => {
    const { ctx, saveImage } = await setup({
      config: { provider: '', model: '' },
      providers: {
        relay: { baseURL: 'https://relay.example/v1', apiKeyEnv: 'IMAGE_API_KEY', headers: { 'x-relay': 'yes' } },
      },
      credential: 'secret-key',
    })
    await ctx.settings.update(IMAGE_GENERATION_SETTINGS_NAMESPACE, {
      provider: 'relay', model: 'gpt-image-1', endpointPath: 'images/generations',
    })
    const fetchMock = vi.fn(() => Promise.resolve(imageResponse({
      data: [{ b64_json: Buffer.from(PNG).toString('base64') }],
    })))
    vi.stubGlobal('fetch', fetchMock)
    const signal = new AbortController().signal

    await expect(ctx.imageGeneration.generate({
      prompt: 'inventory', size: '1024x1024', quality: 'medium', signal,
    }))
      .resolves.toEqual({
        images: [{ candidateIndex: 0, provider: 'relay', model: 'gpt-image-1', attachment }], failedCount: 0,
      })
    expect(saveImage).toHaveBeenCalledWith({ data: PNG, mediaType: 'image/png', name: 'generated.png' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(String(url)).toBe('https://relay.example/v1/images/generations')
    expect(init?.signal).toBe(signal)
    expect((init?.headers as Headers).get('authorization')).toBe('Bearer secret-key')
    expect((init?.headers as Headers).get('x-relay')).toBe('yes')
    expect(parsedRequestBody(init?.body)).toEqual({
      model: 'gpt-image-1', prompt: 'inventory', n: 1, response_format: 'b64_json',
      size: '1024x1024', quality: 'medium',
    })
  })

  it('uses the launch environment and downloads an HTTP image URL without a size', async () => {
    vi.stubEnv('IMAGE_API_KEY', 'launch-secret')
    const { ctx, saveImage } = await setup({
      providers: { relay: { baseURL: 'http://relay.example/v1/', apiKeyEnv: 'IMAGE_API_KEY' } },
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(imageResponse({ data: [{ url: 'http://cdn.example/generated.jpg' }] }))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    const request = vi.spyOn(publicHttpNetwork, 'request').mockResolvedValue({
      response: new Response(JPEG, { status: 200 }) as never,
      close: () => Promise.resolve(),
    })

    await expect(ctx.imageGeneration.generate({ prompt: 'portrait' }))
      .resolves.toEqual({
        images: [{ candidateIndex: 0, provider: 'relay', model: 'gpt-image-1', attachment }], failedCount: 0,
      })
    expect(saveImage).toHaveBeenCalledWith({ data: JPEG, mediaType: 'image/jpeg', name: 'generated.jpeg' })
    const [, firstInit] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect((firstInit.headers as Headers).get('authorization')).toBe('Bearer launch-secret')
    expect(parsedRequestBody(firstInit.body)).toEqual({
      model: 'gpt-image-1', prompt: 'portrait', n: 1, response_format: 'b64_json',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith(
      new URL('http://cdn.example/generated.jpg'),
      [{ address: '8.8.8.8', family: 4 }], {}, expect.any(AbortSignal),
    )
  })

  it('refuses a provider-supplied private image URL before downloading', async () => {
    const { ctx, saveImage } = await setup({ providers: { relay: { baseURL: 'https://relay.example/v1' } } })
    const fetchMock = vi.fn(() => Promise.resolve(imageResponse({
      data: [{ url: 'http://127.0.0.1/private.png' }],
    })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(ctx.imageGeneration.generate({ prompt: 'portrait' })).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(saveImage).not.toHaveBeenCalled()
  })

  it('does not follow a redirect from a provider-supplied image URL', async () => {
    const { ctx, saveImage } = await setup({ providers: { relay: { baseURL: 'https://relay.example/v1' } } })
    const fetchMock = vi.fn(() => Promise.resolve(imageResponse({
      data: [{ url: 'https://cdn.example/image.png' }],
    })))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    const close = vi.fn(() => Promise.resolve())
    const request = vi.spyOn(publicHttpNetwork, 'request').mockResolvedValue({
      response: new Response(null, {
        status: 302, headers: { location: 'http://127.0.0.1/private.png' },
      }) as never,
      close,
    })

    await expect(ctx.imageGeneration.generate({ prompt: 'portrait' })).rejects.toThrow('HTTP 302')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
    expect(saveImage).not.toHaveBeenCalled()
  })

  it('pins a public image download to its validated address set', async () => {
    const { ctx, saveImage } = await setup({ providers: { relay: { baseURL: 'https://relay.example/v1' } } })
    const fetchMock = vi.fn(() => Promise.resolve(imageResponse({
      data: [{ url: 'https://cdn.example/image.png' }],
    })))
    vi.stubGlobal('fetch', fetchMock)
    const addresses = [{ address: '8.8.8.8', family: 4 as const }]
    vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue(addresses)
    const close = vi.fn(() => Promise.resolve())
    const request = vi.spyOn(publicHttpNetwork, 'request').mockResolvedValue({
      response: new Response(JPEG) as never, close,
    })

    await expect(ctx.imageGeneration.generate({ prompt: 'portrait' })).resolves.toMatchObject({
      images: [{ provider: 'relay', model: 'gpt-image-1' }],
      failedCount: 0,
    })
    expect(request).toHaveBeenCalledWith(new URL('https://cdn.example/image.png'), addresses, {}, expect.any(AbortSignal))
    expect(close).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(saveImage).toHaveBeenCalledWith({ data: JPEG, mediaType: 'image/jpeg', name: 'generated.jpeg' })
  })

  it('redacts a credentialed image URL before public-address resolution', async () => {
    const { ctx, saveImage } = await setup({ providers: { relay: { baseURL: 'https://relay.example/v1' } } })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(imageResponse({
      data: [{ url: 'https://secret@cdn.example/image.png?token=private' }],
    }))))
    const resolve = vi.spyOn(publicHttpNetwork, 'resolve')

    const error = await ctx.imageGeneration.generate({ prompt: 'portrait' }).catch((reason: unknown) => reason)
    expect(error).toMatchObject({ code: 'IMAGE_DOWNLOAD_BLOCKED' })
    expect(JSON.stringify(error)).not.toContain('secret')
    expect(JSON.stringify(error)).not.toContain('private')
    expect(resolve).not.toHaveBeenCalled()
    expect(saveImage).not.toHaveBeenCalled()
  })

  it('preserves cancellation during image URL resolution and connection', async () => {
    const providers = { relay: { baseURL: 'https://relay.example/v1' } }
    const first = await setup({ providers })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(imageResponse({
      data: [{ url: 'https://cdn.example/image.png' }],
    }))))
    const dnsAbort = new AbortController()
    const dnsError = new DOMException('dns cancelled', 'AbortError')
    vi.spyOn(publicHttpNetwork, 'resolve').mockImplementationOnce(async () => {
      dnsAbort.abort(dnsError)
      throw dnsError
    })
    await expect(first.ctx.imageGeneration.generate({ prompt: 'portrait', signal: dnsAbort.signal }))
      .rejects.toBe(dnsError)

    const second = await setup({ providers })
    const connectionAbort = new AbortController()
    const connectionError = new DOMException('connection cancelled', 'AbortError')
    vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    vi.spyOn(publicHttpNetwork, 'request').mockImplementationOnce(async () => {
      connectionAbort.abort(connectionError)
      throw connectionError
    })
    await expect(second.ctx.imageGeneration.generate({ prompt: 'portrait', signal: connectionAbort.signal }))
      .rejects.toBe(connectionError)
  })

  it('reports a sanitized download failure when the pinned connection fails', async () => {
    const { ctx } = await setup({ providers: { relay: { baseURL: 'https://relay.example/v1' } } })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(imageResponse({
      data: [{ url: 'https://cdn.example/image.png?token=private' }],
    }))))
    vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    vi.spyOn(publicHttpNetwork, 'request').mockRejectedValue(new Error('private transport details'))

    const error = await ctx.imageGeneration.generate({ prompt: 'portrait' }).catch((reason: unknown) => reason)
    expect(error).toMatchObject({ code: 'IMAGE_DOWNLOAD_FAILED' })
    expect(String(error)).toBe('ImageGenerationError: image-generation: image download failed')
    expect(JSON.stringify(error)).not.toContain('private')
  })

  it('uses chat completions and decodes a Markdown data URL image', async () => {
    const { ctx, saveImage } = await setup({
      config: {
        provider: 'relay',
        model: '[EXPRESS]gemini-3.1-flash-image',
        endpointPath: 'chat/completions',
      },
      providers: { relay: { baseURL: 'https://relay.example/v1' } },
    })
    const encoded = Buffer.from(PNG).toString('base64')
    const fetchMock = vi.fn(() => Promise.resolve(imageResponse({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: `![image](data:image/png;base64,${encoded})` },
      }],
    })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(ctx.imageGeneration.generate({
      prompt: 'ink landscape', size: '1536x1024', quality: 'high',
    })).resolves.toEqual({
      images: [{ candidateIndex: 0, provider: 'relay', model: '[EXPRESS]gemini-3.1-flash-image', attachment }], failedCount: 0,
    })

    expect(saveImage).toHaveBeenCalledWith({ data: PNG, mediaType: 'image/png', name: 'generated.png' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(String(url)).toBe('https://relay.example/v1/chat/completions')
    expect(parsedRequestBody(init.body)).toEqual({
      model: '[EXPRESS]gemini-3.1-flash-image',
      messages: [{ role: 'user', content: 'ink landscape' }],
      modalities: ['text', 'image'],
      stream: false,
    })
  })

  it('uses one configured fallback route after the primary provider rejects generation', async () => {
    const { ctx, saveImage } = await setup({
      config: {
        provider: 'primary',
        model: 'primary-image',
        endpointPath: 'chat/completions',
        fallbackProvider: 'backup',
        fallbackModel: 'backup-image',
        fallbackEndpointPath: 'images/generations',
      },
      providers: {
        primary: { baseURL: 'https://primary.example/v1' },
        backup: { baseURL: 'https://backup.example/v1' },
      },
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { message: 'No available key' },
      }), { status: 503 }))
      .mockResolvedValueOnce(imageResponse({
        data: [{ b64_json: Buffer.from(PNG).toString('base64') }],
      }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(ctx.imageGeneration.generate({ prompt: 'fallback landscape' })).resolves.toEqual({
      images: [{ candidateIndex: 0, provider: 'backup', model: 'backup-image', attachment }], failedCount: 0,
    })
    expect(saveImage).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://primary.example/v1/chat/completions')
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe('https://backup.example/v1/images/generations')
  })

  it('does not call the fallback route when the primary route succeeds', async () => {
    const { ctx } = await setup({
      config: {
        provider: 'primary',
        model: 'primary-image',
        endpointPath: 'images/generations',
        fallbackProvider: 'backup',
        fallbackModel: 'backup-image',
        fallbackEndpointPath: 'images/generations',
      },
      providers: {
        primary: { baseURL: 'https://primary.example/v1' },
        backup: { baseURL: 'https://backup.example/v1' },
      },
    })
    const fetchMock = vi.fn(() => Promise.resolve(imageResponse({
      data: [{ b64_json: Buffer.from(PNG).toString('base64') }],
    })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(ctx.imageGeneration.generate({ prompt: 'primary landscape' })).resolves.toMatchObject({
      images: [{ provider: 'primary', model: 'primary-image' }], failedCount: 0,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports the fallback failure after both configured routes reject generation', async () => {
    const { ctx } = await setup({
      config: {
        provider: 'primary',
        model: 'primary-image',
        fallbackProvider: 'backup',
        fallbackModel: 'backup-image',
      },
      providers: {
        primary: { baseURL: 'https://primary.example/v1' },
        backup: { baseURL: 'https://backup.example/v1' },
      },
    })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { message: 'Primary unavailable.' },
      }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { message: 'Backup quota exhausted.' },
      }), { status: 429 })))

    await expect(ctx.imageGeneration.generate({ prompt: 'fallback landscape' })).rejects.toThrow(
      'image-generation: provider request failed with HTTP 429',
    )
  })

  it('rejects reference images for chat-completions generation', async () => {
    const reference = {
      attachmentId: AttachmentId('sha256:reference'), mediaType: 'image/png' as const,
      bytes: REFERENCE.byteLength, width: 8, height: 8, name: 'reference.png',
    }
    const { ctx, readImage } = await setup({
      config: {
        provider: 'relay',
        model: '[EXPRESS]gemini-3.1-flash-image',
        endpointPath: 'chat/completions',
      },
      providers: { relay: { baseURL: 'https://relay.example/v1' } },
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(ctx.imageGeneration.generate({ prompt: 'edit', referenceImages: [reference] }))
      .rejects.toThrow('chat-completions image generation does not support reference images')
    expect(readImage).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends reference images to the edits endpoint with high output quality', async () => {
    const reference = {
      attachmentId: AttachmentId('sha256:reference'), mediaType: 'image/png' as const,
      bytes: REFERENCE.byteLength, width: 8, height: 8, name: 'reference.png',
    }
    const { ctx, readImage } = await setup({ providers: { relay: { baseURL: 'https://relay.example/v1' } } })
    readImage.mockResolvedValue({ data: REFERENCE, ref: reference })
    const fetchMock = vi.fn(() => Promise.resolve(imageResponse({
      data: [{ b64_json: Buffer.from(PNG).toString('base64') }],
    })))
    vi.stubGlobal('fetch', fetchMock)
    const signal = new AbortController().signal

    await ctx.imageGeneration.generate({
      prompt: 'preserve the logo', referenceImages: [reference],
      quality: 'high', size: '1536x1024', signal,
    })

    expect(readImage).toHaveBeenCalledWith(reference, signal)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(String(url)).toBe('https://relay.example/v1/images/edits')
    expect(init.signal).toBe(signal)
    expect(init.body).toBeInstanceOf(FormData)
    const form = init.body as FormData
    expect(formEntry(form, 'model')).toBe('gpt-image-1')
    expect(formEntry(form, 'prompt')).toBe('preserve the logo')
    expect(formEntry(form, 'quality')).toBe('high')
    expect(formEntry(form, 'size')).toBe('1536x1024')
    expect(form.has('response_format')).toBe(false)
    expect(form.has('input_fidelity')).toBe(false)
    expect((init.headers as Headers).has('content-type')).toBe(false)
    const [image] = form.getAll('image[]')
    expect(image).toBeInstanceOf(File)
    expect((image as File).name).toBe('reference.png')
    expect(new Uint8Array(await (image as File).arrayBuffer())).toEqual(REFERENCE)
  })

  it('sends no authorization header when the route names no credential', async () => {
    const { ctx } = await setup({ providers: { relay: { baseURL: 'https://relay.example/v1' } } })
    const fetchMock = vi.fn(() => Promise.resolve(imageResponse({
      data: [{ b64_json: Buffer.from(PNG).toString('base64') }],
    })))
    vi.stubGlobal('fetch', fetchMock)

    await ctx.imageGeneration.generate({ prompt: 'icon' })
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect((init.headers as Headers).has('authorization')).toBe(false)
  })

  it('omits optional edit controls and supplies a reference filename', async () => {
    const reference = {
      attachmentId: AttachmentId('sha256:unnamed-reference'), mediaType: 'image/png' as const,
      bytes: REFERENCE.byteLength, width: 8, height: 8,
    }
    const { ctx, readImage } = await setup({ providers: { relay: { baseURL: 'https://relay.example/v1' } } })
    readImage.mockResolvedValue({ data: REFERENCE, ref: reference })
    const fetchMock = vi.fn(() => Promise.resolve(imageResponse({
      data: [{ b64_json: Buffer.from(PNG).toString('base64') }],
    })))
    vi.stubGlobal('fetch', fetchMock)

    await ctx.imageGeneration.generate({ prompt: 'simplify the mark', referenceImages: [reference] })

    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    const form = init.body as FormData
    expect(form.has('size')).toBe(false)
    expect(form.has('quality')).toBe(false)
    const [image] = form.getAll('image[]')
    expect((image as File).name).toBe('reference.png')
  })

  it('validates live route settings', async () => {
    const { ctx } = await setup({ providers: { relay: { baseURL: 'https://relay.example/v1' } } })
    await expect(ctx.settings.update(IMAGE_GENERATION_SETTINGS_NAMESPACE, { model: '' }))
      .rejects.toThrow('provider and model must be configured together')
    await expect(ctx.settings.update(IMAGE_GENERATION_SETTINGS_NAMESPACE, { endpointPath: '' }))
      .rejects.toThrow('endpointPath must not be empty')
    await expect(ctx.settings.update(IMAGE_GENERATION_SETTINGS_NAMESPACE, { editEndpointPath: '' }))
      .rejects.toThrow('endpointPath must not be empty')
    await expect(ctx.settings.update(IMAGE_GENERATION_SETTINGS_NAMESPACE, { fallbackProvider: 'backup' }))
      .rejects.toThrow('fallback provider and model must be configured together')
    await expect(ctx.settings.update(IMAGE_GENERATION_SETTINGS_NAMESPACE, {
      fallbackProvider: 'relay', fallbackModel: 'gpt-image-1',
    })).rejects.toThrow('fallback route must differ from the primary route')
  })

  it('rejects invalid candidate counts and variation cardinality', async () => {
    const { ctx } = await setup({ providers: { relay: { baseURL: 'https://relay.example/v1' } } })

    await expect(ctx.imageGeneration.generate({ prompt: 'x', count: 0 }))
      .rejects.toThrow('count must be a positive integer')
    await expect(ctx.imageGeneration.generate({ prompt: 'x', count: 1.5 }))
      .rejects.toThrow('count must be a positive integer')
    await expect(ctx.imageGeneration.generate({ prompt: 'x', count: 2, variations: ['one'] }))
      .rejects.toThrow('variations must match count')
  })

  it('rejects missing route configuration and dependencies', async () => {
    const empty = await setup({ config: { provider: '', model: '' } })
    await expect(empty.ctx.imageGeneration.generate({ prompt: 'x' })).rejects.toThrow('configure a default image provider')

    const missing = await setup({ providers: {} })
    await expect(missing.ctx.imageGeneration.generate({ prompt: 'x' })).rejects.toThrow('route "relay" is not configured')

    const noBase = await setup({ providers: { relay: {} } })
    await expect(noBase.ctx.imageGeneration.generate({ prompt: 'x' })).rejects.toThrow('has no Base URL')

    const noAttachments = await setup({ providers: { relay: { baseURL: 'https://relay.example/v1' } }, attachments: false })
    await expect(noAttachments.ctx.imageGeneration.generate({ prompt: 'x' })).rejects.toThrow('attachment storage is unavailable')
  })

  it('rejects absent and empty credentials', async () => {
    const profile = { relay: { baseURL: 'https://relay.example/v1', apiKeyEnv: 'IMAGE_API_KEY' } }
    const absent = await setup({ providers: profile, credential: undefined })
    await expect(absent.ctx.imageGeneration.generate({ prompt: 'x' })).rejects.toThrow('no credential is stored')
    const empty = await setup({ providers: profile, credential: '' })
    await expect(empty.ctx.imageGeneration.generate({ prompt: 'x' })).rejects.toThrow('no credential is stored')
  })

  it('bounds provider responses and reports provider failures', async () => {
    const declared = await setup({ providers: { relay: { baseURL: 'https://relay.example/v1' } }, config: { maxResponseBytes: 8 } })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', {
      status: 200, headers: { 'content-length': '9' },
    }))))
    await expect(declared.ctx.imageGeneration.generate({ prompt: 'x' })).rejects.toThrow('exceeds the configured byte limit')

    const body = await setup({ providers: { relay: { baseURL: 'https://relay.example/v1' } }, config: { maxResponseBytes: 2 } })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('123', { status: 200 }))))
    await expect(body.ctx.imageGeneration.generate({ prompt: 'x' })).rejects.toThrow('exceeds the configured byte limit')

    const failed = await setup({ providers: { relay: { baseURL: 'https://relay.example/v1' } } })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('failure', { status: 503 }))))
    await expect(failed.ctx.imageGeneration.generate({ prompt: 'x' })).rejects.toThrow('HTTP 503')
  })

  it('stops reading an oversized streaming response without buffering the entire body', async () => {
    const { ctx, saveImage } = await setup({
      providers: { relay: { baseURL: 'https://relay.example/v1' } },
      config: { maxResponseBytes: 2 },
    })
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(Uint8Array.from([1, 2, 3]))
        controller.close()
      },
    }))
    const arrayBuffer = vi.spyOn(response, 'arrayBuffer')
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response)))

    await expect(ctx.imageGeneration.generate({ prompt: 'portrait' }))
      .rejects.toThrow('exceeds the configured byte limit')
    expect(arrayBuffer).not.toHaveBeenCalled()
    expect(saveImage).not.toHaveBeenCalled()
  })

  it('treats an empty provider response body as invalid JSON', async () => {
    const { ctx } = await setup({ providers: { relay: { baseURL: 'https://relay.example/v1' } } })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 200 }))))

    await expect(ctx.imageGeneration.generate({ prompt: 'portrait' })).rejects.toThrow(SyntaxError)
  })

  it('keeps credentials and provider response text out of diagnostics', async () => {
    const failed = await setup({
      providers: { relay: { baseURL: 'https://relay.example/v1', apiKeyEnv: 'IMAGE_API_KEY' } },
      credential: 'test-image-credential',
    })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      error: { message: 'No available image channel for test-image-credential.\nTry another model.' },
    }), { status: 503, headers: { 'content-type': 'application/json' } }))))
    const first = await failed.ctx.imageGeneration.generate({ prompt: 'private prompt' }).catch((error: unknown) => error)
    expect(first).toMatchObject({ code: 'IMAGE_PROVIDER_REQUEST_FAILED' })
    expect(String(first)).toBe('ImageGenerationError: image-generation: provider request failed with HTTP 503')
    expect(JSON.stringify(first)).not.toContain('test-image-credential')
    expect(JSON.stringify(first)).not.toContain('No available image channel')
    expect(JSON.stringify(first)).not.toContain('private prompt')

    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('<html>gateway details</html>', {
      status: 503, headers: { 'content-type': 'text/html' },
    }))))
    await expect(failed.ctx.imageGeneration.generate({ prompt: 'x' })).rejects.toThrow(
      'image-generation: provider request failed with HTTP 503',
    )

    const publicRoute = await setup({ providers: { relay: { baseURL: 'https://relay.example/v1' } } })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      error: null, message: 'Relay is busy.',
    }), { status: 503 }))))
    for (const responseBody of [
      { error: null, message: 'Relay is busy.' },
      { error: { message: 'x'.repeat(400) } },
      null, [], { error: [] }, { error: { code: 'busy' } }, { message: ' \n ' },
    ]) {
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(responseBody), { status: 503 }))))
      await expect(publicRoute.ctx.imageGeneration.generate({ prompt: 'x' })).rejects.toThrow(
        'image-generation: provider request failed with HTTP 503',
      )
    }
  })

  it('does not try the fallback after cancellation', async () => {
    const { ctx } = await setup({
      config: {
        provider: 'primary', model: 'primary-image',
        fallbackProvider: 'backup', fallbackModel: 'backup-image',
      },
      providers: {
        primary: { baseURL: 'https://primary.example/v1' },
        backup: { baseURL: 'https://backup.example/v1' },
      },
    })
    const controller = new AbortController()
    const fetchMock = vi.fn(() => {
      controller.abort(new DOMException('cancelled', 'AbortError'))
      return Promise.reject(new DOMException('cancelled', 'AbortError'))
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(ctx.imageGeneration.generate({ prompt: 'cancel', signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns durable images when cancellation arrives after every commit', async () => {
    const controller = new AbortController()
    const { ctx, saveImage } = await setup({
      providers: { relay: { baseURL: 'https://relay.example/v1' } },
    })
    saveImage.mockImplementation(async () => {
      controller.abort(new DOMException('cancelled', 'AbortError'))
      return attachment
    })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(imageResponse({
      data: [{ b64_json: Buffer.from(PNG).toString('base64') }],
    }))))

    await expect(ctx.imageGeneration.generate({ prompt: 'committed', signal: controller.signal }))
      .resolves.toEqual({
        images: [{ candidateIndex: 0, provider: 'relay', model: 'gpt-image-1', attachment }],
        failedCount: 0,
      })
  })

  it('publishes no successful image when durable attachment commit fails', async () => {
    const { ctx, saveImage } = await setup({
      providers: { relay: { baseURL: 'https://relay.example/v1' } },
    })
    saveImage.mockRejectedValue(new Error('attachment commit failed'))
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(imageResponse({
      data: [{ b64_json: Buffer.from(PNG).toString('base64') }],
    }))))

    await expect(ctx.imageGeneration.generate({ prompt: 'commit' }))
      .rejects.toThrow('attachment commit failed')
  })

  it('removes the service and settings registration with its fiber', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(MemorySettings, { 'llm-pi-ai': { providers: {} } })
    ctx.settings.register('llm-pi-ai', z.any())
    ctx.provide('attachments', { saveImage: vi.fn(), readImage: vi.fn() } as never)
    const fiber = ctx.plugin(ImageGenerationService, {
      provider: 'relay', model: 'image', endpointPath: 'images/generations',
      editEndpointPath: 'images/edits', fallbackProvider: '', fallbackModel: '',
      fallbackEndpointPath: 'images/generations', fallbackEditEndpointPath: 'images/edits',
      maxResponseBytes: 1024,
    })
    await fiber.await()
    expect(ctx.get('imageGeneration')).toBeDefined()
    expect(ctx.settings.describe().some(view => view.ns === IMAGE_GENERATION_SETTINGS_NAMESPACE)).toBe(true)

    await fiber.dispose()

    expect(ctx.get('imageGeneration')).toBeUndefined()
    expect(ctx.settings.describe().some(view => view.ns === IMAGE_GENERATION_SETTINGS_NAMESPACE)).toBe(false)
  })

  it('rejects malformed JSON, malformed image records, and failed downloads', async () => {
    const malformedJson = await setup({ providers: { relay: { baseURL: 'https://relay.example/v1' } } })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{', { status: 200 }))))
    await expect(malformedJson.ctx.imageGeneration.generate({ prompt: 'x' })).rejects.toThrow(SyntaxError)

    const malformedRecord = await setup({ providers: { relay: { baseURL: 'https://relay.example/v1' } } })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(imageResponse({ data: [] }))))
    await expect(malformedRecord.ctx.imageGeneration.generate({ prompt: 'x' })).rejects.toThrow('did not return an image')

    const download = await setup({ providers: { relay: { baseURL: 'https://relay.example/v1' } } })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(imageResponse({
      data: [{ url: 'https://cdn.example/image.png' }],
    }))))
    vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    vi.spyOn(publicHttpNetwork, 'request').mockResolvedValue({
      response: new Response('missing', { status: 404 }) as never,
      close: () => Promise.resolve(),
    })
    await expect(download.ctx.imageGeneration.generate({ prompt: 'x', signal: new AbortController().signal }))
      .rejects.toThrow('image download failed with HTTP 404')
  })
})
