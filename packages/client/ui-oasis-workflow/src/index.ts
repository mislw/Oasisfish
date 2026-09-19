/**
 * Oasis UI workflow launcher, host half.
 *
 * The browser emits a structured `[OASIS_UI_WORKFLOW]` message. This prompt
 * section makes that marker a stable product contract: the agent loads the
 * installed oasis-wiki skill and follows its real gates instead of treating the
 * launcher as a generic image prompt.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'

export const inject = ['systemPrompt']

const OASIS_UI_PROMPT = 'Messages beginning with [OASIS_UI_WORKFLOW] come from the trusted Oasis UI launcher. '
  + 'Before acting, load the oasis-wiki skill with the skill tool. Follow its Game UI Design System, Cowart UI Production, and Oasis UI Agent interaction rules. '
  + 'Work one user-visible stage at a time, keep one pending decision, require a complete UI Tree and real style reference for formal generation, preserve native text/numbers/progress/hit targets, and never modify UGC assets without explicit authorization. '
  + 'The launcher advances only when the user confirms the current stage; an agent response must not claim that the launcher progressed or continue into a later stage. '
  + 'Prefer built-in image_gen; when unavailable, report IMAGE_GENERATION_UNAVAILABLE unless the user explicitly authorizes the documented provider-direct fallback. '
  + 'Never fake image output, generation-result records, editable layers, Cowart state, or approval.'

export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'ui:oasis-workflow-launcher',
    order: 185,
    text: OASIS_UI_PROMPT,
  })
}
