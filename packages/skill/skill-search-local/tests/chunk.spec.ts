import { describe, expect, it } from 'vitest'
import { chunkDocument } from '../src/chunk.ts'
import type { DiscoveredDocument } from '../src/corpus.ts'

function document(text: string): DiscoveredDocument {
  return {
    path: 'references/respawn.md',
    absolutePath: 'C:\\fixture\\references\\respawn.md',
    bytes: Buffer.byteLength(text),
    mtimeMs: 1,
    sha256: 'a'.repeat(64),
    text,
  }
}

describe('chunkDocument', () => {
  it('tracks Markdown heading hierarchy and one-based source lines', () => {
    const chunks = chunkDocument(document([
      '# 角色系统',
      '',
      '角色进入战场。',
      '',
      '## 复活',
      '',
      '角色可以在复活点重新进入战斗。',
      '',
    ].join('\n')), { targetCodePoints: 800, maxCodePoints: 1200, overlapCodePoints: 120 })

    expect(chunks).toEqual([
      expect.objectContaining({
        path: 'references/respawn.md',
        headings: ['角色系统'],
        startLine: 3,
        endLine: 3,
        text: '角色进入战场。',
      }),
      expect.objectContaining({
        path: 'references/respawn.md',
        headings: ['角色系统', '复活'],
        startLine: 7,
        endLine: 7,
        text: '角色可以在复活点重新进入战斗。',
      }),
    ])
    expect(new Set(chunks.map(chunk => chunk.id)).size).toBe(2)
  })

  it('carries bounded prose overlap only between chunks with the same headings', () => {
    const chunks = chunkDocument(document([
      '# 复活',
      '',
      '第一段文字',
      '',
      '第二段文字',
      '',
    ].join('\n')), { targetCodePoints: 8, maxCodePoints: 20, overlapCodePoints: 5 })

    expect(chunks.map(chunk => chunk.text)).toEqual([
      '第一段文字',
      '第一段文字\n\n第二段文字',
    ])
    expect(chunks[1]).toMatchObject({ startLine: 3, endLine: 5, headings: ['复活'] })
  })

  it('splits an oversized fenced block on original line boundaries', () => {
    const chunks = chunkDocument(document([
      '# API 示例',
      '',
      '```lua',
      'local first = "aaaaaaaaaaaa"',
      'local second = "bbbbbbbbbbbb"',
      '```',
      '',
    ].join('\n')), { targetCodePoints: 24, maxCodePoints: 32, overlapCodePoints: 4 })

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every(chunk => Array.from(chunk.text).length <= 32)).toBe(true)
    expect(chunks.every(chunk => chunk.headings.join(' > ') === 'API 示例')).toBe(true)
    expect(chunks.map(chunk => chunk.text).join('\n')).toBe([
      '```lua',
      'local first = "aaaaaaaaaaaa"',
      'local second = "bbbbbbbbbbbb"',
      '```',
    ].join('\n'))
    expect(chunks[0]).toMatchObject({ startLine: 3 })
    expect(chunks.at(-1)).toMatchObject({ endLine: 6 })
  })

  it('splits one oversized source line without changing its code points', () => {
    const line = `local payload = "${'界'.repeat(40)}"`
    const chunks = chunkDocument(document(`# 数据\n\n${line}\n`), {
      targetCodePoints: 24,
      maxCodePoints: 32,
      overlapCodePoints: 4,
    })

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every(chunk => chunk.startLine === 3 && chunk.endLine === 3)).toBe(true)
    expect(chunks.every(chunk => Array.from(chunk.text).length <= 32)).toBe(true)
    expect(chunks.map(chunk => chunk.text).join('')).toBe(line)
  })
})
