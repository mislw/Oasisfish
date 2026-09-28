/** Process-realm lazy access to Sharp's CommonJS-compatible entry. */

import type sharp from 'sharp'
import { AttachmentError } from '@deepseek-ai/dsh-attachment'
import { createLazyRequire } from '@deepseek-ai/dsh-lazy-require'

/** Load Sharp on the first raster operation and retain its callable export. */
const loadSharp = createLazyRequire<typeof sharp>('sharp', import.meta.url)

/**
 * Load the native image implementation.
 * @returns Sharp's callable export.
 * @throws an AttachmentError when the native runtime cannot load.
 */
export function requireSharp(): typeof sharp {
  try {
    return loadSharp()
  } catch (error) {
    if (error instanceof AttachmentError) throw error
    throw new AttachmentError('Image processing is unavailable.', 'ATTACHMENT_WRITE_FAILED', { cause: error })
  }
}
