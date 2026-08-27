/** Model-facing local Skill corpus search tool. @module @deepseek-ai/dsh-tool-skill-search */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type SearchResultView, type ToolResult } from '@deepseek-ai/dsh-tools'
import { SkillSearchError } from '@deepseek-ai/dsh-skill-search'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-skill-search'
/** Tool registry and provider-neutral Skill search service required by this Consumer. */
export const inject = ['tools', 'skillSearch']

interface SearchMetaHit {
  path: string
  startLine: number
  excerpt: string
}

interface SearchMeta {
  hits: SearchMetaHit[]
}

function searchMeta(value: unknown): SearchMeta | undefined {
  if (typeof value !== 'object' || value === null || !('hits' in value) || !Array.isArray(value.hits)) return undefined
  const hits: SearchMetaHit[] = []
  for (const entry of value.hits) {
    if (typeof entry !== 'object' || entry === null) return undefined
    const hit = entry as Record<string, unknown>
    if (typeof hit.path !== 'string' || !Number.isSafeInteger(hit.startLine) || typeof hit.excerpt !== 'string') return undefined
    hits.push({ path: hit.path, startLine: hit.startLine as number, excerpt: hit.excerpt })
  }
  return { hits }
}

function renderResult(value: {
  skill: string
  query: string
  count: number
  hits: Array<{ rank: number; score: number; path: string; headings: string[]; startLine: number; endLine: number; excerpt: string }>
}): string {
  if (value.hits.length === 0) {
    return `No passages found in Skill "${value.skill}" for this query. Try a narrower or synonymous query.`
  }
  return value.hits.map((hit) => {
    const heading = hit.headings.length === 0 ? '' : `\nHeadings: ${hit.headings.join(' > ')}`
    return `${hit.rank}. ${hit.path}:${hit.startLine}-${hit.endLine}${heading}\n${hit.excerpt}`
  }).join('\n\n')
}

/**
 * Register `skill_search` in the calling agent scope.
 * @param ctx - Cordis context carrying tools and Skill search.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'skill_search',
    description: 'Search the declared local knowledge corpus for a loaded Skill. Use this for factual or API questions after loading the Skill, then cite the returned relative path and line range.',
    parameters: {
      name: { type: 'string', required: true, description: 'Exact loaded Skill name.' },
      query: { type: 'string', required: true, description: 'Natural-language question, API name, or exact symbol to find.' },
      limit: { type: 'integer', description: 'Maximum passages to return, from 1 through 10. Defaults to 5.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          skill: { type: 'string', required: true },
          query: { type: 'string', required: true },
          count: { type: 'integer', required: true },
          hits: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                rank: { type: 'integer', required: true },
                score: { type: 'number', required: true },
                path: { type: 'string', required: true },
                headings: { type: 'array', required: true, items: { type: 'string' } },
                startLine: { type: 'integer', required: true },
                endLine: { type: 'integer', required: true },
                excerpt: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderResult(value) }],
      presentationMeta: (_args, value) => ({
        hits: value.hits.map(hit => ({ path: hit.path, startLine: hit.startLine, excerpt: hit.excerpt })),
      }),
    },
    async execute(args, exec) {
      const limit = args.limit ?? 5
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) throw new Error('skill_search limit must be between 1 and 10')
      if (args.name.trim() === '') throw new Error('skill_search name must be non-empty')
      if (args.query.trim() === '') throw new Error('skill_search query must be non-empty')
      try {
        const agent = exec.agent
        const result = await ctx.skillSearch.search({ name: args.name, query: args.query, limit }, {
          signal: exec.signal,
          ...agent === undefined ? {} : { cwd: agent.session.header.cwd, scope: agent },
        })
        return {
          skill: result.skill,
          query: result.query,
          count: result.hits.length,
          hits: result.hits.map(hit => ({
            rank: hit.rank,
            score: hit.score,
            path: hit.path,
            headings: [...hit.headings],
            startLine: hit.startLine,
            endLine: hit.endLine,
            excerpt: hit.excerpt,
          })),
        }
      } catch (error) {
        if (error instanceof SkillSearchError) throw new Error(`[${error.code}] ${error.message}`, { cause: error })
        throw error
      }
    },
    presentCall(args) {
      return { card: 'generic', title: `Search ${args.name}`, kind: 'search', rawInput: args.query }
    },
    presentResult(args, result: ToolResult): SearchResultView | undefined {
      if (result.isError) return undefined
      const meta = searchMeta(result.meta)
      if (meta === undefined) return undefined
      const files = new Map<string, Array<{ lineNumber: number; line: string }>>()
      for (const hit of meta.hits) {
        const matches = files.get(hit.path) ?? []
        matches.push({ lineNumber: hit.startLine, line: hit.excerpt })
        files.set(hit.path, matches)
      }
      return {
        card: 'search',
        shape: 'matches',
        title: `Search ${args.name}`,
        files: [...files].map(([path, matches]) => ({ path, matches })),
        truncated: false,
        total: meta.hits.length,
      }
    },
  }))
}
