import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { CallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
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
    await ctx.fiber.dispose()
  })

  it('calls the auxiliary image service and returns a durable image block', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const generate = vi.fn(() => Promise.resolve({
      provider: 'gpt',
      model: 'gpt-image-1',
      attachment: {
        attachmentId: AttachmentId('sha256:test'),
        mediaType: 'image/png' as const,
        bytes: 8,
        width: 1,
        height: 1,
        name: 'generated.png',
      },
    }))
    ctx.provide('imageGeneration', { generate } as never)
    await ctx.plugin(tool, { timeoutMs: 180_000 })

    const signal = new AbortController().signal
    const result = await ctx.tools.execute({
      signal,
      callId: CallId('image-1'),
      name: 'image_generate',
      arguments: { prompt: 'A game inventory panel', size: '1536x1024', quality: 'medium' },
    })

    expect(generate).toHaveBeenCalledWith({
      prompt: 'A game inventory panel', size: '1536x1024', quality: 'medium', signal,
    })
    expect(result.isError).toBe(false)
    expect(result.content).toEqual([
      { type: 'text', text: 'Generated image with gpt/gpt-image-1.' },
      {
        type: 'image',
        attachment: {
          attachmentId: 'sha256:test', mediaType: 'image/png', bytes: 8,
          width: 1, height: 1, name: 'generated.png',
        },
      },
    ])
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
      provider: 'gpt', model: 'gpt-image-2',
      attachment: {
        attachmentId: AttachmentId('sha256:generated'), mediaType: 'image/png' as const,
        bytes: 10, width: 10, height: 10, name: 'generated.png',
      },
    }))
    ctx.provide('imageGeneration', { generate } as never)
    await ctx.plugin(tool, { timeoutMs: 180_000 })

    const signal = new AbortController().signal
    await ctx.tools.execute({
      signal, callId: CallId('image-reference'), name: 'image_generate',
      arguments: { prompt: 'Preserve the logo structure.' },
      agent: { session } as never,
    })

    expect(generate).toHaveBeenCalledWith({
      prompt: 'Preserve the logo structure.', referenceImages: [latest],
      quality: 'high', signal,
    })
    await ctx.fiber.dispose()
  })

  it('omits optional size and supplies the fallback attachment name', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const generate = vi.fn(() => Promise.resolve({
      provider: 'gpt', model: 'gpt-image-1',
      attachment: {
        attachmentId: AttachmentId('sha256:test'), mediaType: 'image/png' as const,
        bytes: 8, width: 1, height: 1,
      },
    }))
    ctx.provide('imageGeneration', { generate } as never)
    await ctx.plugin(tool, { timeoutMs: 180_000 })

    const signal = new AbortController().signal
    const result = await ctx.tools.execute({
      signal, callId: CallId('image-2'), name: 'image_generate', arguments: { prompt: 'An icon' },
    })

    expect(generate).toHaveBeenCalledWith({ prompt: 'An icon', signal })
    expect(result.value).toMatchObject({ name: 'generated-image' })
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
      provider: 'gpt', model: 'gpt-image-2',
      attachment: {
        attachmentId: AttachmentId('sha256:new'), mediaType: 'image/png' as const,
        bytes: 8, width: 1, height: 1, name: 'new.png',
      },
    }))
    ctx.provide('imageGeneration', { generate } as never)
    await ctx.plugin(tool, { timeoutMs: 180_000 })

    const signal = new AbortController().signal
    await ctx.tools.execute({
      signal, callId: CallId('image-without-reference'), name: 'image_generate',
      arguments: { prompt: 'Create a completely unrelated image.', use_reference_images: false },
      agent: { session } as never,
    })

    expect(generate).toHaveBeenCalledWith({ prompt: 'Create a completely unrelated image.', signal })
    await ctx.fiber.dispose()
  })
})
