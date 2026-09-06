/** Deterministic adapter that requires one generated-image tool round trip. */

import { CallId, LlmAdapter } from '@deepseek-ai/dsh-llm'

class ImageGenerationSnapshotAdapter extends LlmAdapter {
  async * stream(options) {
    const tool = options.tools?.find(candidate => candidate.name === 'image_generate')
    if (tool === undefined) throw new Error('image-generation snapshot did not receive image_generate')
    if (!tool.description.includes('conversation model remains unchanged')) {
      throw new Error('image-generation snapshot received incomplete model guidance')
    }
    if (tool.parameters.properties?.use_reference_images?.type !== 'boolean') {
      throw new Error('image-generation snapshot received no reference-image control')
    }

    const toolResult = options.messages.at(-1)?.content.find(block => block.type === 'tool-result')
    if (toolResult === undefined) {
      const args = JSON.stringify({
        prompt: 'A clean game inventory panel with six item slots',
        size: '1024x1024',
      })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield {
        type: 'tool-call-delta', index: 0, id: CallId('image-snapshot-call'),
        name: 'image_generate', argumentsDelta: args,
      }
      yield {
        type: 'block-end', index: 0,
        block: { type: 'tool-call', id: CallId('image-snapshot-call'), name: 'image_generate', arguments: args },
      }
      yield { type: 'usage', usage: { inputTokens: 8, outputTokens: 3 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }

    const image = toolResult.content.find(block => block.type === 'image')
    const text = toolResult.content.find(block => block.type === 'text')
    if (image === undefined || text?.text !== 'Generated image with snapshot-image/gpt-image-1.') {
      throw new Error('image-generation snapshot received an invalid tool result')
    }
    const reply = 'IMAGE_GENERATION_OK: the chat model stayed active after the generated image was attached.'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: reply }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
    yield { type: 'usage', usage: { inputTokens: 5, outputTokens: 4 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

/** Cordis plugin name. */
export const name = 'image-generation-snapshot-backend'
/** Required LLM registry service. */
export const inject = ['llm']

/** Register the deterministic snapshot adapter. */
export function apply(ctx) {
  ctx.llm.registerAdapter(['deepseek-official'], new ImageGenerationSnapshotAdapter())
}
