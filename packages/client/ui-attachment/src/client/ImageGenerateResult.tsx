import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { IconInspectOutline12, IconSparkle16, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ImageGallery } from '../MessageImage.tsx'
import { messageImageLabels } from './labels.ts'
import css from './ImageGenerateResult.module.css'

/** Session-authorized attachment loader supplied by this plugin's slot registration. */
export interface ImageGenerateResultInjected {
  /** Resolve one durable result attachment inside the owning session. */
  loadImage: (attachment: ImageAttachmentRef) => Promise<string>
}

type ImageGenerateResultProps = ToolCallViewProps
  & PropsLocale<'conversation'>
  & InjectFace<ImageGenerateResultInjected>

type ResultState = 'running' | 'ok' | 'error' | 'stopped'

/** First physical line for compact prompt and error summaries. */
function firstLine(value: string): string {
  const newline = value.indexOf('\n')
  return newline === -1 ? value : value.slice(0, newline)
}

/** Recover the prompt from the durable call slice without consulting live settings. */
function promptOf(block: ToolCallViewProps['block']): string {
  const argsRaw = ('kind' in block ? block.call?.argsRaw : block.argsRaw) ?? ''
  try {
    const args = JSON.parse(argsRaw) as unknown
    if (typeof args === 'object' && args !== null) {
      const prompt = (args as Record<string, unknown>).prompt
      if (typeof prompt === 'string' && prompt !== '') return firstLine(prompt)
    }
  } catch {
    // A running call may expose truncated JSON; its first line remains useful.
  }
  return argsRaw === '' ? block.callId : firstLine(argsRaw)
}

/** Tool lifecycle state from the frozen running-or-settled block. */
function stateOf(block: ToolCallViewProps['block']): ResultState {
  if (!('kind' in block)) return 'running'
  if (block.error?.code === 'interrupted') return 'stopped'
  return block.isError ? 'error' : 'ok'
}

/** Generated image blocks retained in the settled result. */
function imagesOf(block: ToolCallViewProps['block']): readonly { attachment: ImageAttachmentRef }[] {
  if (!('kind' in block)) return []
  return block.content.flatMap(item => item.type === 'image' ? [{ attachment: item.attachment }] : [])
}

/** Text result retained as a compact provider or failure caption. */
function captionOf(block: ToolCallViewProps['block']): string | null {
  if (!('kind' in block)) return null
  const text = block.content.flatMap(item => item.type === 'text' ? [item.text] : []).join('\n')
  if (text !== '') return text
  if (block.error !== undefined) return `${block.error.name}: ${block.error.code}`
  return null
}

/** State-aware leading icon for the generated-image row. */
function leading(state: ResultState) {
  if (state === 'error') return <StateDot state="error" />
  if (state === 'stopped') return <StateDot state="warning" />
  return <IconSparkle16 size={16} />
}

/** Render one generated image result as an inline thumbnail and original-image preview. */
export function ImageGenerateResult({ block, loadImage, inspect, t }: ImageGenerateResultProps) {
  const state = stateOf(block)
  const images = imagesOf(block)
  const caption = captionOf(block)
  return (
    <div className={css.root} data-tool="image_generate" data-state={state}>
      <div className={css.row}>
        <span className={css.leading}>{leading(state)}</span>
        <span className={css.title}>Generate image</span>
        <span className={css.separator} aria-hidden />
        <span className={css.summary}>{promptOf(block)}</span>
      </div>
      {images.length > 0 && (
        <div className={css.result}>
          <ImageGallery images={images} load={loadImage} align="start" labels={messageImageLabels(t)} />
          {caption !== null && <div className={css.caption}>{caption}</div>}
        </div>
      )}
      {images.length === 0 && caption !== null && (
        <div className={css.caption} data-error={state === 'error' || undefined}>{caption}</div>
      )}
      {inspect !== undefined && (
        <button type="button" className={css.inspectButton} onClick={inspect}>
          <IconInspectOutline12 />
          Inspect
        </button>
      )}
    </div>
  )
}
