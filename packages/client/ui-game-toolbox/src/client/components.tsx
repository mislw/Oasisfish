import { useState } from 'react'
import { IconCodeOutline16, IconListPenOutline16, IconSparkle16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TodoItem } from '@deepseek-ai/dsh-tool-todo/client'
import { projectStages, type ToolStageDefinition } from './model.ts'
import type { GameToolboxKey } from './locales.ts'
import css from './GameToolbox.module.css'

export type ToolboxInjected = { startUi: () => Promise<void>; startImage: () => Promise<void> }
export type ToolboxProps = PropsRuntime<'sidebar.toolbox'> & PropsLocale<'gameToolbox'> & ToolboxInjected

export function ToolboxPanel({ useSessions, useWorkspaces, startUi, startImage, t }: ToolboxProps) {
  const resumableUi = useSessions(s => s.ids.some(id => s.byId[id]?.agentPreset === 'game-ui'))
  const resumableImage = useSessions(s => s.ids.some(id => s.byId[id]?.agentPreset === 'game-image'))
  const hasWorkspace = useWorkspaces(s => s.items.length > 0)
  const [busy, setBusy] = useState<'ui' | 'image' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = (kind: 'ui' | 'image', start: () => Promise<void>): void => {
    if (busy !== null || !hasWorkspace) return
    setBusy(kind); setError(null)
    void start()
      .catch((reason: unknown) => { setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { setBusy(null) })
  }
  const pending: readonly [GameToolboxKey, GameToolboxKey][] = [
    ['lua', 'upcoming'],
    ['data', 'upcoming'],
    ['logs', 'upcoming'],
  ]
  return <div className={css.toolbox}>
    <div className={css.heading}>{t('title')}</div>
    <button type="button" className={css.tool} disabled={busy !== null || !hasWorkspace} onClick={() => { run('ui', startUi) }}>
      <span className={css.icon}><IconCodeOutline16 size={18} /></span>
      <span><span className={css.name}>{t('ui')}</span><span className={css.description}>{hasWorkspace ? t('uiDescription') : t('needsWorkspace')}</span></span>
      <span className={css.badge}>{busy === 'ui' ? t('starting') : resumableUi ? t('resume') : t('open')}</span>
    </button>
    <button type="button" className={css.tool} disabled={busy !== null || !hasWorkspace} onClick={() => { run('image', startImage) }}>
      <span className={css.icon}><IconSparkle16 size={18} /></span>
      <span><span className={css.name}>{t('image')}</span><span className={css.description}>{hasWorkspace ? t('imageDescription') : t('needsWorkspace')}</span></span>
      <span className={css.badge}>{busy === 'image' ? t('starting') : resumableImage ? t('resume') : t('open')}</span>
    </button>
    {pending.map(([name, badge]) => <button key={name} type="button" className={css.tool} disabled>
      <span className={css.icon}><IconListPenOutline16 size={18} /></span>
      <span className={css.name}>{t(name)}</span>
      <span className={css.badge}>{t(badge)}</span>
    </button>)}
    {error !== null && <p className={css.error} role="alert">{error}</p>}
  </div>
}

type SessionSurfaceProps = PropsRuntime<'conversation.session.header.progress'> & PropsLocale<'gameToolbox'> & {
  agentPreset: string
  stages: readonly ToolStageDefinition[]
  openDetails: () => void
}

function useToolSession(props: SessionSurfaceProps): { active: boolean; todos: readonly TodoItem[] | null | undefined } {
  const active = props.useSessions(s => s.byId[props.sessionId]?.agentPreset === props.agentPreset)
  const todos = props.useProjection('todos') as readonly TodoItem[] | null | undefined
  return { active, todos }
}

export function StageStrip(props: SessionSurfaceProps) {
  const { active, todos } = useToolSession(props)
  if (!active) return null
  return (
    <button
      type="button"
      className={`${css.stages} ${css.detailsButton}`}
      data-stage-count={props.stages.length}
      aria-label={props.t('details')}
      onClick={props.openDetails}
    >
      {projectStages(todos, props.stages).map(stage => (
        <span key={stage.id} className={css.stage} data-status={stage.status}>{stage.label}</span>
      ))}
    </button>
  )
}

export function ToolchainDetails(props: SessionSurfaceProps) {
  const { active, todos } = useToolSession(props)
  if (!active) return null
  const stages = projectStages(todos, props.stages)
  const current = stages.find(stage => stage.status === 'in_progress')
    ?? stages.find(stage => stage.status === 'pending')
    ?? stages.at(-1)
  if (current === undefined) return null
  return <section className={css.details}>
    <div><h3>{props.t('current')}</h3><div className={css.current}>{current.label}</div></div>
    <div><h3>{props.t('artifacts')}</h3>
      {todos == null ? <p className={css.description}>{props.t('noArtifacts')}</p> : <ul className={css.checklist}>{todos.map((item, index) => <li key={`${index}-${item.content}`} data-status={item.status}><span>{item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '●' : '○'}</span><span>{item.content}</span></li>)}</ul>}
    </div>
  </section>
}
