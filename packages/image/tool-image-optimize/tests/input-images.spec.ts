import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { createCurrentInputImages } from '../src/input-images.ts'
import { emitPreStep, imageMessage, imageRef, stubAgent } from './harness.ts'

describe('current-input image capture', () => {
  it('captures admitted direct-user images only after downstream pre-step listeners settle', async () => {
    const ctx = new Context()
    const capture = createCurrentInputImages(ctx)
    const agent = stubAgent('capture-order', ctx)
    const entered = Promise.withResolvers<undefined>()
    const release = Promise.withResolvers<undefined>()
    const first = imageRef('a')
    const second = imageRef('b')
    const pending = emitPreStep(ctx, agent, 1, 1, [], async () => {
      entered.resolve(undefined)
      await release.promise
      return {
        kind: 'enter',
        messages: [
          imageMessage([imageRef('plugin')], { kind: 'plugin', plugin: 'fixture' }),
          imageMessage([first]),
          imageMessage([second]),
        ],
      }
    })
    await entered.promise
    expect(capture.references(agent)).toEqual([])
    release.resolve(undefined)
    expect((await pending).kind).toBe('enter')
    expect(capture.references(agent)).toEqual([first, second])
  })

  it('appends later steps in one turn, resets the next turn, and clears on disposal', async () => {
    const ctx = new Context()
    const capture = createCurrentInputImages(ctx)
    const agent = stubAgent('capture-lifecycle', ctx)
    const a = imageRef('a')
    const b = imageRef('b')
    const c = imageRef('c')
    await emitPreStep(ctx, agent, 3, 1, [
      createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'edit this' }] }),
      imageMessage([a]),
    ])
    await emitPreStep(ctx, agent, 3, 2, [imageMessage([b])])
    expect(capture.references(agent)).toEqual([a, b])
    await emitPreStep(ctx, agent, 4, 1, [imageMessage([c])])
    const copy = capture.references(agent) as ImageAttachmentRef[]
    copy.length = 0
    expect(capture.references(agent)).toEqual([c])
    ctx.emit('agent/disposed', { agent })
    expect(capture.references(agent)).toEqual([])
  })

  it('does not replace captured input when the downstream listener rejects the step', async () => {
    const ctx = new Context()
    const capture = createCurrentInputImages(ctx)
    const agent = stubAgent('capture-reject', ctx)
    const accepted = imageRef('accepted')
    await emitPreStep(ctx, agent, 1, 1, [imageMessage([accepted])])
    await emitPreStep(ctx, agent, 2, 1, [imageMessage([imageRef('rejected')])], async () => ({ kind: 'reject' }))
    expect(capture.references(agent)).toEqual([accepted])
  })
})
