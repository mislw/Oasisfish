import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { DesktopUpdateSection, type DesktopUpdateSectionInjected } from './DesktopUpdateSection.tsx'
import { en, zh, type DesktopUpdateLocaleKey } from './locales.ts'
import { DesktopUpdateStore } from './store.ts'

export type { DesktopUpdateSectionInjected, DesktopUpdateSectionProps } from './DesktopUpdateSection.tsx'
export type { DesktopUpdateLocaleKey } from './locales.ts'
export type { DesktopUpdateViewState } from './store.ts'
export { DesktopUpdateStore } from './store.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Oasisfish desktop update settings copy. */
    'settings.desktopUpdate': DesktopUpdateLocaleKey
  }
}

/** Dictionary namespace owned by the desktop update page. */
export const NS = 'settings.desktopUpdate'

/** Settings services required by the desktop-only contribution. */
export const inject = ['slots', 'locale']

/** Register the update page only when the sandboxed Electron bridge exists. */
export function apply(ctx: ClientContext): void {
  const bridge = window.oasisfishUpdate
  if (bridge === undefined) return

  const controller = new DesktopUpdateStore(bridge)
  ctx.effect(() => () => { controller.dispose() }, 'ui-desktop-update: bridge subscription')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-desktop-update: dictionaries')

  const t = ctx.locale.bind(NS)
  const injected = (): DesktopUpdateSectionInjected => ({
    hooks: { desktopUpdate: controller.store },
    load: () => controller.load(),
    check: () => controller.check(),
    download: () => controller.download(),
    install: () => controller.install(),
  })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'app-updates',
    order: 30,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, DesktopUpdateSection))
}
