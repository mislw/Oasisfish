// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { OasisUiLauncherButton, OasisUiWorkflowOverlay } from '../src/client/OasisUiWorkflow.tsx'
import { apply as applyClient, inject as clientInject } from '../src/client/index.ts'
import { en, zh } from '../src/client/locales.ts'
import { apply as applyHost, inject as hostInject } from '../src/index.ts'

describe('Oasis UI workflow plugins', () => {
  it('registers and disposes the model-visible host guidance', async () => {
    expect(hostInject).toEqual(['systemPrompt'])
    const ctx = new Context()
    await ctx.plugin(SystemPrompt, {})
    const fiber = ctx.plugin({ inject: [...hostInject], apply: applyHost })
    await fiber.await()

    const section = (await ctx.systemPrompt.assemble()).sections
      .find(entry => entry.name === 'ui:oasis-workflow-launcher')
    expect(section?.text).toContain('The launcher advances only when the user confirms')
    await fiber.dispose()
    expect((await ctx.systemPrompt.assemble()).sections
      .some(entry => entry.name === 'ui:oasis-workflow-launcher')).toBe(false)
  })

  it('registers both UI slots, forwards image limits, and removes them with the fiber', async () => {
    expect(clientInject).toEqual(['slots', 'conversation', 'locale'])
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.slots.register({
      name: 'root',
      children: {
        'conversation.input.left': { kind: 'list', scope: 'session' },
        'shell.overlay': { kind: 'list', scope: 'root' },
      },
    } as never, () => null)
    const addDraftImages = vi.fn(() => null)
    const unregisterDictionaries = vi.fn()
    const registerDictionaries = vi.fn((_namespace: string, _dictionaries: { zh: typeof zh; en: typeof en }) => unregisterDictionaries)
    const t = vi.fn((key: string) => key === 'launcher.short' ? 'UI workflow' : key)
    ctx.provide('conversation', { addDraftImages } as never)
    ctx.provide('locale', { register: registerDictionaries, bind: () => t } as never)

    const fiber = ctx.plugin({ inject: [...clientInject], apply: applyClient })
    await fiber.await()
    const inputEntry = ctx.slots.entries('conversation.input.left')[0]!
    const overlayEntry = ctx.slots.entries('shell.overlay')[0]!
    expect(inputEntry.component).toBe(OasisUiLauncherButton)
    expect(overlayEntry.component).toBe(OasisUiWorkflowOverlay)
    expect(registerDictionaries).toHaveBeenCalledWith('oasisWorkflow', { zh, en })
    expect(inputEntry.options).toMatchObject({ id: 'oasis-ui-workflow', order: 30 })
    expect(inputEntry.locale).toBe('oasisWorkflow')
    expect((inputEntry.options.label as () => string)()).toBe('UI workflow')
    expect(overlayEntry.options).toMatchObject({ id: 'oasis-ui-workflow', order: 30 })
    expect(overlayEntry.locale).toBe('oasisWorkflow')

    const injected = (inputEntry.inject as unknown as (id: SessionId) => {
      addFiles(files: readonly File[], limits?: { maxCount?: number; maxBytes?: number }): string | null
      launcher: unknown
    })('session-plugin' as SessionId)
    const file = new File(['png'], 'plugin.png', { type: 'image/png' })
    const limits = { maxCount: 2, maxBytes: 512 }
    expect(injected.addFiles([file], limits)).toBeNull()
    expect(addDraftImages).toHaveBeenCalledWith('session-plugin', [file], limits)
    expect((overlayEntry.inject as () => { launcher: unknown })().launcher).toBe(injected.launcher)

    await fiber.dispose()
    expect(unregisterDictionaries).toHaveBeenCalledOnce()
    expect(ctx.slots.entries('conversation.input.left')).toEqual([])
    expect(ctx.slots.entries('shell.overlay')).toEqual([])
  })
})
