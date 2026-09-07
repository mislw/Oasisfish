import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'
import { Context } from '@deepseek-ai/cordis'
import { agentEvents, Inbox, type Agent } from '@deepseek-ai/dsh-agent'
import { CallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { boot, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { SessionId } from '@deepseek-ai/dsh-session'
import { DeterministicFixtureEmbedder, LocalSkillSearchProvider, openSkillSearchStore } from '@deepseek-ai/dsh-skill-search-local'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-tools'

const overlayPath = process.argv[2]
if (overlayPath === undefined) throw new Error('desktop Oasis Wiki snapshot requires an overlay path')
const rootConfigPath = fileURLToPath(new URL('../../../../../packages/bundle/base/tests/fixtures/root.cordis.yml', import.meta.url))
const basePatchPath = fileURLToPath(new URL('../../../../../packages/bundle/base/cordis.patch.yml', import.meta.url))
const ctx = await boot('desktop-oasis-wiki-snapshot', rootConfigPath, [
  ...loadOverlayPatches('desktop-oasis-wiki-snapshot', basePatchPath),
  ...loadOverlayPatches('desktop-oasis-wiki-snapshot', overlayPath),
])
const cacheRoot = await mkdtemp(join(tmpdir(), 'desktop-oasis-wiki-rag-'))
const store = await openSkillSearchStore(join(cacheRoot, 'skill-search.sqlite'))
const searchProvider = new LocalSkillSearchProvider(store, new DeterministicFixtureEmbedder(32), {
  providerName: 'snapshot-local',
  chunkTargetCodePoints: 800,
  chunkMaxCodePoints: 1200,
  chunkOverlapCodePoints: 120,
  lexicalCandidates: 50,
  vectorCandidates: 50,
  rrfK: 60,
  headingBoost: 0.1,
  pathBoost: 0.05,
  mmrLambda: 0.6,
  defaultResultCount: 5,
  maxResultCount: 10,
})
ctx.skillSearch.registerProvider(() => searchProvider)

function loadedSkill(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('desktop Oasis Wiki snapshot received an invalid skill tool result')
  }
  const record = value as Record<string, unknown>
  if (typeof record.name !== 'string'
    || typeof record.provider !== 'string'
    || typeof record.content !== 'string') {
    throw new TypeError('desktop Oasis Wiki snapshot received an invalid skill tool result')
  }
  return {
    name: record.name,
    provider: record.provider,
    resourceBase: record.resourceBase,
    firstHeading: record.content.split(/\r?\n/, 1)[0],
  }
}

try {
  const agentId = SessionId('desktop-oasis-wiki-snapshot')
  const session = ctx.sessions.create(agentId, { meta: { cwd: process.cwd() } })
  const agent: Agent = {
    ctx: new Context(),
    id: agentId,
    options: {},
    session,
    inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'idle',
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject: () => { throw new Error('desktop Oasis Wiki snapshot must receive the catalog at the step boundary') },
    cancel: () => {},
    runMaintenance: job => job(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  const decision = await agentEvents(ctx, agent).waterfall(
    'agent/pre-step',
    { messages: [], turn: 1, step: 1, signal: new AbortController().signal },
    () => Promise.resolve({ kind: 'enter' as const, messages: [] }),
  )
  const catalog = decision.kind === 'enter'
    ? decision.messages.find(message => message.role === 'user'
      && message.source.kind === 'skill-catalog')?.content
    : undefined
  const summaries = await ctx.skills.list()
  const summary = summaries.find(skill => skill.name === 'oasis-wiki')
  const imagePromptSummary = summaries.find(skill => skill.name === 'ai-image-prompts')
  const result = await ctx.tools.execute({
    callId: CallId('desktop-oasis-wiki-snapshot'),
    name: 'skill',
    arguments: { name: 'oasis-wiki' },
    signal: new AbortController().signal,
  })
  const value = result.isError ? undefined : result.value
  const imagePromptResult = await ctx.tools.execute({
    callId: CallId('desktop-image-prompts-snapshot'),
    name: 'skill',
    arguments: { name: 'ai-image-prompts' },
    signal: new AbortController().signal,
  })
  const imagePromptValue = imagePromptResult.isError ? undefined : imagePromptResult.value
  const searchArgs = { name: 'oasis-wiki', query: 'UGCAskQ DataTable', limit: 1 }
  const searchCallId = CallId('desktop-oasis-wiki-search')
  const call = session.append('tool/call', {
    turn: 1,
    step: 1,
    callId: searchCallId,
    name: 'skill_search',
    arguments: JSON.stringify(searchArgs),
  })
  const search = await ctx.tools.execute({
    callId: searchCallId,
    name: 'skill_search',
    arguments: searchArgs,
    agent,
    signal: new AbortController().signal,
  })
  session.append('tool/result', {
    turn: 1,
    step: 1,
    message: createToolResultMessage({ callId: searchCallId, content: search.content, isError: search.isError }),
    ...search.error?.info === undefined ? {} : { error: search.error.info },
    ...search.meta === undefined ? {} : { meta: search.meta },
  }, { surfaceOp: 'append', sourceEventSeqs: [call.seq] })
  const imageSearchArgs = {
    name: 'ai-image-prompts',
    query: 'Game Item Icon unmistakable silhouette thumbnail size',
    limit: 5,
  }
  const imageSearchCallId = CallId('desktop-image-prompts-search')
  const imageCall = session.append('tool/call', {
    turn: 1,
    step: 1,
    callId: imageSearchCallId,
    name: 'skill_search',
    arguments: JSON.stringify(imageSearchArgs),
  })
  const imageSearch = await ctx.tools.execute({
    callId: imageSearchCallId,
    name: 'skill_search',
    arguments: imageSearchArgs,
    agent,
    signal: new AbortController().signal,
  })
  session.append('tool/result', {
    turn: 1,
    step: 1,
    message: createToolResultMessage({
      callId: imageSearchCallId,
      content: imageSearch.content,
      isError: imageSearch.isError,
    }),
    ...imageSearch.error?.info === undefined ? {} : { error: imageSearch.error.info },
    ...imageSearch.meta === undefined ? {} : { meta: imageSearch.meta },
  }, { surfaceOp: 'append', sourceEventSeqs: [imageCall.seq] })
  const catalogText = Array.isArray(catalog)
    ? catalog.map(part => part.type === 'text' ? part.text : '').join('\n')
    : catalog ?? ''
  const transcript: Record<string, unknown>[] = []
  for (const event of session.events) {
    if (event.type === 'tool/call') {
      transcript.push({ type: event.type, ...event.data })
      continue
    }
    if (event.type !== 'tool/result') continue
    const block = event.data.message.content[0]
    if (block?.type !== 'tool-result') throw new Error('desktop Oasis Wiki snapshot expected one tool result block')
    transcript.push({
      type: event.type,
      turn: event.data.turn,
      step: event.data.step,
      callId: block.toolCallId,
      isError: block.isError,
      content: block.content,
      ...event.data.meta === undefined ? {} : { meta: event.data.meta },
    })
  }
  process.stdout.write(`${JSON.stringify({
    catalogIncludesSkill: catalogText.includes('`oasis-wiki`'),
    catalogIncludesImagePromptSkill: catalogText.includes('`ai-image-prompts`'),
    summary: summary ?? null,
    loaded: value === undefined ? null : loadedSkill(value),
    search: search.isError ? null : search.value,
    imagePromptSummary: imagePromptSummary ?? null,
    imagePromptLoaded: imagePromptValue === undefined ? null : loadedSkill(imagePromptValue),
    imagePromptSearch: imageSearch.isError ? null : imageSearch.value,
    transcript,
  })}\n`)
} finally {
  await searchProvider.dispose()
  await rm(cacheRoot, { recursive: true, force: true })
  await ctx.fiber.dispose()
}
