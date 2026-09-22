/** Upstream Wallpaper Engine settings readiness probe. */

const SETTINGS_ROUTE = '/wallpaper-engine/settings'

/** Settings readiness derived from the upstream Wallpaper Engine response. */
export type WallpaperSettingsReadiness =
  | { readonly kind: 'setup-required' }
  | { readonly kind: 'configured' }
  | { readonly kind: 'unavailable'; readonly diagnostic: string }

/** Browser-compatible fetch face used by the readiness probe. */
export type WallpaperSettingsFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

function unavailable(failureClass: 'fetch' | 'http' | 'json' | 'payload'): WallpaperSettingsReadiness {
  return { kind: 'unavailable', diagnostic: `${SETTINGS_ROUTE} ${failureClass}` }
}

/**
 * Read and validate the upstream Wallpaper Engine settings sentinel.
 * @param fetcher - browser fetch implementation or a test carrier.
 * @param signal - request lifetime; callers abort it when their owner unmounts.
 * @returns setup-required only for `settings: null`, configured for any
 * non-array settings object, and a bounded diagnostic for every failure.
 */
export async function probeWallpaperSettings(
  fetcher: WallpaperSettingsFetcher,
  signal: AbortSignal = new AbortController().signal,
): Promise<WallpaperSettingsReadiness> {
  let response: Response
  try {
    response = await fetcher(SETTINGS_ROUTE, { method: 'GET', signal })
  } catch {
    return unavailable('fetch')
  }
  if (!response.ok) return unavailable('http')

  let value: unknown
  try {
    value = await response.json()
  } catch {
    return unavailable('json')
  }
  if (typeof value !== 'object' || value === null || !Object.hasOwn(value, 'settings')) {
    return unavailable('payload')
  }
  const settings = (value as { readonly settings: unknown }).settings
  if (settings === null) return { kind: 'setup-required' }
  if (typeof settings === 'object' && !Array.isArray(settings)) return { kind: 'configured' }
  return unavailable('payload')
}
