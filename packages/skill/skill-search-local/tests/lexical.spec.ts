import { describe, expect, it } from 'vitest'
import { lexicalTokenStream } from '../src/lexical.ts'

describe('lexicalTokenStream', () => {
  it('emits lower-case Latin tokens plus CJK unigrams and bigrams', () => {
    expect(lexicalTokenStream('角色 Respawn 复活！')).toBe('角 色 角色 respawn 复 活 复活')
  })
})
