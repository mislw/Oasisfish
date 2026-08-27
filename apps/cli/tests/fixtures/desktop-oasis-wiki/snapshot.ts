import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { agentEvents, Inbox, type Agent } from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import { boot, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { SessionId } from '@deepseek-ai/dsh-session'
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
  const summary = (await ctx.skills.list()).find(skill => skill.name === 'oasis-wiki')
  const result = await ctx.tools.execute({
    callId: CallId('desktop-oasis-wiki-snapshot'),
    name: 'skill',
    arguments: { name: 'oasis-wiki' },
    signal: new AbortController().signal,
  })
  const value = result.isError ? undefined : result.value
  const catalogText = Array.isArray(catalog)
    ? catalog.map(part => part.type === 'text' ? part.text : '').join('\n')
    : catalog ?? ''
  process.stdout.write(`${JSON.stringify({
    catalogIncludesSkill: catalogText.includes('`oasis-wiki`'),
    summary: summary ?? null,
    loaded: value === undefined ? null : loadedSkill(value),
  })}\n`)
} finally {
  await ctx.fiber.dispose()
}
