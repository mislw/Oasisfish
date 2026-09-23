import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { apply, inject } from '../src/client/index.ts'
import { CodexBridgeSection } from '../src/client/CodexBridgeSection.tsx'
import { en, zh } from '../src/client/locales.ts'
import { apply as applyHost } from '../src/index.ts'

async function bench(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.slots.register({
    name: 'root',
    children: { 'settings.section': { kind: 'list', scope: 'root' } },
  } as never, () => null)
  return ctx
}

describe('ui-codex-bridge browser plugin', () => {
  it('keeps the Host loader entry inert', () => {
    expect(applyHost).not.toThrow()
  })

  it('declares only the services used by the preview registration', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('registers a localized Settings section and removes it with the plugin fiber', async () => {
    const ctx = await bench()
    ctx.locale.setLocale('zh')
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()

    const [section] = ctx.slots.entries('settings.section')
    expect(section?.component).toBe(CodexBridgeSection)
    expect(section?.options).toMatchObject({ id: 'codex-bridge', order: 15 })
    expect(section?.locale).toBe('settings.codexBridge')
    expect(resolveSlotLabel(section?.options.label)).toBe(zh.nav)
    ctx.locale.setLocale('en')
    expect(resolveSlotLabel(section?.options.label)).toBe(en.nav)

    const translate = ctx.locale.bind('settings.codexBridge')
    expect(translate('preview')).toBe(en.preview)
    await fiber.dispose()
    expect(ctx.slots.entries('settings.section')).toHaveLength(0)
    expect(translate('preview')).not.toBe(en.preview)
    await ctx.fiber.dispose()
  })

  it('waits for a late Settings declaration', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('locale', new LocaleRuntime(ctx))
    await ctx.plugin({ inject: [...inject], apply }).await()
    expect(ctx.slots.entries('settings.section')).toHaveLength(0)

    ctx.slots.register({
      name: 'root',
      children: { 'settings.section': { kind: 'list', scope: 'root' } },
    } as never, () => null)
    await vi.waitFor(() => { expect(ctx.slots.entries('settings.section')).toHaveLength(1) })
    await ctx.fiber.dispose()
  })
})
