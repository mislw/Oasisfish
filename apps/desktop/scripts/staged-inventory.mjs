import { access } from 'node:fs/promises'
import { join } from 'node:path'

/** Files that make Desktop Skill retrieval complete without runtime downloads. */
export const RETRIEVAL_REQUIRED_FILES = Object.freeze([
  'bundled-skills/oasis-wiki/SKILL.md',
  'bundled-skills/oasis-wiki/VERSION',
  'bundled-skills/ai-image-prompts/SKILL.md',
  'bundled-skills/ai-image-prompts/LICENSE',
  'bundled-skills/ai-image-prompts/references/visual-recipes.md',
  'models/bge-small-zh-v1.5/model-manifest.json',
  'models/bge-small-zh-v1.5/LICENSE',
  'models/bge-small-zh-v1.5/config.json',
  'models/bge-small-zh-v1.5/onnx/model_quantized.onnx',
  'models/bge-small-zh-v1.5/special_tokens_map.json',
  'models/bge-small-zh-v1.5/tokenizer_config.json',
  'models/bge-small-zh-v1.5/tokenizer.json',
  'models/bge-small-zh-v1.5/vocab.txt',
])

/** Reject a staged Desktop runtime that omits any immutable retrieval resource. */
export async function verifyStagedRetrievalResources(root) {
  const missing = []
  for (const relativePath of RETRIEVAL_REQUIRED_FILES) {
    try { await access(join(root, relativePath)) } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      missing.push(relativePath)
    }
  }
  if (missing.length > 0) {
    throw new Error(`Desktop retrieval resources are incomplete:\n${missing.map(path => `- ${path}`).join('\n')}`)
  }
}
