import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  createUserMessage, LlmAdapter, ToolCallId,
  type GenerateOptions, type LlmResolvedModelInfo, type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { SESSION_FORMAT_VERSION, Session, SessionId } from '@deepseek-ai/dsh-session'
import AgentRegistry, { agentEvents, type Agent } from '@deepseek-ai/dsh-agent'
import {
  mountAgentLoopTestDependencies, mountAgentLoopTestHarness,
} from '@deepseek-ai/dsh-agent-loop-testkit'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { MemoryId, type MemoryProvider } from '@deepseek-ai/dsh-memory'
import MemoryService from '@deepseek-ai/dsh-memory'
import * as tool from '../src/index.ts'

const userRecord = Object.freeze({
  id: MemoryId('user-1'), scope: 'user' as const, content: 'Reply in Chinese.', createdAt: 1, updatedAt: 1,
})
const projectRecord = Object.freeze({
  id: MemoryId('project-1'), scope: 'project' as const, projectKey: 'key', projectLabel: 'repo',
  content: 'Run focused tests.', createdAt: 2, updatedAt: 2,
})

function provider(overrides: Partial<MemoryProvider> = {}): MemoryProvider {
  return {
    list: vi.fn<MemoryProvider['list']>(() => Promise.resolve({ enabled: true, records: [userRecord, projectRecord] })),
    add: vi.fn<MemoryProvider['add']>(request => Promise.resolve({ ...userRecord, scope: request.scope, content: request.content })),
    update: vi.fn<MemoryProvider['update']>(request => Promise.resolve({ ...userRecord, id: request.id, content: request.content })),
    remove: vi.fn<MemoryProvider['remove']>(request => Promise.resolve({ id: request.id, absent: true as const })),
    setEnabled: vi.fn<MemoryProvider['setEnabled']>(enabled => Promise.resolve(enabled)),
    ...overrides,
  }
}

function fakeAgent(session: Session): Agent {
  return {
    id: session.id,
    options: {}, session,
    status: 'running', ctx: new Context(), send() {}, followup() {}, steer() {}, inject() {}, cancel() {},
    runMaintenance: (task: Parameters<Agent['runMaintenance']>[0]) => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  } as unknown as Agent
}

function sessionWithoutCwd(): Session {
  return Session.create(SessionId('memory-tool-no-cwd'), [], {
    version: SESSION_FORMAT_VERSION, id: SessionId('memory-tool-no-cwd'), createdAt: 1, isSeeded: false,
  })
}

function textResponse(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

class ScriptedAdapter extends LlmAdapter {
  constructor(private readonly responses: StreamChunk[][]) { super() }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model })
  }

  async * stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    const response = this.responses.shift()
    if (response === undefined) throw new Error('script exhausted')
    for (const chunk of response) yield chunk
  }
}

function waitForIdle(ctx: Context, agent: Agent): Promise<void> {
  return new Promise((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject !== agent || status !== 'idle') return
      dispose()
      resolve()
    })
  })
}

async function setup(backend = provider()) {
  const ctx = new Context()
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(MemoryService)
  ctx.memory.registerProvider(backend)
  const fiber = await ctx.plugin(tool)
  const session = Session.create(SessionId('memory-tool'), [], {
    version: SESSION_FORMAT_VERSION, id: SessionId('memory-tool'), createdAt: 1, isSeeded: false, cwd: 'C:\\repo',
  })
  return { ctx, fiber, backend, session, agent: fakeAgent(session) }
}

describe('memory_manage', () => {
  it('publishes durable-memory guidance and the four actions', async () => {
    const { ctx } = await setup()
    const schema = ctx.tools.schemas().find(candidate => candidate.name === 'memory_manage')
    expect(schema?.description).toContain('durable, reusable facts')
    expect(JSON.stringify(schema?.parameters)).toContain('add')
    expect(JSON.stringify(schema?.parameters)).toContain('update')
    expect(JSON.stringify(schema?.parameters)).toContain('remove')
    const assembly = await ctx.systemPrompt.assemble()
    expect(assembly.sections.map(section => section.text).join('\n')).toContain('Never store secrets, raw logs, or transient task state')
  })

  it('lists effective records for the owning Session cwd', async () => {
    const { ctx, backend, agent } = await setup()
    const result = await ctx.tools.execute({
      callId: ToolCallId('list'), name: 'memory_manage', arguments: { action: 'list' },
      signal: new AbortController().signal, agent,
    })
    expect(vi.mocked(backend.list).mock.calls[0]?.[0]).toMatchObject({ cwd: 'C:\\repo' })
    const content = result.content[0]
    expect(content?.type).toBe('text')
    if (content?.type === 'text') expect(content.text).toContain('Reply in Chinese.')
  })

  it('renders empty and single-scope lists without absent headings', async () => {
    const empty = await setup(provider({ list: () => Promise.resolve({ enabled: true, records: [] }) }))
    const emptyResult = await empty.ctx.tools.execute({
      callId: ToolCallId('empty'), name: 'memory_manage', arguments: { action: 'list' },
      signal: new AbortController().signal, agent: empty.agent,
    })
    expect(emptyResult.content[0]).toMatchObject({ text: 'No durable memory is stored for this context.' })

    const userOnly = await setup(provider({ list: () => Promise.resolve({ enabled: true, records: [userRecord] }) }))
    const userResult = await userOnly.ctx.tools.execute({
      callId: ToolCallId('user-only'), name: 'memory_manage', arguments: { action: 'list' },
      signal: new AbortController().signal, agent: userOnly.agent,
    })
    expect(JSON.stringify(userResult.content)).toContain('User preferences')
    expect(JSON.stringify(userResult.content)).not.toContain('Project memory')
  })

  it('omits cwd and signal from provider context when neither exists', async () => {
    const { ctx, backend } = await setup()
    const agent = fakeAgent(sessionWithoutCwd())
    const definition = ctx.tools.get('memory_manage')
    if (definition === undefined) throw new Error('memory_manage was not registered')
    await definition.execute({ action: 'list' }, { agent } as never)
    expect(backend.list).toHaveBeenCalledWith({ sourceSessionId: agent.session.id })
  })

  it('adds, updates, and removes with Session source metadata', async () => {
    const { ctx, backend, agent } = await setup()
    const signal = new AbortController().signal
    await ctx.tools.execute({ callId: ToolCallId('add'), name: 'memory_manage', arguments: {
      action: 'add', scope: 'project', content: 'Use pnpm.',
    }, signal, agent })
    await ctx.tools.execute({ callId: ToolCallId('update'), name: 'memory_manage', arguments: {
      action: 'update', id: 'user-1', content: 'Reply concisely.',
    }, signal, agent })
    await ctx.tools.execute({ callId: ToolCallId('remove'), name: 'memory_manage', arguments: {
      action: 'remove', id: 'user-1',
    }, signal, agent })

    expect(vi.mocked(backend.add).mock.calls[0]?.[0]).toEqual({ scope: 'project', content: 'Use pnpm.' })
    expect(vi.mocked(backend.add).mock.calls[0]?.[1]).toMatchObject({ cwd: 'C:\\repo', sourceSessionId: agent.session.id, signal })
    expect(vi.mocked(backend.update).mock.calls[0]?.[0]).toEqual({ id: 'user-1', content: 'Reply concisely.' })
    expect(vi.mocked(backend.update).mock.calls[0]?.[1]).toMatchObject({ cwd: 'C:\\repo', sourceSessionId: agent.session.id, signal })
    expect(vi.mocked(backend.remove).mock.calls[0]?.[0]).toEqual({ id: 'user-1' })
    expect(vi.mocked(backend.remove).mock.calls[0]?.[1]).toMatchObject({ cwd: 'C:\\repo', sourceSessionId: agent.session.id, signal })
  })

  it('rejects invalid action field combinations', async () => {
    const { ctx, agent } = await setup()
    const result = await ctx.tools.execute({
      callId: ToolCallId('bad'), name: 'memory_manage', arguments: { action: 'add', scope: 'user' },
      signal: new AbortController().signal, agent,
    })
    expect(result.isError).toBe(true)
    const content = result.content[0]
    expect(content?.type).toBe('text')
    if (content?.type === 'text') expect(content.text).toContain('requires content')
  })

  it('rejects missing scope and ids for the matching actions', async () => {
    const { ctx, agent } = await setup()
    const signal = new AbortController().signal
    const calls = [
      { id: 'scope', arguments: { action: 'add', content: 'fact' } },
      { id: 'update-id', arguments: { action: 'update', content: 'fact' } },
      { id: 'remove-id', arguments: { action: 'remove' } },
    ] as const
    for (const call of calls) {
      const result = await ctx.tools.execute({
        callId: ToolCallId(call.id), name: 'memory_manage', arguments: call.arguments, signal, agent,
      })
      expect(result.isError).toBe(true)
    }
  })

  it('publishes read and mutation call presentation intents', async () => {
    const { ctx } = await setup()
    const toolDefinition = ctx.tools.get('memory_manage')
    if (toolDefinition === undefined) throw new Error('memory_manage was not registered')
    expect(toolDefinition.presentCall?.({ action: 'list' })).toMatchObject({ kind: 'read' })
    expect(toolDefinition.presentCall?.({ action: 'add', scope: 'user', content: 'fact' })).toMatchObject({ kind: 'other' })
  })

  it('requires an owning agent Session', async () => {
    const { ctx } = await setup()
    const result = await ctx.tools.execute({
      callId: ToolCallId('owner'), name: 'memory_manage', arguments: { action: 'list' },
      signal: new AbortController().signal,
    })
    expect(result.isError).toBe(true)
    const content = result.content[0]
    expect(content?.type).toBe('text')
    if (content?.type === 'text') expect(content.text).toContain('owning agent')
  })
})

describe('native memory context', () => {
  it('appends one sourced snapshot and preserves the accepted request-series decision', async () => {
    const { ctx, agent } = await setup()
    const proposed = createUserMessage({ content: [{ type: 'text', text: 'request' }], source: { kind: 'user' } })
    const next = vi.fn(() => Promise.resolve({
      kind: 'enter' as const, messages: [proposed], startsRequestSeries: true as const,
    }))
    const decision = await agentEvents(ctx, agent).waterfall('agent/pre-step', {
      messages: [proposed], turn: 1, step: 1, signal: new AbortController().signal,
    }, next)
    expect(next).toHaveBeenCalledOnce()
    expect(decision.kind).toBe('enter')
    if (decision.kind !== 'enter') return
    expect(decision.startsRequestSeries).toBe(true)
    expect(decision.messages).toHaveLength(2)
    expect(decision.messages[0]).toBe(proposed)
    expect(decision.messages[1]?.source).toMatchObject({
      kind: 'plugin', plugin: 'native-memory-context', form: 'snapshot',
    })
    const content = decision.messages[1]?.content[0]
    expect(content?.type).toBe('text')
    if (content?.type === 'text') expect(content.text).toContain('Project memory')
  })

  it('records visible memory once on the first accepted step of a multi-step turn', async () => {
    const ctx = new Context()
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(MemoryService)
    ctx.memory.registerProvider(provider())
    await ctx.plugin(tool)
    const harness = await mountAgentLoopTestHarness(ctx)
    ctx.llm.registerAdapter(['mock'], new ScriptedAdapter([
      textResponse('first'), textResponse('second'),
    ]))
    const agent = await harness.create(
      SessionId('memory-logged-context'),
      { provider: 'mock', model: 'mock' },
      { cwd: 'C:\\repo' },
    )
    let injectedLaterStep = false
    ctx.on('agent/turn-stopping', ({ agent: subject }) => {
      if (subject !== agent || injectedLaterStep) return
      injectedLaterStep = true
      subject.inject(createUserMessage({
        content: [{ type: 'text', text: 'later step' }],
        source: {
          kind: 'plugin', plugin: 'memory-test', form: 'notice', summary: 'later step',
        },
      }))
    })

    const idle = waitForIdle(ctx, agent)
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'request' }], source: { kind: 'user' },
    }))
    await idle

    const messages = agent.session.snapshotEvents()
      .filter(event => event.type === 'user/message')
      .map(event => event.type === 'user/message' ? event.data : undefined)
      .filter(message => message !== undefined)
    const memoryText = 'User preferences:\n- [user-1] Reply in Chinese.\n\nProject memory:\n- [project-1] Run focused tests.'
    expect(messages.map(message => message.source)).toEqual([
      { kind: 'user' },
      {
        kind: 'plugin', plugin: 'native-memory-context', form: 'snapshot',
        sections: [{ name: 'native-memory', text: memoryText }],
      },
      { kind: 'plugin', plugin: 'memory-test', form: 'notice', summary: 'later step' },
    ])
    expect(messages.filter(message => (
      message.source.kind === 'plugin' && message.source.plugin === 'native-memory-context'
    ))).toHaveLength(1)
    await ctx.fiber.dispose()
  })

  it('skips later steps, disabled memory, empty memory, and rejected decisions', async () => {
    const cases = [
      { backend: provider(), step: 2, reject: false },
      { backend: provider({ list: () => Promise.resolve({ enabled: false, records: [userRecord] }) }), step: 1, reject: false },
      { backend: provider({ list: () => Promise.resolve({ enabled: true, records: [] }) }), step: 1, reject: false },
      { backend: provider(), step: 1, reject: true },
    ]
    for (const item of cases) {
      const { ctx, agent } = await setup(item.backend)
      const decision = await agentEvents(ctx, agent).waterfall('agent/pre-step', {
        messages: [], turn: 1, step: item.step, signal: new AbortController().signal,
      }, () => Promise.resolve(item.reject
        ? { kind: 'reject' as const, reason: 'test' }
        : { kind: 'enter' as const, messages: [] }))
      if (decision.kind === 'enter') expect(decision.messages).toHaveLength(0)
      else expect(decision.kind).toBe('reject')
    }
  })

  it('skips injection when the accepted first-step signal is already aborted', async () => {
    const { ctx, agent } = await setup()
    const controller = new AbortController()
    controller.abort('cancelled')
    const decision = await agentEvents(ctx, agent).waterfall('agent/pre-step', {
      messages: [], turn: 1, step: 1, signal: controller.signal,
    }, () => Promise.resolve({ kind: 'enter' as const, messages: [] }))
    expect(decision).toEqual({ kind: 'enter', messages: [] })
  })

  it('removes both tool and listener on disposal', async () => {
    const { ctx, fiber, agent } = await setup()
    await fiber.dispose()
    expect(ctx.tools.schemas().some(candidate => candidate.name === 'memory_manage')).toBe(false)
    const decision = await agentEvents(ctx, agent).waterfall('agent/pre-step', {
      messages: [], turn: 1, step: 1, signal: new AbortController().signal,
    }, () => Promise.resolve({ kind: 'enter' as const, messages: [] }))
    expect(decision).toEqual({ kind: 'enter', messages: [] })
  })
})
