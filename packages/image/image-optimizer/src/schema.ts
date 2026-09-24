/** Runtime validation for image-optimization Provider candidates. @module @deepseek-ai/dsh-image-optimizer/schema */

import { z } from 'zod'
import type { ImageOptimizationCandidate } from './types.ts'

const candidateSchema = z.object({
  kind: z.enum(['template', 'case']),
  id: z.string(),
  category: z.string().optional(),
  score: z.number(),
  composition: z.array(z.string()),
  visualStyle: z.array(z.string()),
  scene: z.array(z.string()),
  preserve: z.array(z.string()),
  avoid: z.array(z.string()),
  requiredCapabilities: z.array(z.string()),
  visualStyleTags: z.array(z.string()),
  sceneTags: z.array(z.string()),
  source: z.object({
    title: z.string(),
    url: z.string(),
    license: z.string(),
    redistributablePrompt: z.boolean(),
  }).strict(),
}).strict()

/**
 * Validate and normalize one Provider candidate before registry admission.
 * @param input - untrusted candidate value supplied by a Provider.
 * @returns the normalized candidate with no undeclared fields.
 */
export function parseCandidate(input: unknown): ImageOptimizationCandidate {
  const { category, ...candidate } = candidateSchema.parse(input)
  return category === undefined ? candidate : { ...candidate, category }
}
