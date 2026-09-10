import { useEffect, useState, type ReactNode } from 'react'
import {
  Button, IconEditOutline16, IconPlusOutline16, IconTrashOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MemoryId, MemoryRecord, MemoryScope } from '@deepseek-ai/dsh-memory/types'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MemorySettingsState } from './store.ts'
import css from './MemorySection.module.css'

/** Registration-side state and operations for the memory page. */
export interface MemorySectionInjected {
  /** Controller retained for lifecycle and focused tests. */
  controller: object
  hooks: {
    /** Memory snapshot bound by the renderer as `useMemory`. */
    memory: SnapshotStore<MemorySettingsState>
  }
  load(cwd: string | undefined): Promise<void>
  setEnabled(enabled: boolean, cwd: string | undefined): Promise<boolean>
  add(request: { scope: MemoryScope; content: string }, cwd: string | undefined): Promise<boolean>
  update(id: MemoryId, content: string, cwd: string | undefined): Promise<boolean>
  remove(id: MemoryId, cwd: string | undefined): Promise<boolean>
}

/** Full props assembled by the Settings renderer. */
export type MemorySectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.memory'>
  & InjectFace<MemorySectionInjected>

interface RecordListProps {
  records: readonly MemoryRecord[]
  busy: boolean
  editing: MemoryId | undefined
  editDraft: string
  setEditDraft(value: string): void
  beginEdit(record: MemoryRecord): void
  cancelEdit(): void
  saveEdit(): void
  remove(record: MemoryRecord): void
  t: MemorySectionProps['t']
}

function RecordList(props: RecordListProps): ReactNode {
  if (props.records.length === 0) return <p className={css.empty}>{props.t('empty')}</p>
  return (
    <ul className={css.records}>
      {props.records.map(record => (
        <li key={record.id} className={css.record}>
          {props.editing === record.id ? (
            <div className={css.editor}>
              <textarea
                aria-label={props.t('editContent')}
                value={props.editDraft}
                disabled={props.busy}
                onChange={(event) => { props.setEditDraft(event.currentTarget.value) }}
              />
              <div className={css.editorActions}>
                <Button size="sm" variant="outline" disabled={props.busy} onClick={() => { props.cancelEdit() }}>
                  {props.t('cancel')}
                </Button>
                <Button size="sm" variant="primary" disabled={props.busy || props.editDraft.trim() === ''} onClick={() => { props.saveEdit() }}>
                  {props.busy ? props.t('saving') : props.t('save')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className={css.recordContent}>{record.content}</p>
              <div className={css.recordActions}>
                <button
                  type="button"
                  className={css.iconButton}
                  aria-label={`${props.t('edit')}: ${record.content}`}
                  title={props.t('edit')}
                  disabled={props.busy}
                  onClick={() => { props.beginEdit(record) }}
                >
                  <IconEditOutline16 size={14} />
                </button>
                <button
                  type="button"
                  className={`${css.iconButton} ${css.dangerButton}`}
                  aria-label={`${props.t('remove')}: ${record.content}`}
                  title={props.t('remove')}
                  disabled={props.busy}
                  onClick={() => { props.remove(record) }}
                >
                  <IconTrashOutline16 size={14} />
                </button>
              </div>
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Render durable memory controls grouped by global and current-project scope. */
export function MemorySection(props: MemorySectionProps): ReactNode {
  const {
    useMemory, useSessions, load, setEnabled, add, update, remove, t,
  } = props
  const state = useMemory(snapshot => snapshot)
  const cwd = useSessions((sessions) => {
    const current = sessions.current
    return current === undefined ? undefined : sessions.byId[current]?.cwd
  })
  const [scope, setScope] = useState<MemoryScope>('user')
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<MemoryId | undefined>()
  const [editDraft, setEditDraft] = useState('')

  useEffect(() => { void load(cwd) }, [cwd, load])
  useEffect(() => {
    if (cwd === undefined && scope === 'project') setScope('user')
  }, [cwd, scope])

  const busy = state.operation !== undefined
  const userRecords = state.records.filter(record => record.scope === 'user')
  const projectRecords = state.records.filter(record => record.scope === 'project')

  const submitAdd = (): void => {
    const content = draft.trim()
    void add({ scope, content }, cwd).then((stored) => {
      if (stored) setDraft('')
    })
  }

  const submitEdit = (): void => {
    if (editing === undefined) return
    void update(editing, editDraft.trim(), cwd).then((stored) => {
      if (stored) {
        setEditing(undefined)
        setEditDraft('')
      }
    })
  }

  if (state.status === 'idle' || state.status === 'loading') {
    return <div className={css.section} aria-busy="true"><p className={css.status}>{t('loading')}</p></div>
  }
  if (state.status === 'error') {
    return (
      <div className={css.section}>
        <h2 className={css.title}>{t('title')}</h2>
        <p className={css.error} role="alert">{t('loadError')}</p>
        <Button variant="outline" onClick={() => { void load(cwd) }}>{t('retry')}</Button>
      </div>
    )
  }

  const listProps = {
    busy,
    editing,
    editDraft,
    setEditDraft,
    beginEdit: (record: MemoryRecord) => {
      setEditing(record.id)
      setEditDraft(record.content)
    },
    cancelEdit: () => {
      setEditing(undefined)
      setEditDraft('')
    },
    saveEdit: submitEdit,
    remove: (record: MemoryRecord) => { void remove(record.id, cwd) },
    t,
  }

  return (
    <div className={css.section} aria-busy={busy}>
      <header className={css.header}>
        <h2 className={css.title}>{t('title')}</h2>
        <p className={css.intro}>{t('intro')}</p>
      </header>

      <label className={css.toggleRow}>
        <span className={css.toggleCopy}>
          <strong>{t('enabled')}</strong>
          <small>{t('enabledHint')}</small>
        </span>
        <input
          type="checkbox"
          role="checkbox"
          aria-label={t('enabled')}
          checked={state.enabled}
          disabled={busy}
          onChange={(event) => { void setEnabled(event.currentTarget.checked, cwd) }}
        />
      </label>

      {state.failure === undefined ? null : <p className={css.error} role="alert">{t('operationError')}</p>}

      <section className={css.group}>
        <div className={css.groupHeading}>
          <h3>{t('userMemory')}</h3>
          <p>{t('userHint')}</p>
        </div>
        <RecordList records={userRecords} {...listProps} />
      </section>

      <section className={css.group}>
        <div className={css.groupHeading}>
          <h3>{t('projectMemory')}</h3>
          <p>{t('projectHint')}</p>
        </div>
        {cwd === undefined
          ? <p className={css.notice}>{t('projectUnavailable')}</p>
          : <RecordList records={projectRecords} {...listProps} />}
      </section>

      <section className={css.addSection}>
        <h3>{t('addMemory')}</h3>
        <label className={css.field}>
          <span>{t('scope')}</span>
          <select value={scope} disabled={busy} onChange={(event) => { setScope(event.currentTarget.value as MemoryScope) }}>
            <option value="user">{t('userScope')}</option>
            <option value="project" disabled={cwd === undefined}>{t('projectScope')}</option>
          </select>
        </label>
        <label className={css.field}>
          <span>{t('content')}</span>
          <textarea
            aria-label={t('content')}
            value={draft}
            placeholder={t('contentPlaceholder')}
            disabled={busy}
            onChange={(event) => { setDraft(event.currentTarget.value) }}
          />
        </label>
        <div className={css.addActions}>
          <Button
            variant="primary"
            icon={<IconPlusOutline16 size={14} />}
            disabled={busy || draft.trim() === ''}
            onClick={submitAdd}
          >
            {state.operation === 'add' ? t('adding') : t('add')}
          </Button>
        </div>
      </section>
    </div>
  )
}
