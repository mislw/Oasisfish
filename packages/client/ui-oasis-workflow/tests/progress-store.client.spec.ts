// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OasisUiProgressStore } from '../src/client/progress-store.ts'

afterEach(() => { localStorage.clear() })

const REQUEST = {
  source: 'generate' as const,
  pageName: '龙玉交换',
  purpose: '交换龙玉',
  references: 'style.png',
  constraints: '复用项目控件',
}

describe('OasisUiProgressStore', () => {
  it('notifies subscribers, allows unsubscribe, and resets the complete workflow', () => {
    const store = new OasisUiProgressStore('session-subscribe')
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.selectMode('desktop')
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
    store.startStage(REQUEST)
    expect(listener).toHaveBeenCalledOnce()
    store.reset()
    expect(store.getSnapshot()).toEqual({
      mode: null, currentStage: 0, status: 'ready', taskName: '', request: null,
    })
  })

  it('ignores actions that do not match the current stage lifecycle', () => {
    const initial = new OasisUiProgressStore('session-guards')
    initial.startStage(REQUEST)
    expect(initial.getSnapshot().status).toBe('ready')
    initial.selectMode('desktop')
    initial.startStage()
    expect(initial.getSnapshot().status).toBe('ready')
    initial.startStage(REQUEST)
    initial.selectMode('text')
    initial.startStage(REQUEST)
    expect(initial.getSnapshot()).toMatchObject({ mode: 'desktop', status: 'awaiting_confirmation' })

    localStorage.setItem('dsh.oasis-ui.workflow.session-stage-null', JSON.stringify({
      mode: 'desktop', currentStage: 1, status: 'ready', taskName: '', request: null,
    }))
    const laterWithoutRequest = new OasisUiProgressStore('session-stage-null')
    laterWithoutRequest.startStage()
    expect(laterWithoutRequest.getSnapshot().status).toBe('ready')

    localStorage.setItem('dsh.oasis-ui.workflow.session-stage-zero-request', JSON.stringify({
      mode: 'desktop', currentStage: 0, status: 'ready', taskName: 'persisted', request: REQUEST,
    }))
    const stageZeroWithRequest = new OasisUiProgressStore('session-stage-zero-request')
    stageZeroWithRequest.selectMode('text')
    expect(stageZeroWithRequest.getSnapshot().mode).toBe('desktop')
  })
  it('requires a started stage to await confirmation before advancing', () => {
    const store = new OasisUiProgressStore('session-lock')
    store.selectMode('desktop')

    store.confirmStage()
    expect(store.getSnapshot()).toMatchObject({ currentStage: 0, status: 'ready' })

    store.startStage(REQUEST)
    expect(store.getSnapshot()).toMatchObject({
      currentStage: 0,
      status: 'awaiting_confirmation',
      taskName: '龙玉交换',
      request: REQUEST,
    })

    store.confirmStage()
    expect(store.getSnapshot()).toMatchObject({ currentStage: 1, status: 'ready' })

    store.confirmStage()
    expect(store.getSnapshot()).toMatchObject({ currentStage: 1, status: 'ready' })
  })

  it('isolates sessions and rehydrates the same session from localStorage', () => {
    const first = new OasisUiProgressStore('session-a')
    first.selectMode('text')
    first.startStage(REQUEST)
    first.confirmStage()

    const revived = new OasisUiProgressStore('session-a')
    const other = new OasisUiProgressStore('session-b')
    expect(revived.getSnapshot()).toMatchObject({ mode: 'text', currentStage: 1, status: 'ready' })
    expect(other.getSnapshot()).toMatchObject({ mode: null, currentStage: 0, status: 'ready' })
  })

  it('marks the workflow complete only after every stage is started and confirmed', () => {
    const store = new OasisUiProgressStore('session-complete')
    store.selectMode('desktop')

    for (let stage = 0; stage < 8; stage++) {
      store.startStage(stage === 0 ? REQUEST : undefined)
      store.confirmStage()
    }

    expect(store.getSnapshot()).toMatchObject({ currentStage: 7, status: 'complete' })
  })

  it.each([
    null,
    'bad',
    { mode: 'invalid', currentStage: 0, status: 'ready', taskName: '', request: null },
    { mode: null, currentStage: '0', status: 'ready', taskName: '', request: null },
    { mode: null, currentStage: 0.5, status: 'ready', taskName: '', request: null },
    { mode: null, currentStage: -1, status: 'ready', taskName: '', request: null },
    { mode: null, currentStage: 8, status: 'ready', taskName: '', request: null },
    { mode: null, currentStage: 0, status: 'invalid', taskName: '', request: null },
    { mode: null, currentStage: 0, status: 'ready', taskName: 1, request: null },
    { mode: null, currentStage: 0, status: 'ready', taskName: '', request: 'bad' },
    { mode: null, currentStage: 0, status: 'ready', taskName: '', request: {
      ...REQUEST, source: 'bad',
    } },
    { mode: null, currentStage: 0, status: 'ready', taskName: '', request: {
      ...REQUEST, pageName: 1,
    } },
    { mode: null, currentStage: 0, status: 'ready', taskName: '', request: {
      ...REQUEST, purpose: 1,
    } },
    { mode: null, currentStage: 0, status: 'ready', taskName: '', request: {
      ...REQUEST, references: 1,
    } },
    { mode: null, currentStage: 0, status: 'ready', taskName: '', request: {
      ...REQUEST, constraints: 1,
    } },
  ])('replaces malformed persisted progress %#', (persisted) => {
    localStorage.setItem('dsh.oasis-ui.workflow.session-invalid', JSON.stringify(persisted))
    const store = new OasisUiProgressStore('session-invalid')
    expect(store.getSnapshot()).toEqual({
      mode: null, currentStage: 0, status: 'ready', taskName: '', request: null,
    })
  })

  it.each(['generate', 'existing', 'continue'] as const)('rehydrates valid source %s', (source) => {
    localStorage.setItem('dsh.oasis-ui.workflow.session-valid-source', JSON.stringify({
      mode: 'desktop', currentStage: 0, status: 'ready', taskName: '',
      request: { ...REQUEST, source },
    }))
    expect(new OasisUiProgressStore('session-valid-source').getSnapshot().request?.source).toBe(source)
  })
})
