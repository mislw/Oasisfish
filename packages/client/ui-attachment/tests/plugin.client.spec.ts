import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply as applyHost } from '../src/index.ts'
import { apply, inject } from '../src/client/index.ts'
import { ComposerAttachments } from '../src/client/ComposerAttachments.tsx'
import { MessageImages } from '../src/client/MessageImages.tsx'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const resolveImage = vi.fn(async () => 'blob:test')
  const addImageToDraft = vi.fn(async () => true)
  const addMemory = vi.fn(async () => ({ ok: true, value: {} }))
  const sessionSummary: { cwd?: string } = { cwd: 'F:\\games\\redcliff' }
  ctx.provide('conversation', { resolveImage, addImageToDraft } as never)
  ctx.provide('sessions', {
    list: { getSnapshot: () => ({ byId: { 'session-1': sessionSummary } }) },
  } as never)
  ctx.provide('remote', { memory: { add: addMemory } } as never)
  ctx.provide('remote.memory', { add: addMemory } as never)
  ctx.slots.register({
    name: 'root',
    children: {
      'conversation.input.attachments': { kind: 'single', scope: 'session-maybe' },
      'conversation.message.images': { kind: 'single', scope: 'session' },
      'tool.call.toolview': { kind: 'keyed', scope: 'session' },
    },
  } as never, () => null)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber, resolveImage, addImageToDraft, addMemory, sessionSummary }
}

describe('attachment plugin', () => {
  it('keeps the host half empty', () => {
    expect(() => { applyHost() }).not.toThrow()
  })

  it('registers attachment entries and the generated-image tool view, then removes them with the plugin fiber', async () => {
    const { ctx, fiber, resolveImage, addImageToDraft, addMemory } = await bench()
    expect(inject).toEqual(['slots', 'conversation', 'sessions', 'remote', 'remote.memory'])
    expect(ctx.slots.entries('conversation.input.attachments')).toMatchObject([{
      locale: 'conversation',
      component: ComposerAttachments,
    }])
    expect(ctx.slots.entries('conversation.message.images')).toMatchObject([{
      locale: 'conversation',
      component: MessageImages,
    }])
    expect(ctx.slots.entries('tool.call.toolview')).toMatchObject([{
      options: { key: 'image_generate' },
      locale: 'conversation',
    }])
    const toolview = ctx.slots.entries('tool.call.toolview')[0]!
    const injected = (toolview.inject as (sessionId: string) => {
      loadImage: (attachment: { attachmentId: string }) => Promise<string>
      selectImage: (attachment: { attachmentId: string }, preference: string | undefined) => Promise<void>
    })('session-1')
    const attachment = { attachmentId: 'fixture:image' }
    await expect(injected.loadImage(attachment)).resolves.toBe('blob:test')
    expect(resolveImage).toHaveBeenCalledWith('session-1', attachment)
    await injected.selectImage(attachment, 'stronger material contrast and asymmetric framing')
    expect(addImageToDraft).toHaveBeenCalledWith('session-1', attachment)
    expect(addMemory).toHaveBeenCalledWith({
      scope: 'project',
      cwd: 'F:\\games\\redcliff',
      content: 'Image style preference selected through continue editing: stronger material contrast and asymmetric framing. Preserve candidate diversity with adjacent and contrasting explorations.',
    })

    await fiber.dispose()

    expect(ctx.slots.entries('conversation.input.attachments')).toHaveLength(0)
    expect(ctx.slots.entries('conversation.message.images')).toHaveLength(0)
    expect(ctx.slots.entries('tool.call.toolview')).toHaveLength(0)
  })

  it('uses user scope without a cwd and never blocks editing when memory rejects the preference', async () => {
    const { ctx, addImageToDraft, addMemory, sessionSummary } = await bench()
    delete sessionSummary.cwd
    addMemory.mockRejectedValueOnce(new Error('transport unavailable'))
    const toolview = ctx.slots.entries('tool.call.toolview')[0]!
    const injected = (toolview.inject as (sessionId: string) => {
      selectImage: (attachment: { attachmentId: string }, preference: string | undefined) => Promise<void>
    })('session-1')
    const attachment = { attachmentId: 'fixture:image' }

    await expect(injected.selectImage(attachment, 'soft ink texture')).resolves.toBeUndefined()
    expect(addImageToDraft).toHaveBeenCalledWith('session-1', attachment)
    expect(addMemory).toHaveBeenCalledWith({
      scope: 'user',
      content: 'Image style preference selected through continue editing: soft ink texture. Preserve candidate diversity with adjacent and contrasting explorations.',
    })
    await ctx.fiber.dispose()
  })
})
