/** Heading-aware Markdown and plain-text chunking. */

import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import type { RootContent } from 'mdast'
import type { DiscoveredDocument } from './corpus.ts'

/** Chunk-size controls expressed in Unicode code points. */
export interface ChunkOptions {
  readonly targetCodePoints: number
  readonly maxCodePoints: number
  readonly overlapCodePoints: number
}

/** One line-aware source passage ready for lexical and semantic indexing. */
export interface SourceChunk {
  readonly id: string
  readonly path: string
  readonly headings: readonly string[]
  readonly startLine: number
  readonly endLine: number
  readonly text: string
  readonly contentSha256: string
}

interface SourceBlock {
  headings: string[]
  startLine: number
  endLine: number
  text: string
  overlapEligible: boolean
}

function codePoints(text: string): number {
  return Array.from(text).length
}

function sourceLines(text: string): string[] {
  return text.split(/\r?\n/u)
}

function headingText(node: RootContent): string {
  if (node.type !== 'heading') return ''
  return node.children.map(child => 'value' in child ? child.value : '').join('').trim()
}

function markdownBlocks(document: DiscoveredDocument): SourceBlock[] {
  const tree = fromMarkdown(document.text, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  })
  const lines = sourceLines(document.text)
  const headings: string[] = []
  const blocks: SourceBlock[] = []
  for (const node of tree.children) {
    if (node.type === 'heading') {
      headings.length = node.depth - 1
      headings[node.depth - 1] = headingText(node)
      continue
    }
    const startLine = node.position?.start.line
    const endLine = node.position?.end.line
    if (startLine === undefined || endLine === undefined) continue
    const text = lines.slice(startLine - 1, endLine).join('\n').trim()
    if (text === '') continue
    blocks.push({
      headings: headings.filter(Boolean),
      startLine,
      endLine,
      text,
      overlapEligible: node.type !== 'code',
    })
  }
  return blocks
}

function textBlocks(document: DiscoveredDocument): SourceBlock[] {
  const lines = sourceLines(document.text)
  const blocks: SourceBlock[] = []
  let start: number | undefined
  for (let index = 0; index <= lines.length; index += 1) {
    const line = lines[index]
    if (line !== undefined && line.trim() !== '') {
      start ??= index
      continue
    }
    if (start === undefined) continue
    const text = lines.slice(start, index).join('\n').trim()
    blocks.push({ headings: [], startLine: start + 1, endLine: index, text, overlapEligible: true })
    start = undefined
  }
  return blocks
}

function materialize(document: DiscoveredDocument, block: SourceBlock): SourceChunk {
  const contentSha256 = createHash('sha256').update(block.text).digest('hex')
  const id = createHash('sha256')
    .update(`${document.path}\0${block.startLine}\0${block.endLine}\0${contentSha256}`)
    .digest('hex')
  return {
    id,
    path: document.path,
    headings: block.headings,
    startLine: block.startLine,
    endLine: block.endLine,
    text: block.text,
    contentSha256,
  }
}

function splitOversizedBlock(block: SourceBlock, maxCodePoints: number): SourceBlock[] {
  if (codePoints(block.text) <= maxCodePoints) return [block]
  const lines = block.text.split('\n')
  const split: SourceBlock[] = []
  let pending: string[] = []
  let pendingStart = block.startLine

  const flush = (endLine: number): void => {
    if (pending.length === 0) return
    split.push({
      headings: [...block.headings],
      startLine: pendingStart,
      endLine,
      text: pending.join('\n'),
      overlapEligible: block.overlapEligible,
    })
    pending = []
  }

  lines.forEach((line, index) => {
    const lineNumber = block.startLine + index
    if (codePoints(line) > maxCodePoints) {
      flush(lineNumber - 1)
      const points = Array.from(line)
      for (let offset = 0; offset < points.length; offset += maxCodePoints) {
        split.push({
          headings: [...block.headings],
          startLine: lineNumber,
          endLine: lineNumber,
          text: points.slice(offset, offset + maxCodePoints).join(''),
          overlapEligible: false,
        })
      }
      pendingStart = lineNumber + 1
      return
    }
    const candidate = pending.length === 0 ? line : `${pending.join('\n')}\n${line}`
    if (pending.length > 0 && codePoints(candidate) > maxCodePoints) {
      flush(lineNumber - 1)
      pendingStart = lineNumber
    }
    pending.push(line)
  })
  flush(block.endLine)
  return split
}

/**
 * Divide one Markdown or text document into heading-consistent source chunks.
 * @param document - Decoded source document.
 * @param options - Target, maximum, and overlap code-point limits.
 * @returns stable line-aware chunks.
 */
export function chunkDocument(document: DiscoveredDocument, options: ChunkOptions): SourceChunk[] {
  if (options.targetCodePoints <= 0 || options.maxCodePoints < options.targetCodePoints) {
    throw new Error('chunk target/max code-point limits are invalid')
  }
  if (options.overlapCodePoints < 0 || options.overlapCodePoints >= options.targetCodePoints) {
    throw new Error('chunk overlap must be non-negative and smaller than the target')
  }
  const blocks = extname(document.path).toLocaleLowerCase('und') === '.md'
    ? markdownBlocks(document)
    : textBlocks(document)
  const chunks: SourceChunk[] = []
  let pending: SourceBlock | undefined

  const flush = (): void => {
    if (pending === undefined) return
    chunks.push(materialize(document, pending))
    pending = undefined
  }

  for (const sourceBlock of blocks) {
    for (const block of splitOversizedBlock(sourceBlock, options.maxCodePoints)) {
      const sameHeading = pending !== undefined
        && pending.headings.length === block.headings.length
        && pending.headings.every((heading, index) => heading === block.headings[index])
      const combined = pending === undefined ? block.text : `${pending.text}\n\n${block.text}`
      if (!sameHeading) {
        flush()
      } else if (codePoints(combined) > options.targetCodePoints) {
        const previous = pending
        flush()
        if (previous !== undefined && previous.overlapEligible && block.overlapEligible && options.overlapCodePoints > 0) {
          const available = Math.max(0, options.maxCodePoints - codePoints(block.text) - 2)
          const overlapLength = Math.min(options.overlapCodePoints, available)
          const overlap = Array.from(previous.text).slice(-overlapLength).join('')
          if (overlap !== '') {
            pending = {
              headings: [...block.headings],
              startLine: previous.endLine,
              endLine: block.endLine,
              text: `${overlap}\n\n${block.text}`,
              overlapEligible: true,
            }
            continue
          }
        }
      }
      if (pending === undefined) {
        pending = { ...block, headings: [...block.headings] }
      } else {
        pending.text = combined
        pending.endLine = block.endLine
      }
    }
  }
  flush()
  return chunks
}
