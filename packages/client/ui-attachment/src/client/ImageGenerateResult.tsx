import { useCallback, useEffect, useState } from 'react'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import {
  IconDownloadOutline16, IconEditOutline16, IconInspectOutline12, IconSparkle16, StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ImageLightbox } from '../ImageLightbox.tsx'
import css from './ImageGenerateResult.module.css'

/** Session-authorized attachment loader supplied by this plugin's slot registration. */
export interface ImageGenerateResultInjected {
  /** Resolve one durable result attachment inside the owning session. */
  loadImage: (attachment: ImageAttachmentRef) => Promise<string>
  /** Add one generated candidate to the current composer without submitting it. */
  selectImage: (attachment: ImageAttachmentRef) => Promise<void>
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

function CandidateImage({ attachment, loadImage, selectImage, t }: {
  attachment: ImageAttachmentRef
  loadImage: (attachment: ImageAttachmentRef) => Promise<string>
  selectImage: (attachment: ImageAttachmentRef) => Promise<void>
  t: ImageGenerateResultProps['t']
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    setFailed(false)
    setSrc(null)
    void loadImage(attachment).then((url) => { if (live) setSrc(url) }).catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [attachment, loadImage, attempt])
  const retry = useCallback(() => { setAttempt(value => value + 1) }, [])
  const label = attachment.name ?? t('image.label')
  if (failed) {
    return <button type="button" className={css.candidateError} onClick={retry}>{t('image.loadFailed')}</button>
  }
  return (
    <div className={css.candidate}>
      <button
        type="button"
        className={css.preview}
        title={t('image.openOriginal')}
        aria-label={t('image.openOriginalLabel', { label })}
        onClick={() => { if (src !== null) setOpen(true) }}
      >
        {src === null ? <span>{t('image.loading')}</span> : <img src={src} alt={label} />}
      </button>
      <div className={css.candidateActions}>
        <button type="button" onClick={() => { void selectImage(attachment) }}>
          <IconEditOutline16 />
          以此图继续修改
        </button>
        {src !== null && (
          <a href={src} download={label} aria-label="下载图片" title="下载图片">
            <IconDownloadOutline16 />
          </a>
        )}
      </div>
      {open && src !== null && (
        <ImageLightbox
          src={src}
          alt={label}
          labels={{ dialog: t('image.preview'), close: t('image.closePreview') }}
          onClose={() => { setOpen(false) }}
        />
      )}
    </div>
  )
}

/** Render one generated image result as an inline thumbnail and original-image preview. */
export function ImageGenerateResult({ block, loadImage, selectImage, inspect, t }: ImageGenerateResultProps) {
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
          <div className={css.candidateGrid} data-testid="generated-image-grid" data-count={images.length}>
            {images.map((image, index) => (
              <CandidateImage
                key={`${image.attachment.attachmentId}:${String(index)}`}
                attachment={image.attachment}
                loadImage={loadImage}
                selectImage={selectImage}
                t={t}
              />
            ))}
          </div>
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
