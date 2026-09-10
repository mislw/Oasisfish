/** Model-facing image generation tool over `ctx.imageGeneration`. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-image-generation'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-image-generate'
/** Services required by the generated-image Consumer. */
export const inject = ['tools', 'imageGeneration']

/** Image generation tool runtime limits. */
export interface Config {
  /** Maximum duration of one provider request, image download, and attachment save. */
  timeoutMs: number
}
/** Runtime validator for {@link Config}. */
export const Config: z<Config> = z.object({ timeoutMs: z.number().step(1).min(1).required() })

type SessionEvent = NonNullable<ToolRunContext['agent']>['session']['events'][number]

function isDirectUserMessage(event: SessionEvent): event is Extract<SessionEvent, { type: 'user/message' }> {
  return event.type === 'user/message' && event.data.source.kind === 'user'
}

function latestUserImages(exec: ToolRunContext): ImageAttachmentRef[] {
  const events = exec.agent?.session.events ?? []
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event === undefined || !isDirectUserMessage(event)) continue
    const images = event.data.content.flatMap(block => block.type === 'image' ? [block.attachment] : [])
    if (images.length > 0) return images
  }
  return []
}

/** Register `image_generate` over the auxiliary generated-image service. */
export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(defineTool({
    name: 'image_generate',
    description: 'Generate or edit an image with the configured default image model. Refine the user request before calling: turn brief wording into a detailed, coherent visual specification while preserving every explicit requirement. Reuse images from the latest direct user message when they are relevant. The conversation model remains unchanged.',
    timeoutMs: config.timeoutMs,
    parameters: {
      prompt: { type: 'string', required: true, description: 'A generation-ready English prompt refined from the user request. Specify subject, environment, composition, camera, lighting, materials, color, spatial relationships, finish, and relevant exclusions. Preserve quoted visible text and reference-image constraints exactly; do not forward a brief user description unchanged.' },
      variation_prompts: { type: 'array', required: true, items: { type: 'string' }, description: 'Exactly four concise candidate differences. Vary composition, material, lighting, camera, or graphic structure without changing the shared requirements.' },
      size: { type: 'string', description: 'Optional provider-supported pixel size such as 1024x1024 or 1536x1024.' },
      use_reference_images: { type: 'boolean', description: 'Use images from the latest direct user message as references. Defaults to true when images are available.' },
      quality: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Optional provider-supported output quality.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false, properties: {
          images: { type: 'array', required: true, items: {
            type: 'object', additionalProperties: false, properties: {
              provider: { type: 'string', required: true }, model: { type: 'string', required: true },
              attachmentId: { type: 'string', required: true }, mediaType: { type: 'string', required: true },
              bytes: { type: 'integer', required: true }, width: { type: 'integer', required: true },
              height: { type: 'integer', required: true }, name: { type: 'string', required: true },
            },
          } },
          failedCount: { type: 'integer', required: true },
        },
      },
      render(_args, value) {
        return [
          { type: 'text', text: `已生成 ${String(value.images.length)} 个方案，请选择。` },
          ...value.images.map(image => ({
            type: 'image' as const,
            attachment: {
              attachmentId: AttachmentId(image.attachmentId),
              mediaType: image.mediaType as ImageMediaType,
              bytes: image.bytes, width: image.width, height: image.height, name: image.name,
            },
          })),
        ]
      },
    },
    async execute(args, exec) {
      const referenceImages = args.use_reference_images === false ? [] : latestUserImages(exec)
      if (args.variation_prompts.length !== 4) {
        throw new Error('image_generate: variation_prompts must contain exactly four candidates')
      }
      const generated = await ctx.imageGeneration.generate({
        prompt: args.prompt,
        count: 4,
        variations: args.variation_prompts,
        ...args.size === undefined ? {} : { size: args.size },
        ...args.quality === undefined
          ? referenceImages.length === 0 ? {} : { quality: 'high' as const }
          : { quality: args.quality },
        ...referenceImages.length === 0 ? {} : { referenceImages },
        signal: exec.signal,
      })
      exec.concludeTurn()
      return {
        images: generated.images.map(({ provider, model, attachment: ref }) => ({
          provider, model, attachmentId: String(ref.attachmentId), mediaType: ref.mediaType,
          bytes: ref.bytes, width: ref.width, height: ref.height,
          name: ref.name ?? 'generated-image',
        })),
        failedCount: generated.failedCount,
      }
    },
  }))
}
