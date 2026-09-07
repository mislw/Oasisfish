import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { IApiClient, ProviderProbeView } from '@deepseek-ai/dsh-api-remotes/client'
import type { ProbeTarget } from './ModelListEditor.tsx'
import { messageOf } from './store.ts'
import type { en } from './locales.ts'
import styles from './ProviderProbe.module.css'
import formStyles from './ModelsSection.module.css'

/** Props of {@link ProviderProbe}. */
export interface ProviderProbeProps {
  api: Pick<IApiClient, 'llm'>
  target: ProbeTarget
  models: readonly { id?: unknown }[]
  t: (key: keyof typeof en) => string
  disabled: boolean
}

/** Whether the text-generation probe can meaningfully test this model id. */
function supportsTextProbe(model: string): boolean {
  return !/(?:^|[\]/])gpt-image(?:-|$)/iu.test(model)
}

/** Test one drafted provider and model without saving either. */
export function ProviderProbe(props: ProviderProbeProps): ReactNode {
  const allModelIds = useMemo(() => props.models
    .map(model => model.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0), [props.models])
  const modelIds = useMemo(() => allModelIds.filter(supportsTextProbe), [allModelIds])
  const hasImageOnlyModels = modelIds.length !== allModelIds.length
  const [model, setModel] = useState(() => modelIds[0] ?? '')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ProviderProbeView | undefined>(undefined)
  const [failure, setFailure] = useState<string | undefined>(undefined)

  useEffect(() => {
    setModel(current => modelIds.includes(current) ? current : modelIds[0] ?? '')
  }, [modelIds])

  useEffect(() => {
    setResult(undefined)
    setFailure(undefined)
  }, [
    props.target.settingsNs,
    props.target.provider,
    props.target.baseURL,
    props.target.api,
    props.target.apiKey,
    model,
  ])

  const test = async (): Promise<void> => {
    if (model.length === 0) return
    setBusy(true)
    setResult(undefined)
    setFailure(undefined)
    try {
      const response = await props.api.llm.testProvider({ ...props.target, model })
      if (!response.result.ok) {
        setFailure(response.result.error.message)
        return
      }
      setResult(response.result.value.probe)
    } catch (error) {
      setFailure(messageOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles['probe']} aria-label={props.t('testConnection')}>
      <div className={styles['controls']}>
        <label className={styles['modelField']}>
          <span>{props.t('testModel')}</span>
          <select
            className={formStyles['selectInput']}
            value={model}
            disabled={props.disabled || busy || modelIds.length === 0}
            onChange={(event) => { setModel(event.target.value) }}
          >
            {modelIds.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <button
          type="button"
          disabled={props.disabled || busy || model.length === 0}
          onClick={() => { void test() }}
        >
          {busy ? props.t('testingConnection') : props.t('testConnection')}
        </button>
      </div>
      <p className={styles['quota']}>{props.t('testQuotaNotice')}</p>
      {hasImageOnlyModels ? <p className={styles['quota']}>{props.t('testTextModelsOnly')}</p> : null}
      {failure === undefined ? null : <p className={styles['failure']}>{failure}</p>}
      {result === undefined
        ? null
        : result.ok
          ? (
            <p className={styles['success']} role="status">
              <span>{props.t('testSucceeded')}</span>
              <span>{`${String(result.elapsedMs)} ms · ${props.t('testStageResponse')}`}</span>
            </p>
          )
          : (
            <p className={styles['failure']} role="status">
              <span>{result.message}</span>
              <span>{`${String(result.elapsedMs)} ms · ${props.t(`testStage${result.stage[0]?.toUpperCase()}${result.stage.slice(1)}` as keyof typeof en)}`}</span>
            </p>
          )}
    </section>
  )
}
