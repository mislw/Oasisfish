/** Browser half of the trusted Oasis UI workflow launcher. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { OasisUiLauncherStore } from './launcher-store.ts'
import { en, NS, type OasisUiLocaleKey, zh } from './locales.ts'
import { OasisUiLauncherButton, OasisUiWorkflowOverlay } from './OasisUiWorkflow.tsx'

export { buildOasisUiStagePrompt, buildOasisUiWorkflowPrompt, OASIS_UI_STAGES } from '../workflow.ts'
export { OasisUiLauncherStore } from './launcher-store.ts'
export type { OasisUiLocaleKey } from './locales.ts'
export { OasisUiProgressStore } from './progress-store.ts'
export { OasisUiLauncherButton, OasisUiWorkflowOverlay } from './OasisUiWorkflow.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Oasis UI generation workflow copy. */
    oasisWorkflow: OasisUiLocaleKey
  }
}

export const inject = ['slots', 'conversation', 'locale']

export function apply(ctx: ClientContext): void {
  const launcher = new OasisUiLauncherStore()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-oasis-workflow: dictionaries')
  const t = ctx.locale.bind(NS)

  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'oasis-ui-workflow',
    order: 30,
    label: () => t('launcher.short'),
    locale: NS,
    inject: (sessionId: SessionId) => ({
      launcher,
      addFiles: (files, limits) => ctx.conversation.addDraftImages(sessionId, files, limits),
    }),
  }, OasisUiLauncherButton))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'oasis-ui-workflow',
    order: 30,
    locale: NS,
    inject: () => ({ launcher }),
  }, OasisUiWorkflowOverlay))
}
