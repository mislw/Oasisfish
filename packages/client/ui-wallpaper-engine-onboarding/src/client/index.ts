/** Localized Wallpaper Engine first-run onboarding, browser half. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { WallpaperOnboarding } from './WallpaperOnboarding.tsx'
import type { WallpaperOnboardingCopy, WallpaperOnboardingLocaleKey } from './locales.ts'
import { en, zh } from './locales.ts'
import { probeWallpaperSettings } from './probe.ts'

export type { WallpaperOnboardingInjected, WallpaperOnboardingProps } from './WallpaperOnboarding.tsx'
export type { WallpaperOnboardingCopy, WallpaperOnboardingLocaleKey } from './locales.ts'
export type { WallpaperSettingsFetcher, WallpaperSettingsReadiness } from './probe.ts'
export { probeWallpaperSettings } from './probe.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Wallpaper Engine setup-onboarding copy. */
    'settings.wallpaper-engine-onboarding': WallpaperOnboardingLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.wallpaper-engine-onboarding'

/** Services required by the onboarding registration. */
export const inject = ['slots', 'locale']

/**
 * Register localized Wallpaper Engine first-run setup after the onboarding
 * slot declaration becomes available.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-wallpaper-engine-onboarding: dictionaries')
  const t = ctx.locale.bind(NS)
  const copy = (): WallpaperOnboardingCopy => ({
    title: t('title'),
    body: t('body'),
    openSettings: t('openSettings'),
  })
  const probe = (signal: AbortSignal) => probeWallpaperSettings(
    (input, init) => fetch(input, init),
    signal,
  )
  const warn = (diagnostic: string): void => {
    ctx.logger.warn('wallpaper-engine onboarding: %s', diagnostic)
  }

  let refresh: (() => void) | undefined
  ctx.slots.inject('settings.onboarding', () => {
    const register = () => ctx.slots.register({
      name: 'settings.onboarding',
      id: 'wallpaper-engine-setup',
      order: 100,
      inject: () => ({ copy: copy(), probe, warn }),
    }, WallpaperOnboarding)
    let dispose = register()
    const refreshEntry = (): void => {
      dispose()
      dispose = register()
    }
    refresh = refreshEntry
    return () => {
      if (refresh === refreshEntry) refresh = undefined
      dispose()
    }
  })
  ctx.on('locale/change', () => { refresh?.() })
}
