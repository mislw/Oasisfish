// @vitest-environment jsdom

import type { ComponentType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { AttachmentId, type ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { ImageGenerateResult } from '../src/client/ImageGenerateResult.tsx'

afterEach(cleanup)

const attachment: ImageAttachmentRef = {
  attachmentId: AttachmentId(`sha256:${'b'.repeat(64)}`),
  mediaType: 'image/png',
  bytes: 128,
  width: 1024,
  height: 768,
  name: 'generated.png',
}

const t = ((key: string, params?: Readonly<Record<string, unknown>>) => {
  const copy: Record<string, string> = {
    'image.label': '图片',
    'image.openOriginal': '查看原图',
    'image.loading': '图片加载中…',
    'image.loadFailed': '图片加载失败，点击重试',
    'image.preview': '原图预览',
    'image.closePreview': '关闭原图预览',
  }
  if (key === 'image.openOriginalLabel') {
    const label = params?.label
    return `${typeof label === 'string' ? label : ''}，点击查看原图`
  }
  return copy[key] ?? key
}) as TranslateNS<'conversation'>

const settled = (content: ToolResultNode['content']): ToolResultNode => ({
  kind: 'tool-result',
  seq: 4,
  time: 4_000,
  callId: 'image-1',
  call: { name: 'image_generate', argsRaw: '{"prompt":"A bright game item icon"}' },
  callTime: 3_000,
  content,
  isError: false,
  callView: null,
  resultView: null,
  subCalls: [],
})

type TestProps = {
  block: ToolResultNode
  loadImage: (image: ImageAttachmentRef) => Promise<string>
  t: TranslateNS<'conversation'>
  inspect?: () => void
  selectImage?: (image: ImageAttachmentRef, preference: string | undefined) => Promise<void>
}

const Component = ImageGenerateResult as ComponentType<TestProps>

describe('ImageGenerateResult', () => {
  it('renders the durable result as a clickable thumbnail instead of JSON', async () => {
    const loadImage = vi.fn().mockResolvedValue('blob:generated')
    const view = render(<Component
      block={settled([
        { type: 'text', text: 'Generated image with openai/gpt-image-1.' },
        { type: 'image', attachment },
      ])}
      loadImage={loadImage}
      t={t}
    />)

    await waitFor(() => { expect(view.getByAltText('generated.png')).toBeTruthy() })
    expect(view.getByText('A bright game item icon')).toBeTruthy()
    expect(view.queryByText(/attachmentId/)).toBeNull()
    const thumbnail = view.getByRole('button', { name: 'generated.png，点击查看原图' })
    fireEvent.click(thumbnail)
    expect(view.getByRole('dialog', { name: '原图预览' })).toBeTruthy()
  })

  it('retries attachment loading inside the generated-image result', async () => {
    const loadImage = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('blob:retried')
    const view = render(<Component
      block={settled([{ type: 'image', attachment }])}
      loadImage={loadImage}
      t={t}
    />)

    fireEvent.click(await view.findByRole('button', { name: '图片加载失败，点击重试' }))
    await waitFor(() => { expect(view.getByAltText('generated.png')).toBeTruthy() })
    expect(loadImage).toHaveBeenCalledTimes(2)
  })

  it('renders four candidates in a selectable grid with preview and download actions', async () => {
    const images = Array.from({ length: 4 }, (_, index) => ({
      ...attachment,
      attachmentId: AttachmentId(`sha256:${String(index + 1).repeat(64)}`),
      name: `candidate-${String(index + 1)}.png`,
    }))
    const loadImage = vi.fn(async (image: ImageAttachmentRef) => `blob:${image.name}`)
    const selectImage = vi.fn(() => Promise.resolve())
    const view = render(<Component
      block={{
        ...settled([
          { type: 'text', text: '已生成 4 个方案，请选择。' },
          ...images.map(image => ({ type: 'image' as const, attachment: image })),
        ]),
        call: {
          name: 'image_generate',
          argsRaw: JSON.stringify({
            prompt: 'A bright game item icon',
            variation_prompts: [
              'safe polished composition',
              'elevated camera and softer light',
              'bold asymmetrical structure and stronger material contrast',
              'experimental silhouette and dramatic lighting',
            ],
          }),
        },
      }}
      loadImage={loadImage}
      selectImage={selectImage}
      t={t}
    />)

    await waitFor(() => { expect(view.getAllByRole('img')).toHaveLength(4) })
    const grid = view.getByTestId('generated-image-grid')
    expect(grid.getAttribute('data-count')).toBe('4')
    fireEvent.click(view.getByRole('button', { name: 'candidate-1.png，点击查看原图' }))
    expect(view.getByRole('dialog', { name: '原图预览' })).toBeTruthy()
    expect(view.getAllByRole('link', { name: '下载图片' })).toHaveLength(4)
    fireEvent.click(view.getAllByRole('button', { name: '以此图继续修改' })[2]!)
    await waitFor(() => {
      expect(selectImage).toHaveBeenCalledWith(images[2], 'bold asymmetrical structure and stronger material contrast')
    })
  })

  it('keeps candidate directions aligned when an earlier candidate failed', async () => {
    const images = [1, 3, 4].map(index => ({
      ...attachment,
      attachmentId: AttachmentId(`sha256:${String(index).repeat(64)}`),
      name: `generated-${String(index)}.png`,
    }))
    const loadImage = vi.fn(async (image: ImageAttachmentRef) => `blob:${image.name}`)
    const selectImage = vi.fn(() => Promise.resolve())
    const view = render(<Component
      block={{
        ...settled([
          { type: 'text', text: '已生成 3 个方案，请选择。' },
          ...images.map(image => ({ type: 'image' as const, attachment: image })),
        ]),
        call: {
          name: 'image_generate',
          argsRaw: JSON.stringify({
            prompt: 'A bright game item icon',
            variation_prompts: [
              'safe polished composition',
              'elevated camera and softer light',
              'bold asymmetrical structure and stronger material contrast',
              'experimental silhouette and dramatic lighting',
            ],
          }),
        },
      }}
      loadImage={loadImage}
      selectImage={selectImage}
      t={t}
    />)

    await waitFor(() => { expect(view.getAllByRole('img')).toHaveLength(3) })
    fireEvent.click(view.getAllByRole('button', { name: '以此图继续修改' })[1]!)
    await waitFor(() => {
      expect(selectImage).toHaveBeenCalledWith(images[1], 'bold asymmetrical structure and stronger material contrast')
    })
  })

  it('does not invent a preference for a legacy result without a candidate ordinal', async () => {
    const loadImage = vi.fn().mockResolvedValue('blob:generated')
    const selectImage = vi.fn(() => Promise.resolve())
    const view = render(<Component
      block={settled([{ type: 'image', attachment }])}
      loadImage={loadImage}
      selectImage={selectImage}
      t={t}
    />)

    await waitFor(() => { expect(view.getByAltText('generated.png')).toBeTruthy() })
    fireEvent.click(view.getByRole('button', { name: '以此图继续修改' }))
    await waitFor(() => { expect(selectImage).toHaveBeenCalledWith(attachment, undefined) })
  })
})
