/** OpenAI-compatible Images API request and response helpers. */

import type { ImageMediaType } from '@deepseek-ai/dsh-attachment'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff])
const RIFF_SIGNATURE = Buffer.from('RIFF')
const WEBP_SIGNATURE = Buffer.from('WEBP')
const GIF_SIGNATURES = new Set(['GIF87a', 'GIF89a'])

/** Decoded image location returned by an OpenAI-compatible gateway. */
export type OpenAiImageResult =
  | { kind: 'bytes'; data: Uint8Array }
  | { kind: 'url'; url: string }

/**
 * Resolve a relative Images API path below a provider's versioned Base URL.
 * @param baseURL Provider Base URL that owns the Images API.
 * @param endpointPath Relative Images API path.
 * @returns Absolute URL for the image request.
 */
export function resolveImageEndpoint(baseURL: string, endpointPath: string): URL {
  const base = new URL(baseURL.endsWith('/') ? baseURL : `${baseURL}/`)
  const relative = endpointPath.replace(/^\/+/, '')
  if (relative.length === 0) throw new Error('image-generation: endpointPath must not be empty')
  return new URL(relative, base)
}

/**
 * Decode the first image from an OpenAI-compatible Images API response.
 * @param value Parsed provider response body.
 * @returns The returned image bytes or HTTP(S) location.
 */
export function decodeOpenAiImageResponse(value: unknown): OpenAiImageResult {
  if (typeof value !== 'object' || value === null) {
    throw new Error('image-generation: provider did not return an image')
  }
  const data = (value as { data?: unknown }).data
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('image-generation: provider did not return an image')
  }
  const first: unknown = data[0]
  if (typeof first !== 'object' || first === null) {
    throw new Error('image-generation: provider did not return an image')
  }
  const b64 = (first as { b64_json?: unknown }).b64_json
  if (typeof b64 === 'string' && b64.length > 0) {
    return { kind: 'bytes', data: Uint8Array.from(Buffer.from(b64, 'base64')) }
  }
  const url = (first as { url?: unknown }).url
  if (typeof url === 'string') {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('image-generation: provider returned a non-HTTP image URL')
    }
    return { kind: 'url', url: parsed.href }
  }
  throw new Error('image-generation: provider did not return an image')
}

/**
 * Decode one Markdown-embedded Base64 image from an OpenAI-compatible chat response.
 * @param value Parsed provider response body.
 * @returns The returned image bytes.
 */
export function decodeOpenAiChatImageResponse(value: unknown): OpenAiImageResult {
  if (typeof value !== 'object' || value === null) {
    throw new Error('image-generation: provider did not return an image')
  }
  const choices = (value as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('image-generation: provider did not return an image')
  }
  const first: unknown = choices[0]
  if (typeof first !== 'object' || first === null) {
    throw new Error('image-generation: provider did not return an image')
  }
  const message = (first as { message?: unknown }).message
  if (typeof message !== 'object' || message === null) {
    throw new Error('image-generation: provider did not return an image')
  }
  const content = (message as { content?: unknown }).content
  if (typeof content !== 'string') {
    throw new Error('image-generation: provider did not return an image')
  }
  const match = /data:image\/(?:png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})/u.exec(content)
  if (match?.[1] === undefined) {
    throw new Error('image-generation: provider did not return an image')
  }
  return { kind: 'bytes', data: Uint8Array.from(Buffer.from(match[1], 'base64')) }
}

/**
 * Identify one supported raster format from its encoded signature.
 * @param data Encoded raster bytes.
 * @returns Detected attachment media type.
 */
export function inferImageMediaType(data: Uint8Array): ImageMediaType {
  const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  if (bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return 'image/png'
  if (bytes.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)) return 'image/jpeg'
  if (bytes.subarray(0, 4).equals(RIFF_SIGNATURE)
    && bytes.subarray(8, 12).equals(WEBP_SIGNATURE)) return 'image/webp'
  if (data.length >= 6) {
    const header = bytes.subarray(0, 6).toString('ascii')
    if (GIF_SIGNATURES.has(header)) return 'image/gif'
  }
  throw new Error('image-generation: provider returned an unsupported image format')
}
