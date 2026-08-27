/** CJK-aware lexical token preparation for SQLite FTS. */

const WORD_OR_CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{Letter}\p{Number}_]+/gu
const CJK = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u

/**
 * Convert source or query text into Latin words plus CJK unigrams and bigrams.
 * @param text - Original source or query text.
 * @returns space-delimited normalized tokens for FTS5.
 */
export function lexicalTokenStream(text: string): string {
  const pieces = text.normalize('NFKC').toLocaleLowerCase('und').match(WORD_OR_CJK) ?? []
  const tokens: string[] = []
  let cjkRun: string[] = []

  const flushCjk = (): void => {
    if (cjkRun.length === 0) return
    tokens.push(...cjkRun)
    for (let index = 0; index + 1 < cjkRun.length; index += 1) {
      tokens.push(`${cjkRun[index]}${cjkRun[index + 1]}`)
    }
    cjkRun = []
  }

  for (const piece of pieces) {
    if (CJK.test(piece)) {
      cjkRun.push(piece)
    } else {
      flushCjk()
      tokens.push(piece)
    }
  }
  flushCjk()
  return tokens.join(' ')
}
