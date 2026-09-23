/** Interactive Settings preview for the proposed Codex Bridge workflow. */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Button,
  Checkbox,
  IconCheckOutline16,
  IconCopyOutline16,
  IconLinkOutline16,
  IconPlayOutline16,
  IconStopFill16,
  Pill,
  StateDot,
  Switch,
  Tag,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './CodexBridgeSection.module.css'

type ConnectionState = 'disconnected' | 'connecting' | 'connected'
type RunState = 'running' | 'completed' | 'cancelled'

/** Full component props assembled by the Settings slot renderer. */
export type CodexBridgeSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.codexBridge'>

/** Clear one optional timer and erase its current handle. */
function clearTimer(timer: { current: ReturnType<typeof setTimeout> | undefined }): void {
  if (timer.current !== undefined) clearTimeout(timer.current)
  timer.current = undefined
}

/** Render the interactive Codex Bridge Settings preview. */
export function CodexBridgeSection({ t }: CodexBridgeSectionProps): ReactNode {
  const [connection, setConnection] = useState<ConnectionState>('disconnected')
  const [permission, setPermission] = useState<'read' | 'write'>('read')
  const [autoDelegate, setAutoDelegate] = useState(true)
  const [primaryWorkspace, setPrimaryWorkspace] = useState(true)
  const [docsWorkspace, setDocsWorkspace] = useState(false)
  const [model, setModel] = useState('fast')
  const [copied, setCopied] = useState(false)
  const [run, setRun] = useState<RunState | undefined>(undefined)
  const [sessionOpen, setSessionOpen] = useState(false)
  const connectionTimer = useRef<ReturnType<typeof setTimeout>>()
  const runTimer = useRef<ReturnType<typeof setTimeout>>()
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => {
    clearTimer(connectionTimer)
    clearTimer(runTimer)
    clearTimer(copiedTimer)
  }, [])

  const connect = (): void => {
    clearTimer(connectionTimer)
    setConnection('connecting')
    connectionTimer.current = setTimeout(() => {
      connectionTimer.current = undefined
      setConnection('connected')
    }, 850)
  }

  const disconnect = (): void => {
    clearTimer(connectionTimer)
    clearTimer(runTimer)
    setConnection('disconnected')
    setRun(undefined)
    setSessionOpen(false)
  }

  const startRun = (): void => {
    clearTimer(runTimer)
    setRun('running')
    setSessionOpen(false)
    runTimer.current = setTimeout(() => {
      runTimer.current = undefined
      setRun('completed')
    }, 2200)
  }

  const cancelRun = (): void => {
    clearTimer(runTimer)
    setRun('cancelled')
  }

  const endpoint = 'http://127.0.0.1:3080/api/integrations/codex/mcp'
  const status = connection === 'connected'
    ? { dot: 'done' as const, label: t('connected'), detail: t('connectionDetailConnected') }
    : connection === 'connecting'
      ? { dot: 'ongoing' as const, label: t('connecting'), detail: t('connectionDetailConnecting') }
      : { dot: 'idle' as const, label: t('disconnected'), detail: t('connectionDetailDisconnected') }

  return (
    <div className={css.section} data-codex-bridge-preview="">
      <header className={css.pageHeader}>
        <span className={css.headingLine}>
          <h2>{t('title')}</h2>
          <Tag tone="info">{t('preview')}</Tag>
        </span>
        <p>{t('previewNotice')}</p>
      </header>

      <section className={css.block} aria-labelledby="codex-connection-title">
        <div className={css.blockHead}>
          <div>
            <h3 id="codex-connection-title">{t('connectionTitle')}</h3>
            <span className={css.statusLine} role="status" aria-live="polite">
              <StateDot state={status.dot} />
              <strong>{status.label}</strong>
              <span>{status.detail}</span>
            </span>
          </div>
          {connection === 'connected'
            ? <Button variant="outline" size="sm" onClick={disconnect}>{t('disconnect')}</Button>
            : (
              <Button
                variant="primary"
                size="sm"
                icon={<IconLinkOutline16 size={14} />}
                disabled={connection === 'connecting'}
                onClick={connect}
              >
                {t('connect')}
              </Button>
            )}
        </div>
        <div className={css.endpointRow}>
          <span className={css.fieldLabel}>{t('endpoint')}</span>
          <code>{endpoint}</code>
          <Button
            variant="toolbar"
            size="sm"
            aria-label={copied ? t('copied') : t('copyEndpoint')}
            icon={copied ? <IconCheckOutline16 size={14} /> : <IconCopyOutline16 size={14} />}
            onClick={() => {
              void writeClipboard(endpoint).then((accepted) => {
                if (!accepted) return
                setCopied(true)
                clearTimer(copiedTimer)
                copiedTimer.current = setTimeout(() => {
                  copiedTimer.current = undefined
                  setCopied(false)
                }, 1200)
              })
            }}
          />
        </div>
      </section>

      <section className={css.block} aria-labelledby="codex-policy-title">
        <div className={css.blockHead}>
          <div>
            <h3 id="codex-policy-title">{t('policyTitle')}</h3>
            <p>{t('policyIntro')}</p>
          </div>
        </div>
        <div className={css.policyGrid} aria-disabled={connection !== 'connected'}>
          <div className={css.policyGroup}>
            <span className={css.fieldLabel}>{t('workspaces')}</span>
            <Checkbox
              checked={primaryWorkspace}
              disabled={connection !== 'connected'}
              label={t('workspacePrimary')}
              onChange={setPrimaryWorkspace}
            />
            <Checkbox
              checked={docsWorkspace}
              disabled={connection !== 'connected'}
              label={t('workspaceDocs')}
              onChange={setDocsWorkspace}
            />
          </div>
          <div className={css.policyGroup}>
            <span className={css.fieldLabel}>{t('permission')}</span>
            <div className={css.pills}>
              <Pill active={permission === 'read'} disabled={connection !== 'connected'} onClick={() => { setPermission('read') }}>
                {t('permissionReadOnly')}
              </Pill>
              <Pill active={permission === 'write'} disabled={connection !== 'connected'} onClick={() => { setPermission('write') }}>
                {t('permissionWrite')}
              </Pill>
            </div>
          </div>
          <label className={css.selectGroup}>
            <span className={css.fieldLabel}>{t('model')}</span>
            <select value={model} disabled={connection !== 'connected'} onChange={(event) => { setModel(event.currentTarget.value) }}>
              <option value="fast">{t('modelFast')}</option>
              <option value="balanced">{t('modelBalanced')}</option>
              <option value="local">{t('modelLocal')}</option>
            </select>
          </label>
          <div className={css.switchRow}>
            <span>{t('autoDelegate')}</span>
            <Switch
              checked={autoDelegate}
              disabled={connection !== 'connected'}
              label={t('autoDelegate')}
              onChange={setAutoDelegate}
            />
          </div>
        </div>
      </section>

      <section className={css.block} aria-labelledby="codex-runs-title">
        <div className={css.blockHead}>
          <div>
            <h3 id="codex-runs-title">{t('runsTitle')}</h3>
            <p>{t('runsIntro')}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            icon={<IconPlayOutline16 size={14} />}
            disabled={connection !== 'connected' || run === 'running'}
            onClick={startRun}
          >
            {t('startDemo')}
          </Button>
        </div>
        {run === undefined
          ? <p className={css.empty}>{t('noRuns')}</p>
          : (
            <div className={css.run}>
              <div className={css.runMain}>
                <StateDot state={run === 'running' ? 'ongoing' : run === 'completed' ? 'done' : 'idle'} />
                <span className={css.runIdentity}>
                  <strong>{t('demoTask')}</strong>
                  <span>{`${t('demoWorkspace')} · ${run === 'running' ? t('demoRunning') : run === 'completed' ? t('demoCompleted') : t('demoCancelled')}`}</span>
                </span>
                <span className={css.runActions}>
                  {run === 'running'
                    ? (
                      <Button variant="ghost" size="sm" icon={<IconStopFill16 size={13} />} onClick={cancelRun}>
                        {t('cancel')}
                      </Button>
                    )
                    : run === 'completed'
                      ? (
                        <Button variant="ghost" size="sm" onClick={() => { setSessionOpen(value => !value) }}>
                          {sessionOpen ? t('closeSession') : t('openSession')}
                        </Button>
                      )
                      : null}
                </span>
              </div>
              {run === 'completed' ? <p className={css.result}>{t('demoResult')}</p> : null}
              {sessionOpen
                ? (
                  <div className={css.sessionPreview}>
                    <div><strong>{t('sessionUser')}</strong><p>{t('sessionPrompt')}</p></div>
                    <div className={css.toolLine}><StateDot state="done" /><span>{t('sessionTool')}</span></div>
                    <div><strong>{t('sessionAssistant')}</strong><p>{t('sessionAnswer')}</p></div>
                  </div>
                )
                : null}
            </div>
          )}
      </section>
    </div>
  )
}
