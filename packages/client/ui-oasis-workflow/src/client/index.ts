/** Browser half of the trusted Oasis UI workflow launcher. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { OasisUiLauncherStore } from './launcher-store.ts'
import { OasisUiLauncherButton, OasisUiWorkflowOverlay } from './OasisUiWorkflow.tsx'

export { buildOasisUiStagePrompt, buildOasisUiWorkflowPrompt, OASIS_UI_STAGES } from './workflow.ts'
export { OasisUiLauncherStore } from './launcher-store.ts'
export { OasisUiProgressStore } from './progress-store.ts'
export { OasisUiLauncherButton, OasisUiWorkflowOverlay } from './OasisUiWorkflow.tsx'

export const inject = ['slots', 'conversation']

export function apply(ctx: ClientContext): void {
  const launcher = new OasisUiLauncherStore()

  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'oasis-ui-workflow',
    order: 30,
    label: 'UI 生图',
    inject: (sessionId: SessionId) => ({
      launcher,
      addFiles: (files, limits) => ctx.conversation.addDraftImages(sessionId, files, limits),
    }),
  }, OasisUiLauncherButton))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'oasis-ui-workflow',
    order: 30,
    inject: () => ({ launcher }),
  }, OasisUiWorkflowOverlay))
}
