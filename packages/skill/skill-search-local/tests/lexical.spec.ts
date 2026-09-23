import { describe, expect, it } from 'vitest'
import { lexicalTokenStream } from '../src/lexical.ts'

describe('lexicalTokenStream', () => {
  it('emits lower-case Latin tokens plus CJK unigrams and bigrams', () => {
    expect(lexicalTokenStream('角色 Respawn 复活！')).toBe('角 色 角色 respawn 复 活 复活')
  })

  it('returns no tokens for text without searchable letters or numbers', () => {
    expect(lexicalTokenStream(' -- !!! ')).toBe('')
  })

  it('flushes each CJK run around normalized Latin words', () => {
    expect(lexicalTokenStream('ＡＢＣ中文 DEF 한국어')).toBe('abc 中 文 中文 def 한 국 어 한국 국어')
  })
})
