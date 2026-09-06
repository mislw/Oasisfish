// @vitest-environment jsdom
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  DesktopUpdateState,
  OasisfishUpdateBridge,
} from '@deepseek-ai/dsh-client-ui-desktop-update/protocol'
import { installAssembledBootEnv, mountAssembledApp, REFRESHING_GOLDEN } from './assembled-boot.ts'

const SNAPSHOT_DIR = join(process.cwd(), 'apps/web/tests/snapshots/desktop-update')
const NO_BRIDGE_EXPECTED = join(SNAPSHOT_DIR, 'browser-no-bridge.txt')
const AVAILABLE_EXPECTED = join(SNAPSHOT_DIR, 'desktop-available.txt')
const DOWNLOADING_EXPECTED = join(SNAPSHOT_DIR, 'desktop-downloading.txt')

installAssembledBootEnv()

afterEach(() => {
  window.oasisfishUpdate = undefined
})

function saveOrMatch(path: string, value: string): Promise<void> {
  if (REFRESHING_GOLDEN) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, value)
  }
  return expect(value).toMatchFileSnapshot(path)
}

function bridge(initial: DesktopUpdateState) {
  const commands: string[] = []
  const value: OasisfishUpdateBridge = {
    getState: vi.fn(async () => initial),
    check: vi.fn(async () => { commands.push('check'); return initial }),
    download: vi.fn(async () => { commands.push('download'); return initial }),
    install: vi.fn(async () => { commands.push('install'); return initial }),
    subscribe: vi.fn(() => () => {}),
  }
  return { value, commands }
}

async function openUpdates() {
  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }, { timeout: 10_000 }))
  const dialog = await screen.findByRole('dialog', { name: 'Settings' }, { timeout: 10_000 })
  fireEvent.click(await within(dialog).findByRole('button', { name: 'App Updates' }))
  await within(dialog).findByRole('heading', { name: 'App Updates' })
  return dialog
}

describe('assembled desktop update settings', () => {
  it('does not register an update page in an ordinary browser', async () => {
    window.oasisfishUpdate = undefined
    mountAssembledApp()

    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }, { timeout: 10_000 }))
    const dialog = await screen.findByRole('dialog', { name: 'Settings' }, { timeout: 10_000 })
    const shape = `app-updates=${within(dialog).queryByRole('button', { name: 'App Updates' }) === null ? 'absent' : 'present'}`

    await saveOrMatch(NO_BRIDGE_EXPECTED, shape)
  })

  it('shows an available desktop release and downloads only after a click', async () => {
    const desktop = bridge({
      phase: 'available',
      currentVersion: '1.2.3',
      availableVersion: '1.3.0',
    })
    window.oasisfishUpdate = desktop.value
    mountAssembledApp()
    const dialog = await openUpdates()

    expect(desktop.value.getState).toHaveBeenCalledOnce()
    expect(desktop.commands).toEqual([])
    const action = within(dialog).getByRole('button', { name: 'Download update' })
    const shape = [
      within(dialog).getByRole('heading', { name: 'App Updates' }).textContent,
      `current=${within(dialog).getByText('1.2.3').textContent}`,
      `available=${within(dialog).getByText('1.3.0').textContent}`,
      `status=${within(dialog).getByText('A new version is ready to download.').textContent}`,
      `action=${action.textContent}`,
    ].join('\n')
    fireEvent.click(action)
    await waitFor(() => { expect(desktop.commands).toEqual(['download']) })

    await saveOrMatch(AVAILABLE_EXPECTED, `${shape}\ncommands=${desktop.commands.join(',')}`)
  })

  it('renders deterministic download progress without issuing commands', async () => {
    const desktop = bridge({
      phase: 'downloading',
      currentVersion: '1.2.3',
      availableVersion: '1.3.0',
      progress: { percent: 42, transferred: 420, total: 1_000, bytesPerSecond: 100 },
    })
    window.oasisfishUpdate = desktop.value
    mountAssembledApp()
    const dialog = await openUpdates()
    const progress = within(dialog).getByRole('progressbar', { name: 'Download progress' })
    const action = within(dialog).getByRole('button', { name: 'Downloading…' }) as HTMLButtonElement
    const shape = [
      `progress=${progress.getAttribute('aria-valuenow')}%`,
      `action=${action.textContent}`,
      `disabled=${String(action.disabled)}`,
      `commands=${desktop.commands.join(',') || '<none>'}`,
    ].join('\n')

    await saveOrMatch(DOWNLOADING_EXPECTED, shape)
  })
})
