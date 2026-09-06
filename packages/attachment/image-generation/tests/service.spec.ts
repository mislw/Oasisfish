import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { SettingsProvider, settingsNamespace, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
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
  ctx.settings.register(settingsNamespace('llm-pi-ai'), z.any())
  const saveImage = vi.fn(() => Promise.resolve(attachment))
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
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

describe('ImageGenerationService', () => {
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
      .resolves.toEqual({ provider: 'relay', model: 'gpt-image-1', attachment })
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
      .mockResolvedValueOnce(new Response(JPEG, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(ctx.imageGeneration.generate({ prompt: 'portrait' }))
      .resolves.toEqual({ provider: 'relay', model: 'gpt-image-1', attachment })
    expect(saveImage).toHaveBeenCalledWith({ data: JPEG, mediaType: 'image/jpeg', name: 'generated.jpeg' })
    const [, firstInit] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect((firstInit.headers as Headers).get('authorization')).toBe('Bearer launch-secret')
    expect(parsedRequestBody(firstInit.body)).toEqual({
      model: 'gpt-image-1', prompt: 'portrait', n: 1, response_format: 'b64_json',
    })
    expect(fetchMock.mock.calls[1]).toEqual(['http://cdn.example/generated.jpg', {}])
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

  it('rejects malformed JSON, malformed image records, and failed downloads', async () => {
    const malformedJson = await setup({ providers: { relay: { baseURL: 'https://relay.example/v1' } } })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{', { status: 200 }))))
    await expect(malformedJson.ctx.imageGeneration.generate({ prompt: 'x' })).rejects.toThrow(SyntaxError)

    const malformedRecord = await setup({ providers: { relay: { baseURL: 'https://relay.example/v1' } } })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(imageResponse({ data: [] }))))
    await expect(malformedRecord.ctx.imageGeneration.generate({ prompt: 'x' })).rejects.toThrow('did not return an image')

    const download = await setup({ providers: { relay: { baseURL: 'https://relay.example/v1' } } })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(imageResponse({ data: [{ url: 'https://cdn.example/image.png' }] }))
      .mockResolvedValueOnce(new Response('missing', { status: 404 })))
    await expect(download.ctx.imageGeneration.generate({ prompt: 'x', signal: new AbortController().signal }))
      .rejects.toThrow('image download failed with HTTP 404')
  })
})
