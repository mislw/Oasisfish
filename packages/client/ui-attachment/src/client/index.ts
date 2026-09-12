/** Browser attachment plugin: fills conversation's composer and message-image slots. */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { IConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { ComposerAttachments } from './ComposerAttachments.tsx'
import { ImageGenerateResult } from './ImageGenerateResult.tsx'
import { MessageImages } from './MessageImages.tsx'

/** Slot registry required by this presentation plugin. */
export const inject = ['slots', 'conversation', 'sessions', 'remote', 'remote.memory']

function preferenceMemory(preference: string): string {
  return `Image style preference selected through continue editing: ${preference}. Preserve candidate diversity with adjacent and contrasting explorations.`
}

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
      selectImage: async (attachment, preference) => {
        await conversation.addImageToDraft(sessionId, attachment)
        if (preference === undefined || preference.trim() === '') return
        const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
        const request = cwd === undefined
          ? { scope: 'user' as const, content: preferenceMemory(preference) }
          : { scope: 'project' as const, cwd, content: preferenceMemory(preference) }
        try {
          await ctx.remote.memory.add(request)
        } catch {
          // Preference learning is optional; editing the selected image already succeeded.
        }
      },
    }),
  }, ImageGenerateResult))
}
