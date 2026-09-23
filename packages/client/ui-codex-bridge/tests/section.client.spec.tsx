// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CodexBridgeSection } from '../src/client/CodexBridgeSection.tsx'
import type { CodexBridgeSectionProps } from '../src/client/CodexBridgeSection.tsx'
import { en } from '../src/client/locales.ts'

const ENDPOINT = 'http://127.0.0.1:3080/api/integrations/codex/mcp'
const writeText = vi.fn<(text: string) => Promise<void>>()

function renderSection() {
  return render(<CodexBridgeSection {...({
    close: vi.fn(),
    t: (key: keyof typeof en) => en[key],
  } as CodexBridgeSectionProps)} />)
}

async function connect(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: en.connect }))
  expect(screen.getByRole('status').textContent).toContain(en.connecting)
  await act(async () => { await vi.advanceTimersByTimeAsync(850) })
  expect(screen.getByRole('status').textContent).toContain(en.connected)
}

describe('Codex Bridge interactive preview', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    writeText.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('connects before enabling delegation policy controls', async () => {
    renderSection()

    expect(screen.getByRole('checkbox', { name: en.workspacePrimary })).toHaveProperty('disabled', true)
    expect(screen.getByRole('switch', { name: en.autoDelegate })).toHaveProperty('disabled', true)

    await connect()

    const docs = screen.getByRole('checkbox', { name: en.workspaceDocs })
    const write = screen.getByRole('button', { name: en.permissionWrite })
    const model = screen.getByRole('combobox', { name: en.model })
    expect(docs).toHaveProperty('disabled', false)
    fireEvent.click(docs)
    fireEvent.click(write)
    fireEvent.change(model, { target: { value: 'balanced' } })
    expect(docs).toHaveProperty('checked', true)
    expect(write.getAttribute('class')).toContain('active')
    expect(model).toHaveProperty('value', 'balanced')
  })

  it('completes, expands, and cancels simulated delegated runs', async () => {
    renderSection()
    await connect()

    fireEvent.click(screen.getByRole('button', { name: en.startDemo }))
    expect(screen.getByText(new RegExp(en.demoRunning))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.cancel }))
    expect(screen.getByText(new RegExp(en.demoCancelled))).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: en.startDemo }))
    await act(async () => { await vi.advanceTimersByTimeAsync(2200) })
    expect(screen.getByText(en.demoResult)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.openSession }))
    expect(screen.getByText(en.sessionAnswer)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.closeSession }))
    expect(screen.queryByText(en.sessionAnswer)).toBeNull()
  })

  it('clears pending work when disconnected or unmounted', async () => {
    const view = renderSection()
    await connect()
    fireEvent.click(screen.getByRole('button', { name: en.startDemo }))
    expect(vi.getTimerCount()).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: en.disconnect }))
    expect(screen.getByText(en.noRuns)).toBeTruthy()
    expect(vi.getTimerCount()).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: en.connect }))
    expect(vi.getTimerCount()).toBe(1)
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('copies the fixed endpoint without changing the icon-only button width', async () => {
    renderSection()
    const copy = screen.getByRole('button', { name: en.copyEndpoint })
    const widthClass = copy.getAttribute('class')
    expect(copy.textContent).toBe('')

    fireEvent.click(copy)
    await act(async () => { await Promise.resolve() })
    const copied = screen.getByRole('button', { name: en.copied })
    expect(writeText).toHaveBeenCalledWith(ENDPOINT)
    expect(copied.textContent).toBe('')
    expect(copied.getAttribute('class')).toBe(widthClass)

    await act(async () => { await vi.advanceTimersByTimeAsync(1200) })
    expect(screen.getByRole('button', { name: en.copyEndpoint })).toBeTruthy()
  })

  it('does not claim success when the clipboard rejects the write', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'))
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: en.copyEndpoint }))
    await act(async () => { await Promise.resolve() })

    expect(screen.getByRole('button', { name: en.copyEndpoint })).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.copied })).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})
