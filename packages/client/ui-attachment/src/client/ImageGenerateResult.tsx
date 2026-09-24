/** Durable image-generation result derivation and keyed Tool view. */
import type { AttachmentId, ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import css from './ImageGenerateResult.module.css'

interface CandidateMeta {
  attachmentId: string
  provider: string
  model: string
  preference?: string
}

/** One generated candidate joined from durable content and presentation metadata. */
export interface ImageGenerateCandidate {
  attachment: ImageAttachmentRef
  provider: string
  model: string
  preference?: string
}

/** Pure material rendered for one successful image generation result. */
export interface ImageGenerateResultModel {
  prompt: string
  candidates: readonly ImageGenerateCandidate[]
  failedCount: number
  text: string
}

const MEDIA_TYPES: ReadonlySet<ImageMediaType> = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
])

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function promptOf(argsRaw: string): string | null {
  try {
    const value = JSON.parse(argsRaw) as unknown
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const prompt = (value as Record<string, unknown>)['prompt']
    return typeof prompt === 'string' && prompt.length > 0 ? prompt : null
  } catch {
    return null
  }
}

function attachmentOf(value: unknown): ImageAttachmentRef | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const { attachmentId, mediaType, bytes, width, height, name, originalDimensions } = value as Record<string, unknown>
  if (typeof attachmentId !== 'string' || attachmentId.length === 0) return null
  if (typeof mediaType !== 'string' || !MEDIA_TYPES.has(mediaType as ImageMediaType)) return null
  if (!positiveInteger(bytes) || !positiveInteger(width) || !positiveInteger(height)) return null
  if (name !== undefined && typeof name !== 'string') return null
  let inputDimensions: ImageAttachmentRef['originalDimensions'] | undefined
  if (originalDimensions !== undefined) {
    if (typeof originalDimensions !== 'object' || originalDimensions === null || Array.isArray(originalDimensions)) return null
    const dimensions = originalDimensions as Record<string, unknown>
    if (!positiveInteger(dimensions['width']) || !positiveInteger(dimensions['height'])) return null
    inputDimensions = { width: dimensions['width'], height: dimensions['height'] }
  }
  return {
    attachmentId: attachmentId as AttachmentId,
    mediaType: mediaType as ImageMediaType,
    bytes,
    width,
    height,
    ...name === undefined ? {} : { name },
    ...inputDimensions === undefined ? {} : { originalDimensions: inputDimensions },
  }
}

function metaOf(value: unknown): { images: CandidateMeta[]; failedCount: number } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const { images, failedCount } = value as Record<string, unknown>
  if (!Array.isArray(images) || !Number.isInteger(failedCount) || (failedCount as number) < 0) return null
  const candidates: CandidateMeta[] = []
  for (const image of images) {
    if (typeof image !== 'object' || image === null || Array.isArray(image)) return null
    const { attachmentId, provider, model, preference } = image as Record<string, unknown>
    if (typeof attachmentId !== 'string' || attachmentId.length === 0) return null
    if (typeof provider !== 'string' || provider.length === 0) return null
    if (typeof model !== 'string' || model.length === 0) return null
    if (preference !== undefined && typeof preference !== 'string') return null
    candidates.push({ attachmentId, provider, model, ...preference === undefined ? {} : { preference } })
  }
  return { images: candidates, failedCount: failedCount as number }
}

/**
 * Derive a successful result from the raw durable call/result and its persisted metadata.
 * @param block - running or settled Tool block.
 * @returns render material, or null when the durable fields do not agree.
 */
export function imageGenerateResultModel(block: ToolCallBlock): ImageGenerateResultModel | null {
  if (!('kind' in block) || block.isError || block.call?.name !== 'image_generate') return null
  const prompt = promptOf(block.call.argsRaw)
  const meta = metaOf(block.meta)
  if (prompt === null || meta === null) return null
  const refs = block.content.flatMap((part) => {
    if (part.type !== 'image') return []
    const attachment = attachmentOf(part.attachment)
    return [attachment]
  })
  if (refs.some(ref => ref === null) || refs.length !== meta.images.length) return null
  const candidates: ImageGenerateCandidate[] = []
  for (let index = 0; index < refs.length; index += 1) {
    const attachment = refs[index]
    const candidate = meta.images[index]
    if (attachment === null || attachment === undefined || candidate === undefined
      || String(attachment.attachmentId) !== candidate.attachmentId) return null
    candidates.push({
      attachment,
      provider: candidate.provider,
      model: candidate.model,
      ...candidate.preference === undefined ? {} : { preference: candidate.preference },
    })
  }
  const text = block.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n')
  return { prompt, candidates, failedCount: meta.failedCount, text }
}

type ImageGenerateResultProps = ToolCallViewProps & PropsRenderSlots<'image-generation.result.images'>

/** Render one durable image generation result through the session-authorized attachment slot. */
export function ImageGenerateResult(props: ImageGenerateResultProps) {
  const model = imageGenerateResultModel(props.block)
  if (model === null) {
    const text = 'kind' in props.block
      ? props.block.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n')
      : ''
    return <div className={css.root} data-tool="image_generate"><strong>{props.toolName}</strong>{text !== '' && <p>{text}</p>}</div>
  }
  return (
    <div className={css.root} data-tool="image_generate">
      <div className={css.header}>
        <strong>{props.toolName}</strong>
        <span>{model.prompt}</span>
      </div>
      {props.renderSlot('image-generation.result.images', {
        images: model.candidates.map(candidate => ({ attachment: candidate.attachment })),
        loadImage: props.loadImage,
        align: 'start',
      })}
      <div className={css.routes}>
        {model.candidates.map(candidate => (
          <span key={String(candidate.attachment.attachmentId)}>{candidate.provider}/{candidate.model}</span>
        ))}
      </div>
      {model.text !== '' && <p className={css.caption}>{model.text}</p>}
    </div>
  )
}
