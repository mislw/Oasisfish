/** Wallpaper Engine settings readiness parsing and cancellation. */
import { describe, expect, it, vi } from 'vitest'
import { probeWallpaperSettings } from '../src/client/probe.ts'

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function fetcher(value: unknown): Fetcher {
  return vi.fn(async () => Response.json(value))
}

describe('probeWallpaperSettings', () => {
  it('requires setup only for the upstream null sentinel', async () => {
    await expect(probeWallpaperSettings(fetcher({ settings: null }))).resolves.toEqual({ kind: 'setup-required' })
  })

  it('treats every non-array settings object as configured', async () => {
    await expect(probeWallpaperSettings(fetcher({ settings: {} }))).resolves.toEqual({ kind: 'configured' })
    await expect(probeWallpaperSettings(fetcher({ settings: { id: '' } }))).resolves.toEqual({ kind: 'configured' })
  })

  it.each([
    ['http', vi.fn(async () => new Response(null, { status: 503 }))],
    ['json', vi.fn(async () => new Response('{'))],
    ['payload', fetcher({})],
    ['payload', fetcher({ settings: [] })],
    ['fetch', vi.fn(async () => { throw new Error('private user path C:\\Users\\name') })],
  ] as const)('bounds %s failures without leaking response or error content', async (failureClass, request) => {
    const result = await probeWallpaperSettings(request)
    expect(result).toEqual({
      kind: 'unavailable',
      diagnostic: expect.stringContaining(`/wallpaper-engine/settings ${failureClass}`) as string,
    })
    if (result.kind === 'unavailable') {
      expect(result.diagnostic).not.toContain('C:\\Users\\name')
      expect(result.diagnostic).not.toContain('{')
    }
  })

  it('uses GET with the supplied signal and closes an aborted probe', async () => {
    const controller = new AbortController()
    const aborted = Promise.withResolvers<undefined>()
    const request = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        aborted.resolve(undefined)
        reject(new DOMException('Aborted', 'AbortError'))
      }, { once: true })
    }))

    const pending = probeWallpaperSettings(request, controller.signal)
    expect(request).toHaveBeenCalledWith('/wallpaper-engine/settings', {
      method: 'GET',
      signal: controller.signal,
    })
    controller.abort()
    await aborted.promise
    await expect(pending).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: '/wallpaper-engine/settings fetch',
    })
  })
})
