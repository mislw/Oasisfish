/** Models-page editor for the auxiliary image-generation route. */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { ModelsSettingsStore, ImageRouteSelection, ProviderRow } from './store.ts'
import type { en } from './locales.ts'
import styles from './ModelsSection.module.css'

interface ImageRouteEditorProps {
  route: ImageRouteSelection
  rows: readonly ProviderRow[]
  controller: ModelsSettingsStore
  readOnly: boolean
  t: (key: keyof typeof en) => string
}

/** A relative path below the provider's versioned Base URL. */
function validEndpoint(path: string): boolean {
  if (path.length === 0 || path.startsWith('/') || path.includes('?') || path.includes('#')) return false
  try {
    const base = new URL('https://example.invalid/v1/')
    const resolved = new URL(path, base)
    return resolved.origin === base.origin && resolved.pathname.startsWith(base.pathname)
      && resolved.pathname !== base.pathname
  } catch {
    return false
  }
}

/** Edit the complete image route while retaining unlisted provider-specific model ids. */
export function ImageRouteEditor({ route, rows, controller, readOnly, t }: ImageRouteEditorProps): ReactNode {
  const [draft, setDraft] = useState(route)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | undefined>()
  const [saved, setSaved] = useState(false)
  useEffect(() => { setDraft(route) }, [route])

  const set = (key: keyof ImageRouteSelection, value: string): void => {
    setDraft(previous => ({
      ...previous,
      [key]: value,
      ...key === 'fallbackProvider' && value === ''
        ? {
          fallbackModel: '',
          fallbackEndpointPath: 'images/generations',
          fallbackEditEndpointPath: 'images/edits',
        }
        : {},
    }))
    setFailure(undefined)
    setSaved(false)
  }
  const providers = rows.filter(row => controller.canSelectImageProvider(row))
  const providerIds = new Set(providers.map(row => row.entry.provider))
  const providerOptions = (selected: string): ReactNode => (
    <>
      <option value="">{t('imageNone')}</option>
      {selected !== '' && !providers.some(row => row.entry.provider === selected)
        ? <option value={selected}>{selected}</option>
        : null}
      {providers.map(row => (
        <option key={row.entry.provider} value={row.entry.provider}>{row.entry.displayName}</option>
      ))}
    </>
  )
  const valid = providerIds.has(draft.provider) && draft.model.trim() !== ''
    && validEndpoint(draft.endpointPath) && validEndpoint(draft.editEndpointPath)
    && (draft.fallbackProvider === '' || (
      providerIds.has(draft.fallbackProvider) && draft.fallbackModel.trim() !== ''
      && validEndpoint(draft.fallbackEndpointPath)
      && validEndpoint(draft.fallbackEditEndpointPath)
      && (draft.provider !== draft.fallbackProvider || draft.model !== draft.fallbackModel
        || draft.endpointPath !== draft.fallbackEndpointPath
        || draft.editEndpointPath !== draft.fallbackEditEndpointPath)
    ))
  const save = (): void => {
    if (!valid || saving || readOnly) return
    setSaving(true)
    setFailure(undefined)
    void controller.selectImageRoute(draft)
      .then((message) => {
        if (message === undefined) setSaved(true)
        else setFailure(message)
      })
      .finally(() => { setSaving(false) })
  }

  const field = (key: keyof ImageRouteSelection, label: keyof typeof en, disabled = false): ReactNode => (
    <label className={styles['field']}>
      <span className={styles['fieldLabel']}>{t(label)}</span>
      <input
        className={styles['input']}
        value={draft[key]}
        disabled={saving || readOnly || disabled}
        onChange={(event) => { set(key, event.currentTarget.value) }}
      />
    </label>
  )

  return (
    <section className={styles['defaultEditor']} aria-labelledby="models-image-title">
      <h3 id="models-image-title" className={styles['defaultTitle']}>{t('imageTitle')}</h3>
      <div className={styles['imageFields']}>
        <label className={styles['field']}>
          <span className={styles['fieldLabel']}>{t('imageProvider')}</span>
          <select className={`${styles['input']} ${styles['selectInput']}`} value={draft.provider}
            disabled={saving || readOnly} onChange={(event) => { set('provider', event.currentTarget.value) }}>
            {providerOptions(draft.provider)}
          </select>
        </label>
        {field('model', 'imageModel')}
        {field('endpointPath', 'imageEndpoint')}
        {field('editEndpointPath', 'imageEditEndpoint')}
        <label className={styles['field']}>
          <span className={styles['fieldLabel']}>{t('imageFallbackProvider')}</span>
          <select className={`${styles['input']} ${styles['selectInput']}`} value={draft.fallbackProvider}
            disabled={saving || readOnly} onChange={(event) => { set('fallbackProvider', event.currentTarget.value) }}>
            {providerOptions(draft.fallbackProvider)}
          </select>
        </label>
        {field('fallbackModel', 'imageFallbackModel', draft.fallbackProvider === '')}
        {field('fallbackEndpointPath', 'imageFallbackEndpoint', draft.fallbackProvider === '')}
        {field('fallbackEditEndpointPath', 'imageFallbackEditEndpoint', draft.fallbackProvider === '')}
      </div>
      {failure === undefined ? null : <p className={styles['error']} role="alert">{failure}</p>}
      {saved ? <p className={styles['savedNotice']} role="status">{t('imageSaved')}</p> : null}
      <div className={styles['defaultActions']}>
        <button type="button" className={styles['primaryButton']} disabled={!valid || saving || readOnly} onClick={save}>
          {saving ? t('imageSaving') : t('imageSave')}
        </button>
      </div>
    </section>
  )
}
