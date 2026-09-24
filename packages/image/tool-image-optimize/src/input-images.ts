/** Current admitted direct-user image inputs for live Agents. @module @deepseek-ai/dsh-tool-image-optimize/input-images */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ImageInputImages } from '@deepseek-ai/dsh-image-optimizer'

/**
 * Observe admitted pre-step messages and retain direct-user image references per Agent.
 * @param ctx - plugin context that owns the event listeners.
 * @returns the process-local current-input lookup.
 */
export function createCurrentInputImages(ctx: Context): ImageInputImages {
  const states = new WeakMap<Agent, { turn: number; references: ImageAttachmentRef[] }>()

  ctx.on('agent/pre-step', async ({ agent, turn }, next): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    const references = decision.messages
      .filter(message => message.source.kind === 'user')
      .flatMap(message => message.content.flatMap(block => block.type === 'image' ? [block.attachment] : []))
    const current = states.get(agent)
    states.set(agent, {
      turn,
      references: current?.turn === turn ? [...current.references, ...references] : references,
    })
    return decision
  })

  ctx.on('agent/disposed', ({ agent }) => {
    states.delete(agent)
  })

  return {
    references(agent) {
      return [...states.get(agent)?.references ?? []]
    },
  }
}
