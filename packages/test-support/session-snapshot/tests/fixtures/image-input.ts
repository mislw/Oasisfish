/** Admit one durable image reference into the image-optimization snapshot turn. */

import type { Context } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'

export const name = 'snapshot-image-input'

const attachment = {
  attachmentId: 'sha256:b1ff9c8ea3a780bad09b346c423d2d0e46815926879b18e841d928376a946640',
  mediaType: 'image/png',
  bytes: 69,
  width: 1,
  height: 1,
} as ImageAttachmentRef

/** Add the fixture image to the direct-user message before image references are captured. */
export function apply(ctx: Context): void {
  ctx.on('agent/pre-step', ({ messages, turn, step }, next): Promise<PreStepDecision> => {
    if (turn === 1 && step === 1) {
      const index = messages.findIndex(message => message.source.kind === 'user')
      if (index !== -1) {
        const message = messages[index]!
        messages[index] = { ...message, content: [...message.content, { type: 'image', attachment }] }
      }
    }
    return next()
  }, { prepend: true })
}
