/** Model-facing durable memory tool and logged per-turn context. */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { MemoryId } from '@deepseek-ai/dsh-memory'
import type { MemoryContext, MemoryRecord } from '@deepseek-ai/dsh-memory'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-memory'
export const inject = ['tools', 'systemPrompt', 'agents', 'memory']

const GUIDANCE = 'Use memory_manage only for durable, reusable facts that will help future work. Prefer project scope for repository rules and environment facts. Never store secrets, raw logs, or transient task state. Do not duplicate facts already present; update a record when a stable fact changes.'

function contextOf(agent: Agent, signal?: AbortSignal): MemoryContext {
  return {
    ...(agent.session.header.cwd === undefined ? {} : { cwd: agent.session.header.cwd }),
    sourceSessionId: agent.session.id,
    ...(signal === undefined ? {} : { signal }),
  }
}

function renderRecords(records: readonly MemoryRecord[]): string {
  const user = records.filter(record => record.scope === 'user')
  const project = records.filter(record => record.scope === 'project')
  const sections: string[] = []
  if (user.length > 0) sections.push(`User preferences:\n${user.map(record => `- [${record.id}] ${record.content}`).join('\n')}`)
  if (project.length > 0) sections.push(`Project memory:\n${project.map(record => `- [${record.id}] ${record.content}`).join('\n')}`)
  return sections.join('\n\n')
}

function requireContent(action: string, content: string | undefined): string {
  if (content === undefined) throw new Error(`memory_manage: ${action} requires content`)
  return content
}

function requireId(action: string, id: string | undefined): ReturnType<typeof MemoryId> {
  if (id === undefined) throw new Error(`memory_manage: ${action} requires id`)
  return MemoryId(id)
}

/** Register memory guidance, management tool, and first-step context injection. */
export function apply(ctx: Context): void {
  ctx.systemPrompt.section({ name: 'tool:memory', order: 112, text: GUIDANCE })

  ctx.tools.register(defineTool({
    name: 'memory_manage',
    description: 'List or maintain durable, reusable facts for future work. Use user scope for cross-project preferences and project scope for stable facts about the current working directory.',
    parameters: {
      action: { type: 'string', required: true, enum: ['list', 'add', 'update', 'remove'] },
      scope: { type: 'string', enum: ['user', 'project'], description: 'Required for add.' },
      id: { type: 'string', description: 'Required for update or remove.' },
      content: { type: 'string', description: 'Required for add or update.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error('memory_manage requires an owning agent Session')
      const memoryContext = contextOf(exec.agent, exec.signal)
      switch (args.action) {
        case 'list': {
          const snapshot = await ctx.memory.list(memoryContext)
          const text = renderRecords(snapshot.records)
          return text === '' ? 'No durable memory is stored for this context.' : text
        }
        case 'add': {
          if (args.scope === undefined) throw new Error('memory_manage: add requires scope')
          const record = await ctx.memory.add({ scope: args.scope, content: requireContent('add', args.content) }, memoryContext)
          return `Stored ${record.scope} memory ${record.id}.`
        }
        case 'update': {
          const record = await ctx.memory.update({ id: requireId('update', args.id), content: requireContent('update', args.content) }, memoryContext)
          return `Updated ${record.scope} memory ${record.id}.`
        }
        case 'remove': {
          const removed = await ctx.memory.remove({ id: requireId('remove', args.id) }, memoryContext)
          return `Removed memory ${removed.id}.`
        }
      }
    },
    presentCall: args => ({ card: 'generic', title: 'Manage memory', kind: args.action === 'list' ? 'read' : 'other', rawInput: args }),
  }))

  ctx.on('agent/pre-step', async ({ agent, step, signal }, next): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted || step !== 1) return decision
    const snapshot = await ctx.memory.list(contextOf(agent, signal))
    if (!snapshot.enabled || snapshot.records.length === 0) return decision
    const text = renderRecords(snapshot.records)
    return {
      kind: 'enter',
      messages: [
        createUserMessage({
          content: [{ type: 'text', text }],
          source: {
            kind: 'plugin', plugin: 'native-memory-context', form: 'snapshot',
            sections: [{ name: 'native-memory', text }],
          },
        }),
        ...decision.messages,
      ],
    }
  }, { prepend: true })
}
