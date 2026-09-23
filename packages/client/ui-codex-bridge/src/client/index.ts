/** Codex Bridge interactive preview, browser half. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { CodexBridgeSection } from './CodexBridgeSection.tsx'
import { en, zh, type CodexBridgeLocaleKey } from './locales.ts'

export type { CodexBridgeLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Codex Bridge interactive-preview copy. */
    'settings.codexBridge': CodexBridgeLocaleKey
  }
}

/** Dictionary namespace owned by this preview. */
const NS = 'settings.codexBridge'

/** Services required by the Settings contribution. */
export const inject = ['slots', 'locale']

/** Contribute the Codex Bridge preview page to Settings. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-codex-bridge: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'codex-bridge',
    order: 15,
    label: () => t('nav'),
    locale: NS,
  }, CodexBridgeSection))
}
