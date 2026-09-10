// @vitest-environment jsdom
import { Context, Service } from '@deepseek-ai/cordis'
import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { MemoryId } from '@deepseek-ai/dsh-memory'
import { apply, inject, NS } from '../src/client/index.ts'
import { MemorySection } from '../src/client/MemorySection.tsx'
import type { MemoryRemote } from '../src/client/store.ts'

afterEach(cleanup)

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  class RemoteService extends Service {
    constructor(serviceCtx: Context) { super(serviceCtx, 'remote') }
  }
  new RemoteService(ctx)
  const memory = {
    list: vi.fn<MemoryRemote['list']>(() => Promise.resolve({ ok: true as const, value: { enabled: true, records: [] } })),
    add: vi.fn<MemoryRemote['add']>(request => Promise.resolve({ ok: true as const, value: {
      id: MemoryId('added'), scope: request.scope, content: request.content, createdAt: 1, updatedAt: 1,
    } })),
    update: vi.fn<MemoryRemote['update']>(request => Promise.resolve({ ok: true as const, value: {
      id: request.id, scope: 'user', content: request.content, createdAt: 1, updatedAt: 2,
    } })),
    remove: vi.fn<MemoryRemote['remove']>(request => Promise.resolve({ ok: true as const, value: { id: request.id, absent: true } })),
    setEnabled: vi.fn<MemoryRemote['setEnabled']>(request => Promise.resolve({ ok: true as const, value: request.enabled })),
  }
  ctx.provide('remote.memory', memory)
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, memory }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root', children: { 'settings.section': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

describe('ui-settings-memory browser plugin', () => {
  it('declares its exact services and registers a locale-following Settings section lazily', async () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.memory'])
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const entry = b.slots.entries('settings.section')[0]!
    expect(entry.component).toBe(MemorySection)
    expect(entry.options).toMatchObject({ id: 'memory', order: 20 })
    expect(entry.locale).toBe(NS)
    expect(resolveSlotLabel(entry.options.label)).toBe('记忆')
    const controller = (entry.inject as unknown as () => { controller: { store: { getSnapshot(): { status: string } } } })().controller
    expect(controller.store.getSnapshot().status).toBe('idle')

    b.locale.setLocale('en')
    expect(resolveSlotLabel(entry.options.label)).toBe('Memory')
    await b.ctx.fiber.dispose()
  })

  it('forwards every injected Settings operation to the generated memory Remote', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const entry = b.slots.entries('settings.section')[0]!
    const injected = (entry.inject as unknown as () => {
      load(cwd: string | undefined): Promise<void>
      setEnabled(enabled: boolean, cwd: string | undefined): Promise<boolean>
      add(request: { scope: 'user' | 'project'; content: string }, cwd: string | undefined): Promise<boolean>
      update(id: ReturnType<typeof MemoryId>, content: string, cwd: string | undefined): Promise<boolean>
      remove(id: ReturnType<typeof MemoryId>, cwd: string | undefined): Promise<boolean>
    })()

    await injected.load('/work/project')
    expect(await injected.setEnabled(false, '/work/project')).toBe(true)
    expect(await injected.add({ scope: 'project', content: 'Remember this.' }, '/work/project')).toBe(true)
    const id = MemoryId('added')
    expect(await injected.update(id, 'Updated.', '/work/project')).toBe(true)
    expect(await injected.remove(id, '/work/project')).toBe(true)

    expect(b.memory.list).toHaveBeenCalledWith({ cwd: '/work/project' })
    expect(b.memory.setEnabled).toHaveBeenCalledWith({ enabled: false, cwd: '/work/project' })
    expect(b.memory.add).toHaveBeenCalledWith({ scope: 'project', content: 'Remember this.', cwd: '/work/project' })
    expect(b.memory.update).toHaveBeenCalledWith({ id, content: 'Updated.', cwd: '/work/project' })
    expect(b.memory.remove).toHaveBeenCalledWith({ id, cwd: '/work/project' })
    await b.ctx.fiber.dispose()
  })

  it('recovers after the section declarer unloads and disposes cleanly', async () => {
    const b = await bench()
    const stop = declare(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries('settings.section')).toHaveLength(1)

    stop()
    expect(b.slots.entries('settings.section')).toHaveLength(0)
    declare(b.slots)
    await vi.waitFor(() => { expect(b.slots.entries('settings.section')).toHaveLength(1) })

    await fiber.dispose()
    expect(b.slots.entries('settings.section')).toHaveLength(0)
    expect(() => b.locale.register(NS, 'zh', {})).not.toThrow()
    await b.ctx.fiber.dispose()
  })
})
