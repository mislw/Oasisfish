import { describe, expect, it } from 'vitest'
import {
  decodeOpenAiImageResponse,
  inferImageMediaType,
  resolveImageEndpoint,
} from '../src/openai-compatible.ts'

describe('OpenAI-compatible image generation', () => {
  it('appends the relative images path beneath a versioned Base URL', () => {
    expect(resolveImageEndpoint('https://relay.example/v1', 'images/generations').href)
      .toBe('https://relay.example/v1/images/generations')
    expect(resolveImageEndpoint('https://relay.example/v1/', '/images/generations').href)
      .toBe('https://relay.example/v1/images/generations')
    expect(() => resolveImageEndpoint('https://relay.example/v1', '/')).toThrow('must not be empty')
  })

  it('decodes a base64 image result', () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(decodeOpenAiImageResponse({ data: [{ b64_json: Buffer.from(png).toString('base64') }] }))
      .toEqual({ kind: 'bytes', data: png })
  })

  it('accepts a returned HTTPS image URL', () => {
    expect(decodeOpenAiImageResponse({ data: [{ url: 'https://cdn.example/generated.png' }] }))
      .toEqual({ kind: 'url', url: 'https://cdn.example/generated.png' })
    expect(decodeOpenAiImageResponse({ data: [{ url: 'http://cdn.example/generated.png' }] }))
      .toEqual({ kind: 'url', url: 'http://cdn.example/generated.png' })
  })

  it('rejects malformed provider responses', () => {
    expect(() => decodeOpenAiImageResponse(null)).toThrow('did not return an image')
    expect(() => decodeOpenAiImageResponse({ data: [] })).toThrow('did not return an image')
    expect(() => decodeOpenAiImageResponse({ data: [null] })).toThrow('did not return an image')
    expect(() => decodeOpenAiImageResponse({ data: [{}] })).toThrow('did not return an image')
    expect(() => decodeOpenAiImageResponse({ data: [{ b64_json: '' }] })).toThrow('did not return an image')
    expect(() => decodeOpenAiImageResponse({ data: [{ url: 'file:///tmp/image.png' }] }))
      .toThrow('non-HTTP image URL')
  })

  it('recognizes supported raster signatures', () => {
    expect(inferImageMediaType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
      .toBe('image/png')
    expect(inferImageMediaType(Uint8Array.from([0xff, 0xd8, 0xff, 0xdb]))).toBe('image/jpeg')
    expect(inferImageMediaType(Buffer.from('RIFF0000WEBP'))).toBe('image/webp')
    expect(inferImageMediaType(Buffer.from('GIF87a'))).toBe('image/gif')
    expect(inferImageMediaType(Buffer.from('GIF89a'))).toBe('image/gif')
    expect(() => inferImageMediaType(Buffer.from('GIF00a'))).toThrow('unsupported image format')
    expect(() => inferImageMediaType(Uint8Array.from([]))).toThrow('unsupported image format')
  })
})
