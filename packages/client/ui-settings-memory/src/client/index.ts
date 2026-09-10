/** Browser contribution for durable memory management in Web Settings. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { MemorySection, type MemorySectionInjected } from './MemorySection.tsx'
import { en, zh, type MemoryLocaleKey } from './locales.ts'
import { MemorySettingsStore } from './store.ts'

export type { MemorySectionInjected, MemorySectionProps } from './MemorySection.tsx'
export type { MemoryLocaleKey } from './locales.ts'
export type { MemoryRemote, MemorySettingsState } from './store.ts'
export { MemorySettingsStore } from './store.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Durable memory Settings copy. */
    'settings.memory': MemoryLocaleKey
  }
}

/** Dictionary namespace owned by the memory page. */
export const NS = 'settings.memory'

/** Services required by the Settings registration and generated Remote namespace. */
export const inject = ['slots', 'locale', 'remote', 'remote.memory']

/** Register the memory management page. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-memory: dictionaries')
  const controller = new MemorySettingsStore(ctx.remote.memory)
  const t = ctx.locale.bind(NS)
  const injected = (): MemorySectionInjected => ({
    controller,
    hooks: { memory: controller.store },
    load: cwd => controller.load(cwd),
    setEnabled: (enabled, cwd) => controller.setEnabled(enabled, cwd),
    add: (request, cwd) => controller.add(request, cwd),
    update: (id, content, cwd) => controller.update(id, content, cwd),
    remove: (id, cwd) => controller.remove(id, cwd),
  })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'memory',
    order: 20,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, MemorySection))
}
