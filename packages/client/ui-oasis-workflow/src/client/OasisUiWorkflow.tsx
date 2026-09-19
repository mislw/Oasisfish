import { useEffect, useState, useSyncExternalStore, type ClipboardEvent } from 'react'
import type { ImageAttachmentLimits } from '@deepseek-ai/dsh-attachment'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { OasisUiLauncherStore, type OasisUiLaunchTarget } from './launcher-store.ts'
import {
  buildOasisUiStagePrompt, OASIS_UI_STAGES, type OasisUiLaunchRequest,
  type OasisUiMode, type OasisUiSource,
} from './workflow.ts'
import css from './OasisUiWorkflow.module.css'

export interface OasisUiOverlayInjected {
  readonly launcher: OasisUiLauncherStore
}

export interface OasisUiLauncherInjected extends OasisUiOverlayInjected {
  readonly addFiles: (files: readonly File[], limits?: ImageAttachmentLimits) => string | null
}

export type OasisUiLauncherButtonProps =
  PropsRuntime<'conversation.input.left'> & OasisUiLauncherInjected

export function OasisUiLauncherButton({
  launcher, addFiles, input, inputActions, sessionId, useProjection,
}: OasisUiLauncherButtonProps) {
  const busy = input.phase !== 'plain'
  const imageLimits = useProjection('imageLimits')
  return (
    <button
      type="button"
      className={css.launcherButton}
      aria-label="打开 Oasis UI 生图工具链"
      title="Oasis UI 生图工具链"
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
      <span>UI 生图</span>
    </button>
  )
}

const SOURCE_OPTIONS: ReadonlyArray<{ value: OasisUiSource; title: string; detail: string }> = [
  { value: 'generate', title: '生成新 UI', detail: '从项目风格、参考图和 UI Tree 开始' },
  { value: 'existing', title: '使用已有图', detail: '对当前附件或已有图片进入视觉确认' },
  { value: 'continue', title: '继续现有任务', detail: '从真实文件与对话重新发现当前阶段' },
]

const INITIAL: OasisUiLaunchRequest = {
  source: 'generate',
  pageName: '',
  purpose: '',
  references: '',
  constraints: '',
}

export function OasisUiWorkflowOverlay({ launcher }: OasisUiOverlayInjected) {
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
  return <OasisUiWorkflowDialog key={snapshot.target.sessionId} launcher={launcher} target={snapshot.target} />
}

interface OasisUiWorkflowDialogProps {
  readonly launcher: OasisUiLauncherStore
  readonly target: OasisUiLaunchTarget
}

function OasisUiWorkflowDialog({ launcher, target }: OasisUiWorkflowDialogProps) {
  const progress = useSyncExternalStore(
    target.progress.subscribe, target.progress.getSnapshot, target.progress.getSnapshot)
  const [form, setForm] = useState<OasisUiLaunchRequest>(progress.request ?? INITIAL)
  const [textBrief, setTextBrief] = useState(progress.request?.purpose ?? '')
  const [feedback, setFeedback] = useState('')
  const [pastedFiles, setPastedFiles] = useState<readonly string[]>([])
  const [pasteError, setPasteError] = useState<string | null>(null)
  const stage = OASIS_UI_STAGES[progress.currentStage]
  if (stage === undefined) return null

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
      feedback: feedback.trim() || '请根据我接下来在对话中补充的意见继续修改当前阶段。',
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
    setPastedFiles(current => [...current, ...files.map(file => file.name || '剪贴板图片')])
    if (form.references.trim() === '') {
      update('references', '已从剪贴板粘贴参考图，并作为当前消息附件提交')
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
            <div className={css.eyebrow}>OASIS WIKI · REDCLIFF</div>
            <h2 id="oasis-ui-title">UI 生图工具链</h2>
            <p>每次只推进一个可验收阶段，由你确认后才解锁下一步。</p>
          </div>
          <button type="button" className={css.closeButton} aria-label="关闭" onClick={() => { launcher.close() }}>×</button>
        </header>

        <div className={css.body}>
          {progress.mode === null ? (
            <ModeChoice onSelect={(mode) => { target.progress.selectMode(mode) }} />
          ) : (
            <>
              <StageRail currentStage={progress.currentStage} status={progress.status} />
              <section className={css.progressPanel} aria-labelledby="oasis-current-stage">
                <div className={css.progressHeading}>
                  <div>
                    <span className={css.stepCount}>第 {progress.currentStage + 1}/{OASIS_UI_STAGES.length} 步</span>
                    <h3 id="oasis-current-stage">{stage.name}</h3>
                  </div>
                  <span className={progress.status === 'awaiting_confirmation' ? css.statusWaiting : css.statusReady}>
                    {progress.status === 'ready' ? '准备开始' : progress.status === 'complete' ? '流程已完成' : '等待你确认'}
                  </span>
                </div>
                <div className={css.responsibilityGrid}>
                  <StageDetail title="Agent 要做什么" text={stage.agentWork} />
                  <StageDetail title="你要检查什么" text={stage.userAcceptance} />
                  <StageDetail title="预期产物" text={stage.expectedOutput} />
                </div>
              </section>

              {progress.status === 'ready' && progress.currentStage === 0 && progress.mode === 'desktop' && (
                <DesktopFirstStage
                  form={form}
                  pastedFiles={pastedFiles}
                  pasteError={pasteError}
                  update={update}
                />
              )}
              {progress.status === 'ready' && progress.currentStage === 0 && progress.mode === 'text' && (
                <TextFirstStage form={form} textBrief={textBrief} update={update} setTextBrief={setTextBrief} />
              )}
              {progress.status === 'ready' && progress.currentStage > 0 && progress.request !== null && (
                <TaskSummary request={progress.request} />
              )}
              {progress.status === 'awaiting_confirmation' && (
                <div className={css.confirmPanel}>
                  <label>
                    <span>需要修改的内容</span>
                    <textarea
                      value={feedback}
                      rows={3}
                      placeholder="写下本阶段需要调整的地方；留空时会在聊天中继续补充"
                      onChange={(event) => { setFeedback(event.target.value) }}
                    />
                  </label>
                  <p>只有你点击确认后，工具才会进入下一步。Agent 的回复本身不会自动推进进度。</p>
                </div>
              )}
              {progress.status === 'complete' && (
                <div className={css.completePanel}>
                  <strong>8 个阶段均已由你确认</strong>
                  <span>这里记录的是确认进度；最终验收仍以真实文件、编辑器、PIE 和多人验证证据为准。</span>
                </div>
              )}

              <aside className={css.guardrail}>
                <strong>工具链边界</strong>
                <span>正式生图只使用可验证的 image_gen；工具不会伪造图片、图层、Cowart 状态，也不会自动写入 UGC 资产。</span>
              </aside>
              {target.draft.trim() !== '' && progress.status !== 'complete' && (
                <p className={css.warning}>当前输入框已有草稿。本次操作会用当前阶段请求替换它。</p>
              )}
            </>
          )}
        </div>

        <footer className={css.footer}>
          <button type="button" className={css.secondaryButton} onClick={() => { launcher.close() }}>关闭</button>
          {progress.mode !== null && progress.status === 'ready' && (
            <>
              <button type="button" className={css.secondaryButton} disabled={!ready} onClick={() => { sendStage(false) }}>仅填入输入框</button>
              <button type="button" className={css.primaryButton} disabled={!ready} onClick={() => { sendStage(true) }}>开始本阶段</button>
            </>
          )}
          {progress.status === 'awaiting_confirmation' && (
            <>
              <button type="button" className={css.secondaryButton} onClick={sendRevision}>需要修改</button>
              <button
                type="button"
                className={css.primaryButton}
                onClick={() => { target.progress.confirmStage(); setFeedback('') }}
              >
                确认通过并进入下一步
              </button>
            </>
          )}
          {progress.status === 'complete' && (
            <button type="button" className={css.secondaryButton} onClick={() => { target.progress.reset() }}>重新开始流程</button>
          )}
        </footer>
      </section>
    </div>
  )
}

function ModeChoice({ onSelect }: { readonly onSelect: (mode: OasisUiMode) => void }) {
  return (
    <section className={css.modeSection} aria-labelledby="oasis-mode-title">
      <div>
        <span className={css.stepCount}>开始前选择操作方式</span>
        <h3 id="oasis-mode-title">你想用哪种导航？</h3>
        <p>两种模式使用同一套 8 阶段门禁，区别只是输入方式和界面密度。</p>
      </div>
      <div className={css.modeGrid}>
        <button type="button" className={css.modeButton} aria-label="文字导航版" onClick={() => { onSelect('text') }}>
          <strong>文字导航版</strong>
          <span>只填写任务名称和当前情况，Agent 在聊天中逐项引导，适合边沟通边确认。</span>
          <em>更轻量</em>
        </button>
        <button type="button" className={css.modeButton} aria-label="UI 桌面版" onClick={() => { onSelect('desktop') }}>
          <strong>UI 桌面版</strong>
          <span>集中填写来源、页面目的、参考图和约束，适合信息已经比较完整的任务。</span>
          <em>信息更完整</em>
        </button>
      </div>
    </section>
  )
}

function StageRail({
  currentStage, status,
}: { readonly currentStage: number; readonly status: 'ready' | 'awaiting_confirmation' | 'complete' }) {
  return (
    <div className={css.stageRail} aria-label="工作流阶段">
      {OASIS_UI_STAGES.map((item, index) => {
        const complete = index < currentStage || (status === 'complete' && index === currentStage)
        const className = complete ? css.stageComplete : index === currentStage ? css.stageCurrent : css.stage
        return <div className={className} key={item.name}><span>{complete ? '✓' : index + 1}</span>{item.name}</div>
      })}
    </div>
  )
}

function StageDetail({ title, text }: { readonly title: string; readonly text: string }) {
  return <div className={css.stageDetail}><strong>{title}</strong><span>{text}</span></div>
}

interface FirstStageProps {
  readonly form: OasisUiLaunchRequest
  readonly update: <K extends keyof OasisUiLaunchRequest>(key: K, value: OasisUiLaunchRequest[K]) => void
}

function SourceOptions({ form, update }: FirstStageProps) {
  return (
    <fieldset className={css.sourceGrid}>
      <legend>从哪里开始</legend>
      {SOURCE_OPTIONS.map(option => (
        <label className={form.source === option.value ? css.sourceActive : css.sourceCard} key={option.value}>
          <input
            type="radio"
            name="oasis-ui-source"
            value={option.value}
            checked={form.source === option.value}
            onChange={() => { update('source', option.value) }}
          />
          <strong>{option.title}</strong>
          <span>{option.detail}</span>
        </label>
      ))}
    </fieldset>
  )
}

function DesktopFirstStage({
  form, update, pastedFiles, pasteError,
}: FirstStageProps & { readonly pastedFiles: readonly string[]; readonly pasteError: string | null }) {
  return (
    <>
      <SourceOptions form={form} update={update} />
      {form.source === 'existing' && (
        <div className={css.pasteZone} tabIndex={0} aria-label="粘贴已有 UI 图片">
          <span className={css.pasteIcon} aria-hidden="true">▣</span>
          <div>
            <strong>直接粘贴已有 UI 图</strong>
            <span>点击这里后按 Ctrl+V，或在这个面板任意位置粘贴剪贴板图片</span>
            {pastedFiles.length > 0 && <em>已添加 {pastedFiles.length} 张：{pastedFiles.join('、')}</em>}
            {pasteError !== null && <em className={css.pasteError}>{pasteError}</em>}
          </div>
        </div>
      )}
      <div className={css.formGrid}>
        <label>
          <span>页面名称 <b>*</b></span>
          <input autoFocus value={form.pageName} placeholder="例如：城防塔升级界面" onChange={(event) => { update('pageName', event.target.value) }} />
        </label>
        <label>
          <span>页面目的</span>
          <input value={form.purpose} placeholder="例如：选择防御塔并展示升级消耗" onChange={(event) => { update('purpose', event.target.value) }} />
        </label>
        <label className={css.fullWidth}>
          <span>参考图或现有产物</span>
          <textarea value={form.references} placeholder="可填写文件路径；聊天里的图片请先用输入框附件按钮添加" rows={3} onChange={(event) => { update('references', event.target.value) }} />
        </label>
        <label className={css.fullWidth}>
          <span>额外约束</span>
          <textarea value={form.constraints} placeholder="留空时默认使用 RedCliff 风格，并保持文字、数值、进度和点击区为 Native" rows={3} onChange={(event) => { update('constraints', event.target.value) }} />
        </label>
      </div>
    </>
  )
}

function TextFirstStage({
  form, textBrief, update, setTextBrief,
}: FirstStageProps & { readonly textBrief: string; readonly setTextBrief: (value: string) => void }) {
  return (
    <div className={css.textForm}>
      <SourceOptions form={form} update={update} />
      <label>
        <span>任务名称 <b>*</b></span>
        <input autoFocus value={form.pageName} placeholder="例如：龙玉交换系统" onChange={(event) => { update('pageName', event.target.value) }} />
      </label>
      <label>
        <span>你现在有什么、想做到什么</span>
        <textarea
          value={textBrief}
          rows={5}
          placeholder="告诉 Agent 你已有的内容、想做的页面和最重要的限制"
          onChange={(event) => { setTextBrief(event.target.value) }}
        />
      </label>
      <p>开始后，Agent 会先整理来源并只询问当前真正缺失的一个关键问题。</p>
    </div>
  )
}

function TaskSummary({ request }: { readonly request: OasisUiLaunchRequest }) {
  return (
    <dl className={css.taskSummary}>
      <div><dt>当前任务</dt><dd>{request.pageName}</dd></div>
      <div><dt>页面目的</dt><dd>{request.purpose || '由 Agent 从上下文推断'}</dd></div>
      <div><dt>参考产物</dt><dd>{request.references || '使用当前会话附件与已确认产物'}</dd></div>
    </dl>
  )
}
