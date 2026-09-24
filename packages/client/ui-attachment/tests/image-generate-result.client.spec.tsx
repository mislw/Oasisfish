// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { AttachmentId, type ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ToolResultNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { MessageImageLoader } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import {
  ImageGenerateResult,
  imageGenerateResultModel,
} from '../src/client/ImageGenerateResult.tsx'
import { apply, inject } from '../src/client/index.ts'

afterEach(cleanup)

const first = {
  attachmentId: AttachmentId('sha256:first'), mediaType: 'image/png',
  bytes: 8, width: 1, height: 1, name: 'generated-1.png',
} satisfies ImageAttachmentRef
const second = {
  attachmentId: AttachmentId('sha256:second'), mediaType: 'image/jpeg',
  bytes: 9, width: 2, height: 1, name: 'generated-2.jpeg',
} satisfies ImageAttachmentRef

const settled = (over?: Partial<ToolResultNode>): ToolResultNode => ({
  kind: 'tool-result', seq: 4, time: 2, callId: 'image-1', callTime: 1,
  call: {
    name: 'image_generate',
    argsRaw: JSON.stringify({
      prompt: 'A quiet inventory panel',
      variation_prompts: ['brushed metal', 'frosted glass'],
    }),
  },
  content: [
    { type: 'text', text: 'Generated 2 candidates.' },
    { type: 'image', attachment: first },
    { type: 'image', attachment: second },
  ],
  isError: false,
  meta: {
    images: [
      { attachmentId: first.attachmentId, provider: 'primary', model: 'image-v1', preference: 'brushed metal' },
      { attachmentId: second.attachmentId, provider: 'fallback', model: 'image-v2', preference: 'frosted glass' },
    ],
    failedCount: 0,
  },
  subCalls: [],
  ...over,
} as unknown as ToolResultNode)

function withAttachment(value: unknown): ToolResultNode {
  return settled({
    content: [{ type: 'image', attachment: value }] as never,
    meta: { images: [{ attachmentId: 'sha256:first', provider: 'p', model: 'm' }], failedCount: 0 },
  })
}

describe('imageGenerateResultModel', () => {
  it('derives durable candidates from raw result content and persisted metadata', () => {
    expect(imageGenerateResultModel(settled())).toEqual({
      prompt: 'A quiet inventory panel',
      candidates: [
        { attachment: first, provider: 'primary', model: 'image-v1', preference: 'brushed metal' },
        { attachment: second, provider: 'fallback', model: 'image-v2', preference: 'frosted glass' },
      ],
      failedCount: 0,
      text: 'Generated 2 candidates.',
    })
  })

  it('declines running, failed, malformed, and mismatched durable data', () => {
    expect(imageGenerateResultModel({
      callId: 'running', name: 'image_generate', argsRaw: '{}', turn: 1, step: 1, time: 1, subCalls: [],
    })).toBeNull()
    expect(imageGenerateResultModel(settled({ isError: true }))).toBeNull()
    expect(imageGenerateResultModel(settled({ meta: null }))).toBeNull()
    expect(imageGenerateResultModel(settled({
      meta: { images: [
        { attachmentId: 'sha256:other', provider: 'p', model: 'm' },
        { attachmentId: second.attachmentId, provider: 'p', model: 'm' },
      ], failedCount: 1 },
    }))).toBeNull()
  })

  it('declines malformed prompts and result metadata', () => {
    expect(imageGenerateResultModel(settled({ call: null }))).toBeNull()
    for (const argsRaw of ['{', 'null', '[]', '1', '{}', '{"prompt":1}', '{"prompt":""}']) {
      expect(imageGenerateResultModel(settled({ call: { name: 'image_generate', argsRaw } }))).toBeNull()
    }
    expect(imageGenerateResultModel(settled({ call: { name: 'other', argsRaw: '{}' } }))).toBeNull()
    for (const meta of [1, [], {}, { images: [], failedCount: 0.5 }, { images: [], failedCount: -1 }]) {
      expect(imageGenerateResultModel(settled({ meta }))).toBeNull()
    }
    for (const image of [
      null, [], 1,
      { attachmentId: 1, provider: 'p', model: 'm' },
      { attachmentId: '', provider: 'p', model: 'm' },
      { attachmentId: 'sha256:first', provider: 1, model: 'm' },
      { attachmentId: 'sha256:first', provider: '', model: 'm' },
      { attachmentId: 'sha256:first', provider: 'p', model: 1 },
      { attachmentId: 'sha256:first', provider: 'p', model: '' },
      { attachmentId: 'sha256:first', provider: 'p', model: 'm', preference: 1 },
    ]) {
      expect(imageGenerateResultModel(settled({ meta: { images: [image], failedCount: 0 } }))).toBeNull()
    }
  })

  it('declines malformed durable image references', () => {
    for (const value of [
      null, [], 1,
      { ...first, attachmentId: 1 },
      { ...first, attachmentId: '' },
      { ...first, mediaType: 1 },
      { ...first, mediaType: 'image/svg+xml' },
      { ...first, bytes: '8' },
      { ...first, bytes: 1.5 },
      { ...first, bytes: 0 },
      { ...first, width: 0 },
      { ...first, height: 0 },
      { ...first, name: 1 },
      { ...first, originalDimensions: null },
      { ...first, originalDimensions: [] },
      { ...first, originalDimensions: 1 },
      { ...first, originalDimensions: { width: 0, height: 1 } },
      { ...first, originalDimensions: { width: 1, height: 0 } },
    ]) {
      expect(imageGenerateResultModel(withAttachment(value))).toBeNull()
    }
    expect(imageGenerateResultModel(settled({
      content: [{ type: 'image', attachment: first }],
      meta: { images: [], failedCount: 0 },
    }))).toBeNull()
  })

  it('preserves optional durable image fields without inventing presentation metadata', () => {
    const attachment = {
      attachmentId: AttachmentId('sha256:first'), mediaType: 'image/webp' as const,
      bytes: 8, width: 2, height: 1, originalDimensions: { width: 4, height: 2 },
    } satisfies ImageAttachmentRef
    expect(imageGenerateResultModel(settled({
      content: [{ type: 'image', attachment }],
      meta: { images: [{ attachmentId: attachment.attachmentId, provider: 'p', model: 'm' }], failedCount: 0 },
    }))).toMatchObject({ candidates: [{ attachment, provider: 'p', model: 'm' }] })
  })
})

describe('ImageGenerateResult', () => {
  const props = (
    block: ToolResultNode | { callId: string; name: string; argsRaw: string; turn: number; step: number; time: number; subCalls: never[] },
    over: Partial<Parameters<typeof ImageGenerateResult>[0]> = {},
  ): Parameters<typeof ImageGenerateResult>[0] => ({
    callId: 'image-1', toolName: 'image_generate', block,
    openFile: vi.fn(), loadImage: vi.fn(), renderSlot: vi.fn(),
    ...over,
  } as unknown as Parameters<typeof ImageGenerateResult>[0])

  it('renders through the session-authorized image slot and shows actual routes', () => {
    const slotImpl = (_key: string, owner: { images: unknown[] }) => <div data-gallery={owner.images.length} />
    const renderSlot = vi.fn(slotImpl) as unknown as PropsRenderSlots<'image-generation.result.images'>['renderSlot']
    const loadImage: MessageImageLoader = vi.fn(() => Promise.reject(new Error('not used')))
    const view = render(<ImageGenerateResult {...props(settled(), { loadImage, renderSlot })} />)

    expect(renderSlot).toHaveBeenCalledWith('image-generation.result.images', {
      images: [{ attachment: first }, { attachment: second }],
      loadImage,
      align: 'start',
    })
    expect(view.container.textContent).toContain('primary/image-v1')
    expect(view.container.textContent).toContain('fallback/image-v2')
    expect(view.container.textContent).not.toContain(first.attachmentId)
  })

  it('falls back to durable text and handles a running call without text', () => {
    const failed = render(<ImageGenerateResult {...props(settled({ meta: null }))} />)
    expect(failed.container.textContent).toBe('image_generateGenerated 2 candidates.')
    cleanup()
    const running = render(<ImageGenerateResult {...props({
      callId: 'running', name: 'image_generate', argsRaw: '{}', turn: 1, step: 1, time: 1, subCalls: [],
    })} />)
    expect(running.container.textContent).toBe('image_generate')
  })

  it('omits an empty durable caption', () => {
    const renderSlot = vi.fn(() => null) as unknown as PropsRenderSlots<'image-generation.result.images'>['renderSlot']
    const view = render(<ImageGenerateResult {...props(settled({ content: [
      { type: 'image', attachment: first },
      { type: 'image', attachment: second },
    ] }), { renderSlot })} />)
    expect(view.container.querySelector('p')).toBeNull()
  })

  it('registers and disposes the keyed tool view', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.slots.register({
      name: 'root',
      children: {
        'conversation.input.attachments': { kind: 'single', scope: 'session-maybe' },
        'conversation.message.images': { kind: 'single', scope: 'session' },
        'conversation.trajectory.images': { kind: 'single', scope: 'session' },
        'tool.call.images': { kind: 'single', scope: 'session' },
        'tool.call.toolview': { kind: 'keyed', scope: 'session' },
      },
    } as never, () => null)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()

    expect(ctx.slots.entries('tool.call.toolview').filter(entry => entry.options.key === 'image_generate')).toMatchObject([{
      component: ImageGenerateResult,
      locale: 'conversation',
    }])
    await fiber.dispose()
    expect(ctx.slots.entries('tool.call.toolview').filter(entry => entry.options.key === 'image_generate')).toHaveLength(0)
    await ctx.fiber.dispose()
  })
})
