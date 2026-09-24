import { useEffect, useState, useSyncExternalStore, type ClipboardEvent } from 'react'
import type { ImageAttachmentLimits } from '@deepseek-ai/dsh-attachment'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { OasisUiLauncherStore, type OasisUiLaunchTarget } from './launcher-store.ts'
import {
  buildOasisUiStagePrompt, OASIS_UI_PASTED_REFERENCE, OASIS_UI_REVISION_FOLLOW_UP,
  OASIS_UI_STAGES, type OasisUiLaunchRequest, type OasisUiMode, type OasisUiSource,
} from '../workflow.ts'
import { NS, OASIS_UI_STAGE_LOCALE_KEYS, type OasisUiLocaleKey } from './locales.ts'
import css from './OasisUiWorkflow.module.css'

export interface OasisUiOverlayInjected {
  readonly launcher: OasisUiLauncherStore
}

export interface OasisUiLauncherInjected extends OasisUiOverlayInjected {
  readonly addFiles: (files: readonly File[], limits?: ImageAttachmentLimits) => string | null
}

export type OasisUiLauncherButtonProps =
  PropsRuntime<'conversation.input.left'> & OasisUiLauncherInjected & PropsLocale<typeof NS>

export type OasisUiWorkflowOverlayProps = OasisUiOverlayInjected & PropsLocale<typeof NS>

type OasisUiTranslate = PropsLocale<typeof NS>['t']

export function OasisUiLauncherButton({
  launcher, addFiles, useInput, inputActions, sessionId, t, useProjection,
}: OasisUiLauncherButtonProps) {
  const input = useInput(value => value)
  const busy = input.phase !== 'plain'
  const imageLimits = useProjection('imageLimits')
  return (
    <button
      type="button"
      className={css.launcherButton}
      aria-label={t('launcher.open')}
      title={t('launcher.title')}
      disabled={busy}
      onClick={() => {
        launcher.open({
          sessionId,
          inputActions,
          draft: input.draft,
          addFiles: files => addFiles(files, imageLimits),
        })
      }}
    >
      <span className={css.sparkle} aria-hidden="true">✦</span>
      <span>{t('launcher.short')}</span>
    </button>
  )
}

const SOURCE_OPTIONS = [
  { value: 'generate', title: 'source.generate.title', detail: 'source.generate.detail' },
  { value: 'existing', title: 'source.existing.title', detail: 'source.existing.detail' },
  { value: 'continue', title: 'source.continue.title', detail: 'source.continue.detail' },
] as const satisfies ReadonlyArray<{
  readonly value: OasisUiSource
  readonly title: OasisUiLocaleKey
  readonly detail: OasisUiLocaleKey
}>

const INITIAL: OasisUiLaunchRequest = {
  source: 'generate',
  pageName: '',
  purpose: '',
  references: '',
  constraints: '',
}

export function OasisUiWorkflowOverlay({ launcher, t }: OasisUiWorkflowOverlayProps) {
  const snapshot = useSyncExternalStore(launcher.subscribe, launcher.getSnapshot, launcher.getSnapshot)

  useEffect(() => {
    if (!snapshot.open) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') launcher.close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [launcher, snapshot.open])

  if (!snapshot.open || snapshot.target === null) return null
  return <OasisUiWorkflowDialog key={snapshot.target.sessionId} launcher={launcher} target={snapshot.target} t={t} />
}

interface OasisUiWorkflowDialogProps {
  readonly launcher: OasisUiLauncherStore
  readonly target: OasisUiLaunchTarget
  readonly t: OasisUiTranslate
}

function OasisUiWorkflowDialog({ launcher, target, t }: OasisUiWorkflowDialogProps) {
  const progress = useSyncExternalStore(
    target.progress.subscribe, target.progress.getSnapshot, target.progress.getSnapshot)
  const [form, setForm] = useState<OasisUiLaunchRequest>(progress.request ?? INITIAL)
  const [textBrief, setTextBrief] = useState(progress.request?.purpose ?? '')
  const [feedback, setFeedback] = useState('')
  const [pastedFiles, setPastedFiles] = useState<readonly string[]>([])
  const [pasteError, setPasteError] = useState<string | null>(null)
  const modelStage = OASIS_UI_STAGES[progress.currentStage]
  const stage = OASIS_UI_STAGE_LOCALE_KEYS[progress.currentStage]
  if (modelStage === undefined || stage === undefined) return null

  const update = <K extends keyof OasisUiLaunchRequest>(key: K, value: OasisUiLaunchRequest[K]) => {
    setForm(current => ({ ...current, [key]: value }))
  }
  const stageRequest = (): OasisUiLaunchRequest | null => {
    if (progress.currentStage > 0) return progress.request
    if (progress.mode === 'text') return { ...form, purpose: textBrief }
    return form
  }
  const ready = progress.currentStage > 0
    ? progress.request !== null
    : form.pageName.trim() !== ''
  const sendStage = (submit: boolean) => {
    const request = stageRequest()
    if (!ready || request === null || progress.mode === null) return
    target.inputActions.setDraft(buildOasisUiStagePrompt({
      mode: progress.mode,
      stageIndex: progress.currentStage,
      request,
    }))
    if (submit) target.progress.startStage(progress.currentStage === 0 ? request : undefined)
    launcher.close()
    if (submit) target.inputActions.submit()
  }
  const sendRevision = () => {
    if (progress.mode === null || progress.request === null) return
    target.inputActions.setDraft(buildOasisUiStagePrompt({
      mode: progress.mode,
      stageIndex: progress.currentStage,
      request: progress.request,
      feedback: feedback.trim() || OASIS_UI_REVISION_FOLLOW_UP,
    }))
    launcher.close()
    target.inputActions.submit()
  }
  const pasteImages = (event: ClipboardEvent<HTMLElement>) => {
    if (progress.mode !== 'desktop' || form.source !== 'existing') return
    const files = [...event.clipboardData.items]
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((file): file is File => file !== null)
    if (files.length === 0) return
    event.preventDefault()
    const error = target.addFiles(files)
    if (error !== null) {
      setPasteError(error)
      return
    }
    setPasteError(null)
    setPastedFiles(current => [...current, ...files.map(file => file.name || t('paste.unnamedFile'))])
    if (form.references.trim() === '') {
      update('references', OASIS_UI_PASTED_REFERENCE)
    }
  }

  return (
    <div
      className={css.backdrop}
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) launcher.close() }}
    >
      <section className={css.dialog} role="dialog" aria-modal="true" aria-labelledby="oasis-ui-title" onPaste={pasteImages}>
        <header className={css.header}>
          <div>
            <div className={css.eyebrow}>{t('dialog.brand')}</div>
            <h2 id="oasis-ui-title">{t('dialog.title')}</h2>
            <p>{t('dialog.subtitle')}</p>
          </div>
          <button type="button" className={css.closeButton} aria-label={t('close')} onClick={() => { launcher.close() }}>×</button>
        </header>

        <div className={css.body}>
          {progress.mode === null ? (
            <ModeChoice onSelect={(mode) => { target.progress.selectMode(mode) }} t={t} />
          ) : (
            <>
              <StageRail currentStage={progress.currentStage} status={progress.status} t={t} />
              <section className={css.progressPanel} aria-labelledby="oasis-current-stage">
                <div className={css.progressHeading}>
                  <div>
                    <span className={css.stepCount}>{t('step.count', { current: progress.currentStage + 1, total: OASIS_UI_STAGES.length })}</span>
                    <h3 id="oasis-current-stage">{t(stage.name)}</h3>
                  </div>
                  <span className={progress.status === 'awaiting_confirmation' ? css.statusWaiting : css.statusReady}>
                    {progress.status === 'ready'
                      ? t('status.ready')
                      : progress.status === 'complete'
                        ? t('status.complete')
                        : t('status.waiting')}
                  </span>
                </div>
                <div className={css.responsibilityGrid}>
                  <StageDetail title={t('stage.agentWork')} text={t(stage.agentWork)} />
                  <StageDetail title={t('stage.userAcceptance')} text={t(stage.userAcceptance)} />
                  <StageDetail title={t('stage.expectedOutput')} text={t(stage.expectedOutput)} />
                </div>
              </section>

              {progress.status === 'ready' && progress.currentStage === 0 && progress.mode === 'desktop' && (
                <DesktopFirstStage
                  form={form}
                  pastedFiles={pastedFiles}
                  pasteError={pasteError}
                  t={t}
                  update={update}
                />
              )}
              {progress.status === 'ready' && progress.currentStage === 0 && progress.mode === 'text' && (
                <TextFirstStage form={form} textBrief={textBrief} update={update} setTextBrief={setTextBrief} t={t} />
              )}
              {progress.status === 'ready' && progress.currentStage > 0 && progress.request !== null && (
                <TaskSummary request={progress.request} t={t} />
              )}
              {progress.status === 'awaiting_confirmation' && (
                <div className={css.confirmPanel}>
                  <label>
                    <span>{t('feedback.label')}</span>
                    <textarea
                      value={feedback}
                      rows={3}
                      placeholder={t('feedback.placeholder')}
                      onChange={(event) => { setFeedback(event.target.value) }}
                    />
                  </label>
                  <p>{t('feedback.hint')}</p>
                </div>
              )}
              {progress.status === 'complete' && (
                <div className={css.completePanel}>
                  <strong>{t('complete.title')}</strong>
                  <span>{t('complete.detail')}</span>
                </div>
              )}

              <aside className={css.guardrail}>
                <strong>{t('guardrail.title')}</strong>
                <span>{t('guardrail.detail')}</span>
              </aside>
              {target.draft.trim() !== '' && progress.status !== 'complete' && (
                <p className={css.warning}>{t('draft.warning')}</p>
              )}
            </>
          )}
        </div>

        <footer className={css.footer}>
          <button type="button" className={css.secondaryButton} onClick={() => { launcher.close() }}>{t('close')}</button>
          {progress.mode !== null && progress.status === 'ready' && (
            <>
              <button type="button" className={css.secondaryButton} disabled={!ready} onClick={() => { sendStage(false) }}>{t('action.fillDraft')}</button>
              <button type="button" className={css.primaryButton} disabled={!ready} onClick={() => { sendStage(true) }}>{t('action.startStage')}</button>
            </>
          )}
          {progress.status === 'awaiting_confirmation' && (
            <>
              <button type="button" className={css.secondaryButton} onClick={sendRevision}>{t('action.revise')}</button>
              <button
                type="button"
                className={css.primaryButton}
                onClick={() => { target.progress.confirmStage(); setFeedback('') }}
              >
                {t('action.confirm')}
              </button>
            </>
          )}
          {progress.status === 'complete' && (
            <button type="button" className={css.secondaryButton} onClick={() => { target.progress.reset() }}>{t('action.restart')}</button>
          )}
        </footer>
      </section>
    </div>
  )
}

function ModeChoice({ onSelect, t }: {
  readonly onSelect: (mode: OasisUiMode) => void
  readonly t: OasisUiTranslate
}) {
  return (
    <section className={css.modeSection} aria-labelledby="oasis-mode-title">
      <div>
        <span className={css.stepCount}>{t('mode.kicker')}</span>
        <h3 id="oasis-mode-title">{t('mode.title')}</h3>
        <p>{t('mode.detail')}</p>
      </div>
      <div className={css.modeGrid}>
        <button type="button" className={css.modeButton} aria-label={t('mode.text.title')} onClick={() => { onSelect('text') }}>
          <strong>{t('mode.text.title')}</strong>
          <span>{t('mode.text.detail')}</span>
          <em>{t('mode.text.badge')}</em>
        </button>
        <button type="button" className={css.modeButton} aria-label={t('mode.desktop.title')} onClick={() => { onSelect('desktop') }}>
          <strong>{t('mode.desktop.title')}</strong>
          <span>{t('mode.desktop.detail')}</span>
          <em>{t('mode.desktop.badge')}</em>
        </button>
      </div>
    </section>
  )
}

function StageRail({
  currentStage, status, t,
}: {
  readonly currentStage: number
  readonly status: 'ready' | 'awaiting_confirmation' | 'complete'
  readonly t: OasisUiTranslate
}) {
  return (
    <div className={css.stageRail} aria-label={t('stageRail.label')}>
      {OASIS_UI_STAGE_LOCALE_KEYS.map((item, index) => {
        const complete = index < currentStage || (status === 'complete' && index === currentStage)
        const className = complete ? css.stageComplete : index === currentStage ? css.stageCurrent : css.stage
        return <div className={className} key={item.name}><span>{complete ? '✓' : index + 1}</span>{t(item.name)}</div>
      })}
    </div>
  )
}

function StageDetail({ title, text }: { readonly title: string; readonly text: string }) {
  return <div className={css.stageDetail}><strong>{title}</strong><span>{text}</span></div>
}

interface FirstStageProps {
  readonly form: OasisUiLaunchRequest
  readonly t: OasisUiTranslate
  readonly update: <K extends keyof OasisUiLaunchRequest>(key: K, value: OasisUiLaunchRequest[K]) => void
}

function SourceOptions({ form, t, update }: FirstStageProps) {
  return (
    <fieldset className={css.sourceGrid}>
      <legend>{t('source.legend')}</legend>
      {SOURCE_OPTIONS.map(option => (
        <label className={form.source === option.value ? css.sourceActive : css.sourceCard} key={option.value}>
          <input
            type="radio"
            name="oasis-ui-source"
            value={option.value}
            checked={form.source === option.value}
            onChange={() => { update('source', option.value) }}
          />
          <strong>{t(option.title)}</strong>
          <span>{t(option.detail)}</span>
        </label>
      ))}
    </fieldset>
  )
}

function DesktopFirstStage({
  form, update, pastedFiles, pasteError, t,
}: FirstStageProps & { readonly pastedFiles: readonly string[]; readonly pasteError: string | null }) {
  return (
    <>
      <SourceOptions form={form} t={t} update={update} />
      {form.source === 'existing' && (
        <div className={css.pasteZone} tabIndex={0} aria-label={t('paste.label')}>
          <span className={css.pasteIcon} aria-hidden="true">▣</span>
          <div>
            <strong>{t('paste.title')}</strong>
            <span>{t('paste.detail')}</span>
            {pastedFiles.length > 0 && <em>{t('paste.added', { count: pastedFiles.length, names: pastedFiles.join('、') })}</em>}
            {pasteError !== null && <em className={css.pasteError}>{pasteError}</em>}
          </div>
        </div>
      )}
      <div className={css.formGrid}>
        <label>
          <span>{t('form.pageName')} <b>*</b></span>
          <input autoFocus value={form.pageName} placeholder={t('form.pageNamePlaceholder')} onChange={(event) => { update('pageName', event.target.value) }} />
        </label>
        <label>
          <span>{t('form.purpose')}</span>
          <input value={form.purpose} placeholder={t('form.purposePlaceholder')} onChange={(event) => { update('purpose', event.target.value) }} />
        </label>
        <label className={css.fullWidth}>
          <span>{t('form.references')}</span>
          <textarea value={form.references} placeholder={t('form.referencesPlaceholder')} rows={3} onChange={(event) => { update('references', event.target.value) }} />
        </label>
        <label className={css.fullWidth}>
          <span>{t('form.constraints')}</span>
          <textarea value={form.constraints} placeholder={t('form.constraintsPlaceholder')} rows={3} onChange={(event) => { update('constraints', event.target.value) }} />
        </label>
      </div>
    </>
  )
}

function TextFirstStage({
  form, textBrief, update, setTextBrief, t,
}: FirstStageProps & { readonly textBrief: string; readonly setTextBrief: (value: string) => void }) {
  return (
    <div className={css.textForm}>
      <SourceOptions form={form} t={t} update={update} />
      <label>
        <span>{t('text.taskName')} <b>*</b></span>
        <input autoFocus value={form.pageName} placeholder={t('text.taskNamePlaceholder')} onChange={(event) => { update('pageName', event.target.value) }} />
      </label>
      <label>
        <span>{t('text.brief')}</span>
        <textarea
          value={textBrief}
          rows={5}
          placeholder={t('text.briefPlaceholder')}
          onChange={(event) => { setTextBrief(event.target.value) }}
        />
      </label>
      <p>{t('text.hint')}</p>
    </div>
  )
}

function TaskSummary({ request, t }: { readonly request: OasisUiLaunchRequest; readonly t: OasisUiTranslate }) {
  return (
    <dl className={css.taskSummary}>
      <div><dt>{t('summary.task')}</dt><dd>{request.pageName}</dd></div>
      <div><dt>{t('summary.purpose')}</dt><dd>{request.purpose || t('summary.purposeFallback')}</dd></div>
      <div><dt>{t('summary.references')}</dt><dd>{request.references || t('summary.referencesFallback')}</dd></div>
    </dl>
  )
}
