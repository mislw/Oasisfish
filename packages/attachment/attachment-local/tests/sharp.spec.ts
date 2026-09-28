import { describe, expect, it, vi } from 'vitest'

const { loadSharp } = vi.hoisted(() => ({
  loadSharp: vi.fn(() => {
    throw new Error('Could not load the "sharp" module using the win32-x64 runtime')
  }),
}))

vi.mock('@deepseek-ai/dsh-lazy-require', () => ({
  createLazyRequire: () => loadSharp,
}))

import { requireSharp } from '../src/sharp.ts'

describe('Sharp runtime loading', () => {
  it('reports a missing native runtime as an attachment write failure', () => {
    expect(() => requireSharp()).toThrow(expect.objectContaining({
      code: 'ATTACHMENT_WRITE_FAILED',
      message: 'Image processing is unavailable.',
    }))
  })
})
