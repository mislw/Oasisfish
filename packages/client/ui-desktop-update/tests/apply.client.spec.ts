// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { apply, inject, NS } from '../src/client/index.ts'
import { DesktopUpdateSection } from '../src/client/DesktopUpdateSection.tsx'
import type { DesktopUpdateSectionInjected } from '../src/client/DesktopUpdateSection.tsx'
import type { OasisfishUpdateBridge } from '../src/protocol.ts'

const originalBridge = window.oasisfishUpdate
usePinnedBrowserLanguages('zh-CN')

afterEach(() => {
  window.oasisfishUpdate = originalBridge
})

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({
    name: 'root',
    children: { 'settings.section': { kind: 'list', scope: 'root' } },
  } as never, () => null)
  return { ctx, locale, slots }
}

function bridge(): OasisfishUpdateBridge & { unsubscribe: ReturnType<typeof vi.fn> } {
  const unsubscribe = vi.fn()
  return {
    unsubscribe,
    getState: vi.fn(async () => ({ phase: 'idle', currentVersion: '1.2.3' })),
    check: vi.fn(async () => ({ phase: 'up-to-date', currentVersion: '1.2.3' })),
    download: vi.fn(async () => ({ phase: 'downloaded', currentVersion: '1.2.3', availableVersion: '1.3.0' })),
    install: vi.fn(async () => ({ phase: 'installing', currentVersion: '1.2.3', availableVersion: '1.3.0' })),
    subscribe: vi.fn(() => unsubscribe),
  }
}

describe('ui-desktop-update browser plugin', () => {
  it('declares only the Settings services it consumes', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('contributes no section outside the Electron renderer', async () => {
    window.oasisfishUpdate = undefined
    const b = await bench()

    await b.ctx.plugin({ inject: [...inject], apply }).await()

    expect(b.slots.entries('settings.section')).toHaveLength(0)
    await b.ctx.fiber.dispose()
  })

  it('registers one localized section without starting an update command', async () => {
    const desktopBridge = bridge()
    window.oasisfishUpdate = desktopBridge
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()

    const entry = b.slots.entries('settings.section')[0]!
    expect(entry.component).toBe(DesktopUpdateSection)
    expect(entry.options).toMatchObject({ id: 'app-updates', order: 30 })
    expect(entry.locale).toBe(NS)
    expect(resolveSlotLabel(entry.options.label)).toBe('应用更新')
    expect(desktopBridge.subscribe).toHaveBeenCalledOnce()
    expect(desktopBridge.getState).not.toHaveBeenCalled()
    expect(desktopBridge.check).not.toHaveBeenCalled()
    expect(desktopBridge.download).not.toHaveBeenCalled()
    expect(desktopBridge.install).not.toHaveBeenCalled()

    const injected = (entry.inject as unknown as () => DesktopUpdateSectionInjected)()
    await injected.load()
    await injected.check()
    await injected.download()
    await injected.install()
    expect(desktopBridge.getState).toHaveBeenCalledOnce()
    expect(desktopBridge.check).toHaveBeenCalledOnce()
    expect(desktopBridge.download).toHaveBeenCalledOnce()
    expect(desktopBridge.install).toHaveBeenCalledOnce()

    b.locale.setLocale('en')
    expect(resolveSlotLabel(entry.options.label)).toBe('App Updates')

    await fiber.dispose()
    expect(desktopBridge.unsubscribe).toHaveBeenCalledOnce()
    expect(b.slots.entries('settings.section')).toHaveLength(0)
    await b.ctx.fiber.dispose()
  })
})
