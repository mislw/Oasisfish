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
  lineNumbers: number[]
  overlapEligible: boolean
}

function codePoints(text: string): number {
  return Array.from(text).length
}

function sourceLines(text: string): string[] {
  return text.split(/\r?\n/u)
}

function headingText(node: Extract<RootContent, { type: 'heading' }>): string {
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
    const position = node.position as NonNullable<typeof node.position>
    const startLine = position.start.line
    const endLine = position.end.line
    const text = lines.slice(startLine - 1, endLine).join('\n').trim()
    blocks.push({
      headings: headings.filter(Boolean),
      startLine,
      endLine,
      text,
      lineNumbers: Array.from({ length: endLine - startLine + 1 }, (_, index) => startLine + index),
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
    const startIndex = start
    const text = lines.slice(startIndex, index).join('\n').trim()
    blocks.push({
      headings: [],
      startLine: startIndex + 1,
      endLine: index,
      text,
      lineNumbers: Array.from({ length: index - startIndex }, (_, offset) => startIndex + offset + 1),
      overlapEligible: true,
    })
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
  let pendingLineNumbers: number[] = []

  const flush = (): void => {
    if (pending.length === 0) return
    const startLine = pendingLineNumbers[0] as number
    const endLine = pendingLineNumbers.at(-1) as number
    split.push({
      headings: [...block.headings],
      startLine,
      endLine,
      text: pending.join('\n'),
      lineNumbers: [...pendingLineNumbers],
      overlapEligible: block.overlapEligible,
    })
    pending = []
    pendingLineNumbers = []
  }

  lines.forEach((line, index) => {
    const lineNumber = block.lineNumbers[index] as number
    if (codePoints(line) > maxCodePoints) {
      flush()
      const points = Array.from(line)
      for (let offset = 0; offset < points.length; offset += maxCodePoints) {
        split.push({
          headings: [...block.headings],
          startLine: lineNumber,
          endLine: lineNumber,
          text: points.slice(offset, offset + maxCodePoints).join(''),
          lineNumbers: [lineNumber],
          overlapEligible: false,
        })
      }
      return
    }
    const candidate = pending.length === 0 ? line : `${pending.join('\n')}\n${line}`
    if (pending.length > 0 && codePoints(candidate) > maxCodePoints) {
      flush()
    }
    pending.push(line)
    pendingLineNumbers.push(lineNumber)
  })
  flush()
  return split
}

function overlapTail(block: SourceBlock, length: number): SourceBlock | undefined {
  if (length === 0) return undefined
  const points = Array.from(block.text)
  const start = Math.max(0, points.length - length)
  const prefix = points.slice(0, start).join('')
  let text = points.slice(start).join('')
  let lineIndex = prefix.split('\n').length - 1
  while (text.startsWith('\n')) {
    text = text.slice(1)
    lineIndex += 1
  }
  const lineNumbers = block.lineNumbers.slice(lineIndex)
  const startLine = lineNumbers[0] as number
  return {
    headings: [...block.headings],
    startLine,
    endLine: block.endLine,
    text,
    lineNumbers,
    overlapEligible: true,
  }
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
      const combined = pending === undefined ? block.text : `${pending.text}\n\n${block.text}`
      if (pending === undefined
        || pending.headings.length !== block.headings.length
        || !pending.headings.every((heading, index) => heading === block.headings[index])) {
        flush()
      } else if (codePoints(combined) > options.targetCodePoints) {
        const previous = pending
        flush()
        if (previous.overlapEligible && block.overlapEligible && options.overlapCodePoints > 0) {
          const available = Math.max(0, options.maxCodePoints - codePoints(block.text) - 2)
          const overlapLength = Math.min(options.overlapCodePoints, available)
          const overlap = overlapTail(previous, overlapLength)
          if (overlap !== undefined) {
            pending = {
              headings: [...block.headings],
              startLine: overlap.startLine,
              endLine: block.endLine,
              text: `${overlap.text}\n\n${block.text}`,
              lineNumbers: [...overlap.lineNumbers, block.startLine, ...block.lineNumbers],
              overlapEligible: true,
            }
            continue
          }
        }
      }
      if (pending === undefined) {
        pending = { ...block, headings: [...block.headings], lineNumbers: [...block.lineNumbers] }
      } else {
        pending.text = combined
        pending.endLine = block.endLine
        pending.lineNumbers = [...pending.lineNumbers, block.startLine, ...block.lineNumbers]
      }
    }
  }
  flush()
  return chunks
}
