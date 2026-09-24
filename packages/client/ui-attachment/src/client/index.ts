/** Browser attachment plugin: fills conversation's composer and image slots. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-trajectory/client'
import type { MessageImageLoader, MessageImageSource } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ComposerAttachments } from './ComposerAttachments.tsx'
import { ImageGenerateResult } from './ImageGenerateResult.tsx'
import { MessageImages } from './MessageImages.tsx'

/** Image references and session-authorized loader passed by the keyed Tool result. */
export interface ImageGenerationImagesOwnerProps {
  images: readonly MessageImageSource[]
  loadImage: MessageImageLoader
  align: 'start' | 'end'
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * One gallery inside a settled `image_generate` result. A registrant
     * receives the durable image references and session-authorized loader
     * from the keyed Tool view, replacing its default gallery. Without a
     * registration the result still shows its text and route labels.
     */
    'image-generation.result.images': { kind: 'single'; scope: 'session'; owner: ImageGenerationImagesOwnerProps }
  }
}

/** Slot registry required by this presentation plugin. */
export const inject = ['slots']

/** Register attachment presentation without exporting React components as package values. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.input.attachments', () => ctx.slots.register({
    name: 'conversation.input.attachments',
    locale: 'conversation',
  }, ComposerAttachments))
  ctx.slots.inject('conversation.message.images', () => ctx.slots.register({
    name: 'conversation.message.images',
    locale: 'conversation',
  }, MessageImages))
  ctx.slots.inject('conversation.trajectory.images', () => ctx.slots.register({
    name: 'conversation.trajectory.images',
    locale: 'conversation',
  }, MessageImages))
  // The tool image gallery reuses the message gallery renderer: its owner
  // carries the same images/loadImage/align share the message arm does.
  ctx.slots.inject('tool.call.images', () => ctx.slots.register({
    name: 'tool.call.images',
    locale: 'conversation',
  }, MessageImages))
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'image_generate',
    locale: 'conversation',
    children: { 'image-generation.result.images': { kind: 'single', scope: 'session' } },
  }, ImageGenerateResult))
  ctx.slots.inject('image-generation.result.images', () => ctx.slots.register({
    name: 'image-generation.result.images',
    locale: 'conversation',
  }, MessageImages))
}
