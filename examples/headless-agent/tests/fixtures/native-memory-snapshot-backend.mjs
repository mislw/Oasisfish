/** Deterministic adapter that stores one memory and observes it next turn. */

import { CallId, LlmAdapter } from '@deepseek-ai/dsh-llm'

function textOf(messages) {
  return messages.flatMap(message => message.content)
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

class NativeMemorySnapshotAdapter extends LlmAdapter {
  requests = 0

  async * stream(options) {
    this.requests++
    const tool = options.tools?.find(candidate => candidate.name === 'memory_manage')
    if (tool === undefined) throw new Error('native-memory snapshot did not receive memory_manage')
    if (!options.system?.includes('Never store secrets, raw logs, or transient task state.')) {
      throw new Error('native-memory snapshot did not receive durable-memory guidance')
    }

    const text = textOf(options.messages)
    if (this.requests === 1) {
      if (text.includes('Use pnpm for repository tasks.')) {
        throw new Error('native-memory snapshot injected a record before it was stored')
      }
      const args = JSON.stringify({
        action: 'add',
        scope: 'project',
        content: 'Use pnpm for repository tasks.',
      })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield {
        type: 'tool-call-delta', index: 0, id: CallId('native-memory-add'),
        name: 'memory_manage', argumentsDelta: args,
      }
      yield {
        type: 'block-end', index: 0,
        block: { type: 'tool-call', id: CallId('native-memory-add'), name: 'memory_manage', arguments: args },
      }
      yield { type: 'usage', usage: { inputTokens: 8, outputTokens: 4 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }

    if (this.requests === 2) {
      const toolResult = options.messages.at(-1)?.content.find(block => block.type === 'tool-result')
      if (!JSON.stringify(toolResult).includes('Stored project memory')) {
        throw new Error('native-memory snapshot did not receive the committed tool result')
      }
      yield* this.text('STORED')
      return
    }

    if (this.requests === 3) {
      if (!text.includes('Project memory:') || !text.includes('Use pnpm for repository tasks.')) {
        throw new Error('native-memory snapshot did not receive the stored project record on the next turn')
      }
      yield* this.text('MEMORY_OK')
      return
    }

    throw new Error(`native-memory snapshot received unexpected request ${String(this.requests)}`)
  }

  * text(value) {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: value }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: value } }
    yield { type: 'usage', usage: { inputTokens: 6, outputTokens: 2 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

/** Cordis plugin name. */
export const name = 'native-memory-snapshot-backend'
/** Required LLM registry service. */
export const inject = ['llm']

/** Register the deterministic snapshot adapter. */
export function apply(ctx) {
  ctx.llm.registerAdapter(['deepseek-official'], new NativeMemorySnapshotAdapter())
}
