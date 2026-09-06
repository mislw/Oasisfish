import { useEffect, type ReactNode } from 'react'
import {
  Button,
  IconDownloadOutline16,
  IconRefreshOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopUpdatePhase } from '../protocol.ts'
import type { DesktopUpdateLocaleKey } from './locales.ts'
import type { DesktopUpdateViewState } from './store.ts'
import css from './DesktopUpdateSection.module.css'

/** Registration-side operations and state for the update page. */
export interface DesktopUpdateSectionInjected {
  hooks: {
    /** Update snapshot bound by the renderer as `useDesktopUpdate`. */
    desktopUpdate: SnapshotStore<DesktopUpdateViewState>
  }
  load: () => Promise<void>
  check: () => Promise<void>
  download: () => Promise<void>
  install: () => Promise<void>
}

/** Full component props assembled by the Settings renderer. */
export type DesktopUpdateSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.desktopUpdate'>
  & InjectFace<DesktopUpdateSectionInjected>

const STATUS_KEYS = {
  idle: null,
  checking: 'checking',
  'up-to-date': 'upToDate',
  available: 'available',
  downloading: 'downloading',
  downloaded: 'downloaded',
  installing: 'installing',
  unsupported: 'unsupported',
  error: null,
} satisfies Record<DesktopUpdatePhase, DesktopUpdateLocaleKey | null>

/** Render the desktop-only update settings page. */
export function DesktopUpdateSection(props: DesktopUpdateSectionProps): ReactNode {
  const { useDesktopUpdate, load, check, download, install, t } = props
  const state = useDesktopUpdate(snapshot => snapshot)

  useEffect(() => { void load() }, [load])

  if (state.status === 'loading') {
    return <div className={css.section} aria-busy="true"><p className={css.status}>{t('checking')}</p></div>
  }
  if (state.status === 'error') {
    return (
      <div className={css.section}>
        <h2 className={css.title}>{t('title')}</h2>
        <p className={css.error} role="alert">{t('loadError')}</p>
        <Button variant="outline" icon={<IconRefreshOutline16 />} onClick={() => { void load() }}>
          {t('retry')}
        </Button>
      </div>
    )
  }

  const update = state.update
  const statusKey = STATUS_KEYS[update.phase]
  const busy = update.phase === 'checking' || update.phase === 'downloading' || update.phase === 'installing'
  const percent = update.progress?.percent === undefined
    ? undefined
    : Math.max(0, Math.min(100, Math.round(update.progress.percent)))

  let action: ReactNode = null
  if (update.phase === 'available') {
    action = (
      <Button variant="primary" icon={<IconDownloadOutline16 />} onClick={() => { void download() }}>
        {t('download')}
      </Button>
    )
  } else if (update.phase === 'downloaded') {
    action = (
      <Button variant="primary" icon={<IconRefreshOutline16 />} onClick={() => { void install() }}>
        {t('install')}
      </Button>
    )
  } else if (busy) {
    action = <Button variant="primary" disabled>{t(statusKey as DesktopUpdateLocaleKey)}</Button>
  } else if (update.phase !== 'unsupported') {
    action = (
      <Button variant="outline" icon={<IconRefreshOutline16 />} onClick={() => { void check() }}>
        {update.phase === 'error' ? t('retry') : t('check')}
      </Button>
    )
  }

  return (
    <section className={css.section} aria-busy={busy}>
      <header className={css.header}>
        <h2 className={css.title}>{t('title')}</h2>
        <p className={css.intro}>{t('intro')}</p>
      </header>
      <dl className={css.versions}>
        <div><dt>{t('currentVersion')}</dt><dd>{update.currentVersion}</dd></div>
        {update.availableVersion === undefined ? null : (
          <div><dt>{t('availableVersion')}</dt><dd>{update.availableVersion}</dd></div>
        )}
      </dl>
      {update.phase === 'downloading' ? (
        <div className={css.progressBlock}>
          <progress
            className={css.progress}
            aria-label={t('progress')}
            max={100}
            {...percent === undefined ? {} : { value: percent, 'aria-valuenow': percent }}
          />
          {percent === undefined ? null : <span>{percent}%</span>}
        </div>
      ) : null}
      {statusKey === null ? null : <p className={css.status}>{t(statusKey)}</p>}
      {update.phase === 'error' ? <p className={css.error} role="alert">{update.message}</p> : null}
      {update.phase === 'downloaded' ? <p className={css.notice}>{t('installerNotice')}</p> : null}
      <div className={css.actions}>{action}</div>
    </section>
  )
}
