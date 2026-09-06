/** Browser attachment plugin: fills conversation's composer and message-image slots. */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { IConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { ComposerAttachments } from './ComposerAttachments.tsx'
import { ImageGenerateResult } from './ImageGenerateResult.tsx'
import { MessageImages } from './MessageImages.tsx'

/** Slot registry required by this presentation plugin. */
export const inject = ['slots', 'conversation']

/** Register attachment presentation without exporting React components as package values. */
export function apply(ctx: ClientContext): void {
  const conversation = ctx.get('conversation') as IConversation
  ctx.slots.inject('conversation.input.attachments', () => ctx.slots.register({
    name: 'conversation.input.attachments',
    locale: 'conversation',
  }, ComposerAttachments))
  ctx.slots.inject('conversation.message.images', () => ctx.slots.register({
    name: 'conversation.message.images',
    locale: 'conversation',
  }, MessageImages))
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'image_generate',
    locale: 'conversation',
    inject: (sessionId: SessionId) => ({
      loadImage: attachment => conversation.resolveImage(sessionId, attachment),
    }),
  }, ImageGenerateResult))
}
