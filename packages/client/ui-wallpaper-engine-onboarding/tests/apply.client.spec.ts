/** Wallpaper Engine onboarding Client registration and locale freshness. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'
import { WallpaperOnboarding } from '../src/client/WallpaperOnboarding.tsx'
import type { WallpaperOnboardingInjected } from '../src/client/WallpaperOnboarding.tsx'
import { en, zh } from '../src/client/locales.ts'

async function bench(): Promise<{ ctx: Context; locale: LocaleRuntime; slots: SlotRegistry }> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  ctx.slots.register({
    name: 'root',
    children: { 'settings.onboarding': { kind: 'list', scope: 'root' } },
  } as never, () => null)
  return { ctx, locale, slots: ctx.get('slots') as SlotRegistry }
}

function injected(slots: SlotRegistry): WallpaperOnboardingInjected {
  const entry = slots.entries('settings.onboarding')[0]!
  return (entry.inject as unknown as () => WallpaperOnboardingInjected)()
}

describe('wallpaper onboarding browser plugin', () => {
  it('keeps the Host loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares only the services used by registration', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('registers the ordered onboarding row and injected browser probe', async () => {
    const { ctx, slots } = await bench()
    const fetcher = vi.fn(async () => Response.json({ settings: null }))
    vi.stubGlobal('fetch', fetcher)
    await ctx.plugin({ inject: [...inject], apply }).await()

    const [entry] = slots.entries('settings.onboarding')
    expect(entry?.component).toBe(WallpaperOnboarding)
    expect(entry?.options).toMatchObject({ id: 'wallpaper-engine-setup', order: 100 })
    const face = injected(slots)
    expect(face.copy).toEqual(en)
    await expect(face.probe(new AbortController().signal)).resolves.toEqual({ kind: 'setup-required' })
    expect(fetcher).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
    await ctx.fiber.dispose()
  })

  it('re-registers the row with fresh copy when the locale changes', async () => {
    const { ctx, locale, slots } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const englishEntry = slots.entries('settings.onboarding')[0]!
    expect(injected(slots).copy).toEqual(en)

    locale.setLocale('zh')
    const chineseEntry = slots.entries('settings.onboarding')[0]!
    expect(chineseEntry).not.toBe(englishEntry)
    expect(injected(slots).copy).toEqual(zh)

    locale.setLocale('en')
    expect(injected(slots).copy).toEqual(en)
    expect(slots.entries('settings.onboarding')).toHaveLength(1)
    await ctx.fiber.dispose()
  })

  it('removes the row and dictionaries with the plugin fiber', async () => {
    const { ctx, locale, slots } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(slots.entries('settings.onboarding')).toHaveLength(1)

    await fiber.dispose()
    expect(slots.entries('settings.onboarding')).toHaveLength(0)
    expect(() => locale.register('settings.wallpaper-engine-onboarding', 'zh', {})).not.toThrow()
    expect(() => locale.register('settings.wallpaper-engine-onboarding', 'en', {})).not.toThrow()
    await ctx.fiber.dispose()
  })
})
