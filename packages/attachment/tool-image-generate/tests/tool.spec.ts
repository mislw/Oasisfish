import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { ToolCallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import { SESSION_FORMAT_VERSION, Session, SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as tool from '../src/index.ts'

describe('image_generate', () => {
  it('instructs the conversation model to refine a generation-ready prompt before calling', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    ctx.provide('imageGeneration', { generate: vi.fn() } as never)
    await ctx.plugin(tool, { timeoutMs: 180_000 })

    const schema = ctx.tools.schemas().find(candidate => candidate.name === 'image_generate')
    expect(schema?.description).toContain('Refine the user request before calling')
    expect(JSON.stringify(schema?.parameters)).toContain('composition, camera, lighting, materials, color')
    expect(JSON.stringify(schema?.parameters)).toContain('generation-ready English prompt')
    expect(JSON.stringify(schema?.parameters)).toContain('variation_prompts')
    await ctx.fiber.dispose()
  })

  it('generates four refined variations and returns four durable image blocks', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const generate = vi.fn(() => Promise.resolve({
      images: Array.from({ length: 4 }, (_, index) => ({
        candidateIndex: index, provider: 'gpt', model: 'gpt-image-1',
        attachment: {
          attachmentId: AttachmentId(`sha256:test-${String(index + 1)}`),
          mediaType: 'image/png' as const, bytes: 8, width: 1, height: 1,
          name: `generated-${String(index + 1)}.png`,
        },
      })),
      failedCount: 0,
    }))
    ctx.provide('imageGeneration', { generate } as never)
    await ctx.plugin(tool, { timeoutMs: 180_000 })

    const signal = new AbortController().signal
    const result = await ctx.tools.execute({
      signal,
      callId: ToolCallId('image-1'),
      name: 'image_generate',
      arguments: {
        prompt: 'A game inventory panel',
        variation_prompts: ['front view', 'three-quarter view', 'soft light', 'dramatic light'],
        size: '1536x1024', quality: 'medium',
      },
    })

    expect(generate).toHaveBeenCalledWith({
      prompt: 'A game inventory panel',
      variations: ['front view', 'three-quarter view', 'soft light', 'dramatic light'],
      count: 4, size: '1536x1024', quality: 'medium', signal,
    })
    expect(result.isError).toBe(false)
    expect(result.concludesTurn).toBe(true)
    expect(result.meta).toEqual({
      images: Array.from({ length: 4 }, (_, index) => ({
        attachmentId: `sha256:test-${String(index + 1)}`,
        provider: 'gpt', model: 'gpt-image-1',
        preference: ['front view', 'three-quarter view', 'soft light', 'dramatic light'][index],
      })),
      failedCount: 0,
    })
    expect(result.content).toEqual([
      { type: 'text', text: '已生成 4 个方案，请选择。' },
      ...Array.from({ length: 4 }, (_, index) => ({
        type: 'image' as const,
        attachment: {
          attachmentId: `sha256:test-${String(index + 1)}`, mediaType: 'image/png' as const,
          bytes: 8, width: 1, height: 1, name: `generated-${String(index + 1)}.png`,
        },
      })),
    ])
    await ctx.fiber.dispose()
  })

  it('keeps successful candidates when one generation fails', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    ctx.provide('imageGeneration', { generate: vi.fn(() => Promise.resolve({
      images: [{
        candidateIndex: 0, provider: 'gpt', model: 'gpt-image-1',
        attachment: {
          attachmentId: AttachmentId('sha256:partial'), mediaType: 'image/png' as const,
          bytes: 8, width: 1, height: 1, name: 'generated-1.png',
        },
      }],
      failedCount: 3,
    })) } as never)
    await ctx.plugin(tool, { timeoutMs: 180_000 })

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('image-partial'), name: 'image_generate',
      arguments: {
        prompt: 'An icon', variation_prompts: ['a', 'b', 'c', 'd'],
      },
    })

    expect(result.content).toHaveLength(2)
    expect(result.content[0]).toEqual({ type: 'text', text: '已生成 1 个方案，请选择。' })
    const image = result.content[1]
    expect(image?.type).toBe('image')
    if (image?.type !== 'image') throw new Error('expected an image result')
    expect(image.attachment.attachmentId).toBe('sha256:partial')
    expect(result.concludesTurn).toBe(true)
    await ctx.fiber.dispose()
  })

  it('labels retained images with their original variation after earlier candidates fail', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    ctx.provide('imageGeneration', { generate: vi.fn(() => Promise.resolve({
      images: [1, 3].map(index => ({
        candidateIndex: index,
        provider: 'gpt', model: 'gpt-image-1',
        attachment: {
          attachmentId: AttachmentId(`sha256:partial-${String(index)}`),
          mediaType: 'image/png' as const, bytes: 8, width: 1, height: 1,
          name: `generated-${String(index + 1)}.png`,
        },
      })),
      failedCount: 2,
    })) } as never)
    await ctx.plugin(tool, { timeoutMs: 180_000 })

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('image-gapped'), name: 'image_generate',
      arguments: {
        prompt: 'An icon', variation_prompts: ['front view', 'side view', 'soft light', 'dramatic light'],
      },
    })

    expect(result.isError).toBe(false)
    expect(result.meta).toEqual({
      images: [
        { attachmentId: 'sha256:partial-1', provider: 'gpt', model: 'gpt-image-1', preference: 'side view' },
        { attachmentId: 'sha256:partial-3', provider: 'gpt', model: 'gpt-image-1', preference: 'dramatic light' },
      ],
      failedCount: 2,
    })
    await ctx.fiber.dispose()
  })

  it('passes the latest direct user images as high-quality edit references', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const first = {
      attachmentId: AttachmentId('sha256:first'), mediaType: 'image/png' as const,
      bytes: 8, width: 8, height: 8, name: 'first.png',
    }
    const latest = {
      attachmentId: AttachmentId('sha256:latest'), mediaType: 'image/jpeg' as const,
      bytes: 9, width: 9, height: 9, name: 'latest.jpg',
    }
    const session = Session.create(SessionId('image-reference'))
    session.append('user/message', createUserMessage({
      content: [{ type: 'image', attachment: first }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'Use this one.' }, { type: 'image', attachment: latest }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    session.append('user/message', createUserMessage({
      content: [{ type: 'image', attachment: first }], source: { kind: 'plugin', plugin: 'test' },
    }), { surfaceOp: 'append' })
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'Keep the latest image as the reference.' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    const generate = vi.fn(() => Promise.resolve({
      images: [{ candidateIndex: 0, provider: 'gpt', model: 'gpt-image-2', attachment: {
        attachmentId: AttachmentId('sha256:generated'), mediaType: 'image/png' as const,
        bytes: 10, width: 10, height: 10, name: 'generated.png',
      } }],
      failedCount: 3,
    }))
    ctx.provide('imageGeneration', { generate } as never)
    await ctx.plugin(tool, { timeoutMs: 180_000 })

    const signal = new AbortController().signal
    await ctx.tools.execute({
      signal, callId: ToolCallId('image-reference'), name: 'image_generate',
      arguments: {
        prompt: 'Preserve the logo structure.', variation_prompts: ['a', 'b', 'c', 'd'],
      },
      agent: { session } as never,
    })

    expect(generate).toHaveBeenCalledWith({
      prompt: 'Preserve the logo structure.', variations: ['a', 'b', 'c', 'd'], count: 4,
      referenceImages: [latest], quality: 'high', signal,
    })
    await ctx.fiber.dispose()
  })

  it('does not authorize images inherited from a parent Agent session', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const parent = Session.create(SessionId('image-parent'))
    parent.append('user/message', createUserMessage({
      content: [{ type: 'image', attachment: {
        attachmentId: AttachmentId('sha256:parent'), mediaType: 'image/png',
        bytes: 8, width: 8, height: 8, name: 'parent.png',
      } }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    const childId = SessionId('image-child')
    const child = Session.create(childId, parent.snapshotEvents(), {
      version: SESSION_FORMAT_VERSION,
      id: childId,
      createdAt: 1,
      isSeeded: true,
      parentSession: parent.id,
      origin: 'subagent',
    }, parent.seq)
    const generate = vi.fn(() => Promise.resolve({
      images: [{ candidateIndex: 0, provider: 'gpt', model: 'gpt-image-2', attachment: {
        attachmentId: AttachmentId('sha256:new'), mediaType: 'image/png' as const,
        bytes: 8, width: 1, height: 1, name: 'new.png',
      } }],
      failedCount: 3,
    }))
    ctx.provide('imageGeneration', { generate } as never)
    await ctx.plugin(tool, { timeoutMs: 180_000 })

    const signal = new AbortController().signal
    await ctx.tools.execute({
      signal, callId: ToolCallId('image-child'), name: 'image_generate',
      arguments: { prompt: 'An icon', variation_prompts: ['a', 'b', 'c', 'd'] },
      agent: { session: child } as never,
    })

    expect(generate).toHaveBeenCalledWith({
      prompt: 'An icon', variations: ['a', 'b', 'c', 'd'], count: 4, signal,
    })
    await ctx.fiber.dispose()
  })

  it('omits optional size and supplies the fallback attachment name', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const generate = vi.fn(() => Promise.resolve({
      images: [{ candidateIndex: 0, provider: 'gpt', model: 'gpt-image-1', attachment: {
        attachmentId: AttachmentId('sha256:test'), mediaType: 'image/png' as const,
        bytes: 8, width: 1, height: 1,
      } }],
      failedCount: 3,
    }))
    ctx.provide('imageGeneration', { generate } as never)
    await ctx.plugin(tool, { timeoutMs: 180_000 })

    const signal = new AbortController().signal
    const result = await ctx.tools.execute({
      signal, callId: ToolCallId('image-2'), name: 'image_generate',
      arguments: { prompt: 'An icon', variation_prompts: ['a', 'b', 'c', 'd'] },
    })

    expect(generate).toHaveBeenCalledWith({
      prompt: 'An icon', variations: ['a', 'b', 'c', 'd'], count: 4, signal,
    })
    expect(result.value).toMatchObject({ images: [{ name: 'generated-image' }], failedCount: 3 })
    await ctx.fiber.dispose()
  })

  it('lets the model ignore an earlier user image explicitly', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const session = Session.create(SessionId('image-without-reference'))
    session.append('user/message', createUserMessage({
      content: [{
        type: 'image',
        attachment: {
          attachmentId: AttachmentId('sha256:ignore'), mediaType: 'image/png',
          bytes: 8, width: 8, height: 8, name: 'ignore.png',
        },
      }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    const generate = vi.fn(() => Promise.resolve({
      images: [{ candidateIndex: 0, provider: 'gpt', model: 'gpt-image-2', attachment: {
        attachmentId: AttachmentId('sha256:new'), mediaType: 'image/png' as const,
        bytes: 8, width: 1, height: 1, name: 'new.png',
      } }],
      failedCount: 3,
    }))
    ctx.provide('imageGeneration', { generate } as never)
    await ctx.plugin(tool, { timeoutMs: 180_000 })

    const signal = new AbortController().signal
    await ctx.tools.execute({
      signal, callId: ToolCallId('image-without-reference'), name: 'image_generate',
      arguments: {
        prompt: 'Create a completely unrelated image.', variation_prompts: ['a', 'b', 'c', 'd'],
        use_reference_images: false,
      },
      agent: { session } as never,
    })

    expect(generate).toHaveBeenCalledWith({
      prompt: 'Create a completely unrelated image.', variations: ['a', 'b', 'c', 'd'], count: 4, signal,
    })
    await ctx.fiber.dispose()
  })

  it('rejects a candidate list whose length is not four', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const generate = vi.fn()
    ctx.provide('imageGeneration', { generate } as never)
    await ctx.plugin(tool, { timeoutMs: 180_000 })

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('image-invalid-variations'),
      name: 'image_generate',
      arguments: { prompt: 'An icon', variation_prompts: ['only one'] },
    })

    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('variation_prompts must contain exactly four candidates')
    expect(generate).not.toHaveBeenCalled()
    await ctx.fiber.dispose()
  })

  it('removes the tool registration with its plugin fiber', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    ctx.provide('imageGeneration', { generate: vi.fn() } as never)
    const fiber = ctx.plugin(tool, { timeoutMs: 180_000 })
    await fiber.await()
    expect(ctx.tools.schemas().some(schema => schema.name === 'image_generate')).toBe(true)

    await fiber.dispose()

    expect(ctx.tools.schemas().some(schema => schema.name === 'image_generate')).toBe(false)
    await ctx.fiber.dispose()
  })
})
