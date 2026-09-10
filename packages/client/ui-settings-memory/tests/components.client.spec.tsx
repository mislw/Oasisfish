// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryId, type MemoryRecord } from '@deepseek-ai/dsh-memory'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { MemorySection, type MemorySectionProps } from '../src/client/MemorySection.tsx'
import { en, type MemoryLocaleKey } from '../src/client/locales.ts'
import type { MemorySettingsState } from '../src/client/store.ts'

afterEach(cleanup)

const USER: MemoryRecord = Object.freeze({
  id: MemoryId('user-1'), scope: 'user', content: 'Prefer Chinese.', createdAt: 1, updatedAt: 1,
})
const PROJECT: MemoryRecord = Object.freeze({
  id: MemoryId('project-1'), scope: 'project', projectKey: 'key', projectLabel: 'project',
  content: 'Run focused tests.', createdAt: 1, updatedAt: 1,
})

function props(overrides: Partial<MemorySectionProps> = {}): MemorySectionProps {
  const store = createSnapshotStore<MemorySettingsState>({
    status: 'ready', enabled: true, records: [USER, PROJECT], operation: undefined, failure: undefined,
  })
  return {
    useMemory: selector => selector(store.getSnapshot()),
    useSessions: selector => selector({
      current: 'session-1',
      byId: { 'session-1': { cwd: '/work/project' } },
    } as never),
    load: vi.fn(() => Promise.resolve()),
    setEnabled: vi.fn(() => Promise.resolve(true)),
    add: vi.fn(() => Promise.resolve(true)),
    update: vi.fn(() => Promise.resolve(true)),
    remove: vi.fn(() => Promise.resolve(true)),
    t: ((key: MemoryLocaleKey) => en[key]) as MemorySectionProps['t'],
    close: () => {},
    ...overrides,
  } as MemorySectionProps
}

function stateProps(
  state: MemorySettingsState,
  overrides: Partial<MemorySectionProps> = {},
): MemorySectionProps {
  const store = createSnapshotStore(state)
  return props({ useMemory: selector => selector(store.getSnapshot()), ...overrides })
}

describe('MemorySection', () => {
  it('loads for the current cwd and groups user and project records', async () => {
    const p = props()
    render(<MemorySection {...p} />)
    await act(async () => {})
    expect(p.load).toHaveBeenCalledWith('/work/project')
    expect(screen.getByRole('heading', { name: en.userMemory })).toBeTruthy()
    expect(screen.getByRole('heading', { name: en.projectMemory })).toBeTruthy()
    expect(screen.getByText(USER.content)).toBeTruthy()
    expect(screen.getByText(PROJECT.content)).toBeTruthy()
  })

  it('routes the enable switch and add, edit, and delete commands', async () => {
    const p = props()
    render(<MemorySection {...p} />)
    fireEvent.click(screen.getByRole('checkbox', { name: en.enabled }))
    expect(p.setEnabled).toHaveBeenCalledWith(false, '/work/project')

    fireEvent.change(screen.getByRole('textbox', { name: en.content }), { target: { value: 'A new preference.' } })
    fireEvent.click(screen.getByRole('button', { name: en.add }))
    await act(async () => {})
    expect(p.add).toHaveBeenCalledWith({ scope: 'user', content: 'A new preference.' }, '/work/project')

    fireEvent.click(screen.getByRole('button', { name: `${en.edit}: ${USER.content}` }))
    const editor = screen.getByRole('textbox', { name: en.editContent })
    fireEvent.change(editor, { target: { value: 'Prefer concise Chinese.' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await act(async () => {})
    expect(p.update).toHaveBeenCalledWith(USER.id, 'Prefer concise Chinese.', '/work/project')

    fireEvent.click(screen.getByRole('button', { name: `${en.remove}: ${PROJECT.content}` }))
    expect(p.remove).toHaveBeenCalledWith(PROJECT.id, '/work/project')
  })

  it('retains an add draft when the Host rejects the write', async () => {
    const p = props({ add: vi.fn(() => Promise.resolve(false)) })
    render(<MemorySection {...p} />)
    const input = screen.getByRole('textbox', { name: en.content })
    fireEvent.change(input, { target: { value: 'Keep this draft.' } })
    fireEvent.click(screen.getByRole('button', { name: en.add }))
    await act(async () => {})
    expect((input as HTMLTextAreaElement).value).toBe('Keep this draft.')
  })

  it('renders loading and failed reads and routes retry for the current project', async () => {
    const loading = stateProps({
      status: 'loading', enabled: true, records: [], operation: undefined, failure: undefined,
    })
    const view = render(<MemorySection {...loading} />)
    expect(screen.getByText(en.loading)).toBeTruthy()
    expect(view.container.querySelector('[aria-busy="true"]')).toBeTruthy()

    view.rerender(<MemorySection {...stateProps({
      status: 'error', enabled: true, records: [], operation: undefined, failure: undefined,
    }, { load: loading.load })} />)
    expect(screen.getByRole('alert').textContent).toBe(en.loadError)
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    expect(loading.load).toHaveBeenCalledWith('/work/project')
  })

  it('shows empty groups, operation failures, and unavailable project memory without a session cwd', async () => {
    const p = stateProps({
      status: 'ready', enabled: true, records: [], operation: undefined, failure: 'rejected',
    }, {
      useSessions: selector => selector({ current: undefined, byId: {} } as never),
    })
    render(<MemorySection {...p} />)
    await act(async () => {})
    expect(p.load).toHaveBeenCalledWith(undefined)
    expect(screen.getByRole('alert').textContent).toBe(en.operationError)
    expect(screen.getAllByText(en.empty)).toHaveLength(1)
    expect(screen.getByText(en.projectUnavailable)).toBeTruthy()
    const projectOption = screen.getByRole('option', { name: en.projectScope })
    expect(projectOption).toBeInstanceOf(HTMLOptionElement)
    if (projectOption instanceof HTMLOptionElement) expect(projectOption.disabled).toBe(true)
  })

  it('resets project scope when the selected session loses its cwd', async () => {
    const p = props()
    const view = render(<MemorySection {...p} />)
    const scope = screen.getByRole('combobox') as HTMLSelectElement
    fireEvent.change(scope, { target: { value: 'project' } })
    expect(scope.value).toBe('project')

    view.rerender(<MemorySection {...props({
      useSessions: selector => selector({ current: 'session-1', byId: { 'session-1': {} } } as never),
    })} />)
    await act(async () => {})
    const currentScope = screen.getByRole('combobox')
    expect(currentScope).toBeInstanceOf(HTMLSelectElement)
    if (currentScope instanceof HTMLSelectElement) expect(currentScope.value).toBe('user')
  })

  it('cancels editing and retains the edit draft when the Host rejects the update', async () => {
    const update = vi.fn(() => Promise.resolve(false))
    const p = props({ update })
    render(<MemorySection {...p} />)

    fireEvent.click(screen.getByRole('button', { name: `${en.edit}: ${USER.content}` }))
    const editor = screen.getByRole('textbox', { name: en.editContent }) as HTMLTextAreaElement
    fireEvent.change(editor, { target: { value: 'Rejected edit.' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await act(async () => {})
    expect(update).toHaveBeenCalledWith(USER.id, 'Rejected edit.', '/work/project')
    expect(editor.value).toBe('Rejected edit.')

    fireEvent.click(screen.getByRole('button', { name: en.cancel }))
    expect(screen.queryByRole('textbox', { name: en.editContent })).toBeNull()
    expect(screen.getByText(USER.content)).toBeTruthy()
  })

  it('disables empty or busy commands and exposes progress labels', () => {
    const add = vi.fn(() => Promise.resolve(true))
    const p = stateProps({
      status: 'ready', enabled: true, records: [USER], operation: 'add', failure: undefined,
    }, { add })
    const view = render(<MemorySection {...p} />)
    const adding = screen.getByRole('button', { name: en.adding })
    expect(adding).toBeInstanceOf(HTMLButtonElement)
    if (adding instanceof HTMLButtonElement) expect(adding.disabled).toBe(true)
    expect(view.container.querySelector('[aria-busy="true"]')).toBeTruthy()

    view.rerender(<MemorySection {...props({ add })} />)
    const emptyAdd = screen.getByRole('button', { name: en.add })
    expect(emptyAdd).toBeInstanceOf(HTMLButtonElement)
    if (emptyAdd instanceof HTMLButtonElement) expect(emptyAdd.disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: `${en.edit}: ${USER.content}` }))
    const editor = screen.getByRole('textbox', { name: en.editContent })
    fireEvent.change(editor, { target: { value: '   ' } })
    const emptySave = screen.getByRole('button', { name: en.save })
    expect(emptySave).toBeInstanceOf(HTMLButtonElement)
    if (emptySave instanceof HTMLButtonElement) expect(emptySave.disabled).toBe(true)
  })

  it('shows the saving label while an edit mutation is pending', () => {
    const ready: MemorySettingsState = {
      status: 'ready', enabled: true, records: [USER], operation: undefined, failure: undefined,
    }
    const view = render(<MemorySection {...stateProps(ready)} />)
    fireEvent.click(screen.getByRole('button', { name: `${en.edit}: ${USER.content}` }))
    view.rerender(<MemorySection {...stateProps({ ...ready, operation: 'update' })} />)
    const saving = screen.getByRole('button', { name: en.saving })
    expect(saving).toBeInstanceOf(HTMLButtonElement)
    if (saving instanceof HTMLButtonElement) expect(saving.disabled).toBe(true)
  })
})
