// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { DesktopUpdateSection } from '../src/client/DesktopUpdateSection.tsx'
import type { DesktopUpdateViewState } from '../src/client/store.ts'
import { en, zh } from '../src/client/locales.ts'

afterEach(cleanup)

function mount(state: DesktopUpdateViewState, locale: typeof en = en) {
  const store = createSnapshotStore(state)
  const actions = {
    load: vi.fn(() => Promise.resolve()),
    check: vi.fn(() => Promise.resolve()),
    download: vi.fn(() => Promise.resolve()),
    install: vi.fn(() => Promise.resolve()),
  }
  render(<DesktopUpdateSection
    close={vi.fn()}
    {...actions}
    useDesktopUpdate={bindSnapshotSelector(store)}
    t={key => locale[key]}
  />)
  return { actions, store }
}

describe('DesktopUpdateSection', () => {
  it('shows a loading state before the first bridge read settles', async () => {
    const { actions } = mount({ status: 'loading' })

    expect(screen.getByText('Checking for updates…')).toBeTruthy()
    await waitFor(() => { expect(actions.load).toHaveBeenCalledOnce() })
  })

  it('shows a retry control when the initial bridge read fails', () => {
    const { actions } = mount({ status: 'error' })

    expect(screen.getByRole('alert').textContent).toBe('Could not read the update status.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(actions.load).toHaveBeenCalled()
  })

  it('loads only when mounted and renders English idle copy', async () => {
    const { actions } = mount({
      status: 'ready',
      update: { phase: 'idle', currentVersion: '1.2.3' },
    })

    expect(screen.getByText('App Updates')).toBeTruthy()
    expect(screen.getByText('1.2.3')).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Check for updates' })
    fireEvent.click(button)

    await waitFor(() => { expect(actions.load).toHaveBeenCalledOnce() })
    expect(actions.check).toHaveBeenCalledOnce()
    expect(actions.download).not.toHaveBeenCalled()
    expect(actions.install).not.toHaveBeenCalled()
  })

  it('renders Chinese available copy and downloads only after a click', () => {
    const { actions } = mount({
      status: 'ready',
      update: { phase: 'available', currentVersion: '1.2.3', availableVersion: '1.3.0' },
    }, zh)

    expect(screen.getByText('当前版本')).toBeTruthy()
    expect(screen.getByText('可用版本')).toBeTruthy()
    expect(screen.getByText('1.3.0')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '下载更新' }))
    expect(actions.download).toHaveBeenCalledOnce()
  })

  it('shows determinate progress and disables commands while downloading', () => {
    mount({
      status: 'ready',
      update: {
        phase: 'downloading',
        currentVersion: '1.2.3',
        availableVersion: '1.3.0',
        progress: { percent: 42, transferred: 420, total: 1_000 },
      },
    })

    const progress = screen.getByRole('progressbar')
    expect(progress.getAttribute('aria-valuenow')).toBe('42')
    expect((screen.getByRole('button', { name: 'Downloading…' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows indeterminate progress when total progress is unavailable', () => {
    mount({
      status: 'ready',
      update: {
        phase: 'downloading',
        currentVersion: '1.2.3',
        availableVersion: '1.3.0',
        progress: { transferred: 420 },
      },
    })

    expect(screen.getByRole('progressbar').hasAttribute('aria-valuenow')).toBe(false)
  })

  it.each([
    ['checking', 'Checking for updates…'],
    ['installing', 'Starting the installer…'],
  ] as const)('shows a disabled %s action', (phase, label) => {
    mount({
      status: 'ready',
      update: { phase, currentVersion: '1.2.3', availableVersion: '1.3.0' },
    })

    expect((screen.getByRole('button', { name: label }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows an unsupported status without an action', () => {
    mount({
      status: 'ready',
      update: { phase: 'unsupported', currentVersion: '1.2.3' },
    })

    expect(screen.getByText('Updates are unavailable for this build.')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('warns about the system installer and installs only after a click', () => {
    const { actions } = mount({
      status: 'ready',
      update: { phase: 'downloaded', currentVersion: '1.2.3', availableVersion: '1.3.0' },
    })

    expect(screen.getByText('Windows may ask you to confirm the installer. Your app data will be kept.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Restart and install' }))
    expect(actions.install).toHaveBeenCalledOnce()
  })

  it('offers a retry after a safe update error', () => {
    const { actions } = mount({
      status: 'ready',
      update: {
        phase: 'error',
        currentVersion: '1.2.3',
        message: 'Unable to complete the update. Try again.',
      },
    })

    expect(screen.getByRole('alert').textContent).toContain('Unable to complete the update. Try again.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(actions.check).toHaveBeenCalledOnce()
  })
})
