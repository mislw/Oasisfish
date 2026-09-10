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
    if (tool.parameters.properties?.variation_prompts?.type !== 'array') {
      throw new Error('image-generation snapshot received no candidate-variation control')
    }

    const toolResult = options.messages.at(-1)?.content.find(block => block.type === 'tool-result')
    if (toolResult === undefined) {
      const args = JSON.stringify({
        prompt: 'A clean game inventory panel with six item slots',
        variation_prompts: [
          'symmetrical front view',
          'slightly elevated three-quarter view',
          'soft diffuse studio lighting',
          'stronger rim light and deeper material contrast',
        ],
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

    throw new Error('image-generation snapshot received an unexpected model request after image_generate completed')
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
