/** Model-facing image generation tool over `ctx.imageGeneration`. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-image-generation'
import type {} from '@deepseek-ai/dsh-image-optimizer'

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

function latestUserImages(exec: ToolRunContext): ImageAttachmentRef[] {
  const session = exec.agent?.session
  if (session === undefined || session.header.isSeeded) return []
  const messages = session.deriveMessages()
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message === undefined || message.role !== 'user' || message.source.kind !== 'user') continue
    const images = message.content.flatMap(block => block.type === 'image' ? [block.attachment] : [])
    if (images.length > 0) return images
  }
  return []
}

function preparedReferenceImages(
  available: readonly ImageAttachmentRef[],
  references: readonly { inputIndex: number }[],
): ImageAttachmentRef[] {
  const selected = new Set<number>()
  return references.map((reference, position) => {
    const index = reference.inputIndex
    if (!Number.isSafeInteger(index) || index <= 0) {
      throw new Error(`image_generate: prepared.references[${String(position)}].inputIndex must be a positive safe integer`)
    }
    if (selected.has(index)) throw new Error(`image_generate: prepared reference ${String(index)} is duplicated`)
    selected.add(index)
    const attachment = available[index - 1]
    if (attachment === undefined) throw new Error(`image_generate: prepared reference ${String(index)} is unavailable`)
    return attachment
  })
}

function preparedSize(output: { width?: number; height?: number }): string | undefined {
  if ((output.width === undefined) !== (output.height === undefined)) {
    throw new Error('image_generate: prepared output width and height must be supplied together')
  }
  if (output.width === undefined || output.height === undefined) return undefined
  if (!Number.isSafeInteger(output.width) || output.width <= 0
    || !Number.isSafeInteger(output.height) || output.height <= 0) {
    throw new Error('image_generate: prepared output dimensions must be positive safe integers')
  }
  return `${String(output.width)}x${String(output.height)}`
}

/** Register `image_generate` over the auxiliary generated-image service. */
export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(defineTool({
    name: 'image_generate',
    description: 'Generate or edit an image with the configured default image model. After image_optimize returns prepared, pass only its prepared prompt, reference positions, output settings, and required capabilities in prepared. Refine the user request before calling in direct mode, using one detailed prompt and four variations. The conversation model remains unchanged.',
    timeoutMs: config.timeoutMs,
    parameters: {
      prepared: {
        type: 'object', additionalProperties: false,
        description: 'Executor inputs copied from one prepared image_optimize result. Do not include optimizer evidence or case ids.',
        properties: {
          prompt: { type: 'string', required: true, description: 'The prepared canonical prompt.' },
          references: {
            type: 'array', required: true,
            description: 'Prepared current-input reference positions and semantic metadata.',
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                inputIndex: { type: 'integer', required: true },
                role: { type: 'string', required: true, enum: ['style', 'layout', 'content', 'edit-target'] },
                priority: { type: 'integer', required: true },
              },
            },
          },
          output: {
            type: 'object', required: true, additionalProperties: false,
            properties: {
              aspectRatio: { type: 'string' }, width: { type: 'integer' }, height: { type: 'integer' },
              transparentBackground: { type: 'boolean', required: true },
              count: { type: 'integer', required: true },
            },
          },
          requiredCapabilities: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      prompt: { type: 'string', description: 'Legacy direct mode: a generation-ready English prompt refined from the user request. Specify subject, environment, composition, camera, lighting, materials, color, spatial relationships, finish, and relevant exclusions. Preserve quoted visible text and reference-image constraints exactly; do not forward a brief user description unchanged.' },
      variation_prompts: { type: 'array', items: { type: 'string' }, description: 'Legacy direct mode: exactly four concise candidate differences.' },
      size: { type: 'string', description: 'Optional provider-supported pixel size such as 1024x1024 or 1536x1024.' },
      use_reference_images: { type: 'boolean', description: 'Use images from the latest direct user message as references. Defaults to true when images are available.' },
      quality: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Optional provider-supported output quality.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false, properties: {
          images: { type: 'array', required: true, items: {
            type: 'object', additionalProperties: false, properties: {
              candidateIndex: { type: 'integer', required: true },
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
      presentationMeta(args, value) {
        return {
          images: value.images.map((image) => {
            const preference = args.prepared === undefined
              ? args.variation_prompts?.[image.candidateIndex]
              : undefined
            return {
              attachmentId: image.attachmentId,
              provider: image.provider,
              model: image.model,
              ...preference === undefined ? {} : { preference },
            }
          }),
          failedCount: value.failedCount,
        }
      },
    },
    async execute(args, exec) {
      if (args.prepared !== undefined) {
        if (args.prompt !== undefined || args.variation_prompts !== undefined || args.size !== undefined
          || args.use_reference_images !== undefined || args.quality !== undefined) {
          throw new Error('image_generate: prepared mode does not accept legacy direct arguments')
        }
        const count = args.prepared.output.count
        if (!Number.isSafeInteger(count) || count <= 0) {
          throw new Error('image_generate: prepared output count must be a positive safe integer')
        }
        if (exec.agent === undefined && args.prepared.references.length > 0) {
          throw new Error('image_generate: prepared references require an owning Agent')
        }
        const imageInputs = ctx.get('imageInputImages')
        if (imageInputs === undefined && args.prepared.references.length > 0) {
          throw new Error('image_generate: prepared references require image_optimize current-input capture')
        }
        const referenceImages = preparedReferenceImages(
          exec.agent === undefined || imageInputs === undefined ? [] : imageInputs.references(exec.agent),
          args.prepared.references,
        )
        const size = preparedSize(args.prepared.output)
        const generated = await ctx.imageGeneration.generate({
          prompt: args.prepared.prompt,
          count,
          ...referenceImages.length === 0 ? {} : { referenceImages, quality: 'high' as const },
          ...size === undefined ? {} : { size },
          ...(args.prepared.output.aspectRatio === undefined
            ? {} : { aspectRatio: args.prepared.output.aspectRatio }),
          transparentBackground: args.prepared.output.transparentBackground,
          requiredCapabilities: args.prepared.requiredCapabilities,
          signal: exec.signal,
        })
        exec.concludeTurn()
        return {
          images: generated.images.map(({ candidateIndex, provider, model, attachment: ref }) => ({
            candidateIndex, provider, model, attachmentId: String(ref.attachmentId), mediaType: ref.mediaType,
            bytes: ref.bytes, width: ref.width, height: ref.height,
            name: ref.name ?? 'generated-image',
          })),
          failedCount: generated.failedCount,
        }
      }
      if (args.prompt === undefined) throw new Error('image_generate: prompt is required in direct mode')
      if (args.variation_prompts === undefined || args.variation_prompts.length !== 4) {
        throw new Error('image_generate: variation_prompts must contain exactly four candidates')
      }
      const referenceImages = args.use_reference_images === false ? [] : latestUserImages(exec)
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
        images: generated.images.map(({ candidateIndex, provider, model, attachment: ref }) => ({
          candidateIndex, provider, model, attachmentId: String(ref.attachmentId), mediaType: ref.mediaType,
          bytes: ref.bytes, width: ref.width, height: ref.height,
          name: ref.name ?? 'generated-image',
        })),
        failedCount: generated.failedCount,
      }
    },
  }))
}
