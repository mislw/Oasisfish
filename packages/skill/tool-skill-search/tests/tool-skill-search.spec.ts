import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SkillSearchRegistry, { SkillSearchError, SkillSearchProviderName } from '@deepseek-ai/dsh-skill-search'
import * as toolSkillSearch from '../src/index.ts'

const signal = new AbortController().signal

async function setup(hits = [{
  skill: 'fixture-skill',
  rank: 1,
  score: 0.75,
  path: 'references/respawn.md',
  headings: ['角色', '复活'],
  startLine: 10,
  endLine: 12,
  excerpt: '角色可以在复活点重新进入战斗。',
}], failure?: SkillSearchError) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(SkillSearchRegistry, { corpora: [{
    skill: 'fixture-skill', roots: ['references'], extensions: ['.md'],
    maxFileBytes: 1024, maxCorpusBytes: 4096, maxChunks: 100,
  }] })
  ctx.skills.register({
    name: 'fixture-skill', description: 'Fixture', source: 'test', content: 'body',
    resourceBase: { kind: 'directory', path: 'C:\\absolute\\fixture-skill' },
  })
  let receivedLimit: number | undefined
  ctx.skillSearch.registerProvider(SkillSearchProviderName('fixture'), {
    supports: () => true,
    async search(corpus, request) {
      if (failure !== undefined) throw failure
      receivedLimit = request.limit
      return { skill: corpus.skill.name, query: request.query, hits }
    },
  })
  await ctx.plugin(toolSkillSearch)
  return { ctx, receivedLimit: () => receivedLimit }
}

describe('tool-skill-search', () => {
  it('registers an exact schema, defaults to five results, and renders relative citations', async () => {
    const { ctx, receivedLimit } = await setup()
    const schema = ctx.tools.schemas().find(item => item.name === 'skill_search')
    expect(schema?.description).toBe('Search the declared Skill corpus for a loaded Skill. Use this for factual or API questions after loading the Skill, then cite the returned relative path and line range.')
    expect(schema?.parameters).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact loaded Skill name.' },
        query: { type: 'string', description: 'Natural-language question, API name, or exact symbol to find.' },
        limit: { type: 'integer', description: 'Maximum passages to return, from 1 through 10. Defaults to 5.' },
      },
      required: ['name', 'query'],
    })

    const result = await ctx.tools.execute({
      signal,
      callId: ToolCallId('skill-search-1'),
      name: 'skill_search',
      arguments: { name: 'fixture-skill', query: '角色复活' },
    })
    expect(result.isError).toBe(false)
    expect(receivedLimit()).toBe(5)
    expect(result.content).toHaveLength(1)
    const content = result.content[0]
    expect(content?.type).toBe('text')
    if (content?.type !== 'text') throw new Error('skill_search result must contain text')
    expect(content.text).toContain('references/respawn.md:10-12')
    expect(JSON.stringify(result)).not.toContain('C:\\absolute')
    expect(ctx.tools.get('skill_search')?.presentCall?.({ name: 'fixture-skill', query: '角色复活' })).toEqual({
      card: 'generic', title: 'Search fixture-skill', kind: 'search', rawInput: '角色复活',
    })
    expect(ctx.tools.get('skill_search')?.presentResult?.({ name: 'fixture-skill', query: '角色复活' }, result)).toEqual({
      card: 'search',
      shape: 'matches',
      title: 'Search fixture-skill',
      files: [{ path: 'references/respawn.md', matches: [{ lineNumber: 10, line: '角色可以在复活点重新进入战斗。' }] }],
      truncated: false,
      total: 1,
    })
  })

  it('rejects limits outside 1 through 10 and renders successful empty guidance', async () => {
    const { ctx } = await setup([])
    for (const limit of [0, 11]) {
      const result = await ctx.tools.execute({
        signal,
        callId: ToolCallId(`skill-search-${limit}`),
        name: 'skill_search',
        arguments: { name: 'fixture-skill', query: '不存在', limit },
      })
      expect(result.isError).toBe(true)
    }
    const empty = await ctx.tools.execute({
      signal,
      callId: ToolCallId('skill-search-empty'),
      name: 'skill_search',
      arguments: { name: 'fixture-skill', query: '不存在', limit: 5 },
    })
    expect(empty.isError).toBe(false)
    const emptyContent = empty.content[0]
    expect(emptyContent?.type).toBe('text')
    if (emptyContent?.type !== 'text') throw new Error('empty skill_search result must contain text')
    expect(emptyContent.text).toContain('narrower or synonymous query')
  })

  it('preserves structured Skill search error codes in tool diagnostics', async () => {
    const { ctx } = await setup(undefined, new SkillSearchError('MODEL_UNAVAILABLE', 'Local embedding model is unavailable.'))
    const result = await ctx.tools.execute({
      signal,
      callId: ToolCallId('skill-search-error'),
      name: 'skill_search',
      arguments: { name: 'fixture-skill', query: '复活' },
    })
    expect(result.isError).toBe(true)
    expect(result).toMatchObject({
      error: {
        message: 'Local embedding model is unavailable.',
        info: { name: 'SkillSearchError', code: 'MODEL_UNAVAILABLE' },
      },
    })
    const errorContent = result.content[0]
    expect(errorContent?.type).toBe('text')
    if (errorContent?.type !== 'text') throw new Error('failed skill_search result must contain text')
    expect(errorContent.text).toBe('Error: Local embedding model is unavailable.')
  })

  it('rejects non-integer limits and blank names or queries', async () => {
    const { ctx } = await setup()
    for (const arguments_ of [
      { name: 'fixture-skill', query: '复活', limit: 1.5 },
      { name: ' ', query: '复活' },
      { name: 'fixture-skill', query: ' ' },
    ]) {
      const result = await ctx.tools.execute({
        signal,
        callId: ToolCallId(`skill-search-invalid-${JSON.stringify(arguments_)}`),
        name: 'skill_search',
        arguments: arguments_,
      })
      expect(result.isError).toBe(true)
    }
  })

  it('forwards agent cwd and scope while rendering hits without headings', async () => {
    const { ctx } = await setup([{
      skill: 'fixture-skill',
      rank: 1,
      score: 0.5,
      path: 'references/plain.txt',
      headings: [],
      startLine: 2,
      endLine: 2,
      excerpt: 'Plain passage.',
    }])
    const result = await ctx.tools.execute({
      signal,
      callId: ToolCallId('skill-search-agent'),
      name: 'skill_search',
      arguments: { name: 'fixture-skill', query: 'plain', limit: 1 },
      agent: { session: { header: { cwd: 'C:\\workspace' } } } as never,
    })

    expect(result.isError).toBe(false)
    expect(result.content).toEqual([{ type: 'text', text: '1. references/plain.txt:2-2\nPlain passage.' }])
  })

  it('rejects malformed presentation metadata without throwing', async () => {
    const { ctx } = await setup()
    const tool = ctx.tools.get('skill_search')
    if (tool === undefined) throw new Error('skill_search must be registered')
    const args = { name: 'fixture-skill', query: '复活' }
    expect(tool.presentResult?.(args, { content: [], isError: true })).toBeUndefined()
    for (const meta of [
      undefined,
      null,
      {},
      { hits: 'invalid' },
      { hits: [null] },
      { hits: [{}] },
      { hits: [{ path: 'a.md', startLine: 1.5, excerpt: 'x' }] },
      { hits: [{ path: 'a.md', startLine: 1, excerpt: 1 }] },
    ]) {
      expect(tool.presentResult?.(args, { content: [], isError: false, meta } as never)).toBeUndefined()
    }
  })

  it('groups presentation matches from the same source file', async () => {
    const { ctx } = await setup()
    const tool = ctx.tools.get('skill_search')
    const result = tool?.presentResult?.({ name: 'fixture-skill', query: '复活' }, {
      content: [],
      isError: false,
      meta: {
        hits: [
          { path: 'a.md', startLine: 1, excerpt: 'first' },
          { path: 'a.md', startLine: 2, excerpt: 'second' },
        ],
      },
    })

    expect(result).toMatchObject({
      files: [{ path: 'a.md', matches: [{ lineNumber: 1 }, { lineNumber: 2 }] }],
      total: 2,
    })
  })
})
