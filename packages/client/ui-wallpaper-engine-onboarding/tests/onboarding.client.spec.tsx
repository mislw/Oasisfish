// @vitest-environment jsdom
/** Wallpaper Engine onboarding rendering, completion, and request lifetime. */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WallpaperOnboarding } from '../src/client/WallpaperOnboarding.tsx'
import type { WallpaperOnboardingProps } from '../src/client/WallpaperOnboarding.tsx'
import { en } from '../src/client/locales.ts'
import type { WallpaperSettingsReadiness } from '../src/client/probe.ts'

afterEach(() => {
  cleanup()
  document.getElementById('root')?.remove()
})

function harness(probe: (signal: AbortSignal) => Promise<WallpaperSettingsReadiness>) {
  const appRoot = document.createElement('div')
  appRoot.id = 'root'
  document.body.append(appRoot)
  const calls: string[] = []
  const complete = vi.fn(() => { calls.push('complete') })
  const openSection = vi.fn((id: string) => { calls.push(`open:${id}`) })
  const warn = vi.fn()
  const props = {
    stepId: 'wallpaper-engine-setup',
    complete,
    openSection,
    probe,
    warn,
    copy: en,
  } as unknown as WallpaperOnboardingProps
  return { appRoot, calls, complete, openSection, props, warn }
}

describe('WallpaperOnboarding', () => {
  it('renders nothing while probing, aborts on disposal, and suppresses late settlement', async () => {
    let signal: AbortSignal | undefined
    const reply = Promise.withResolvers<WallpaperSettingsReadiness>()
    const h = harness(vi.fn((requestSignal: AbortSignal) => {
      signal = requestSignal
      return reply.promise
    }))
    const view = render(<WallpaperOnboarding {...h.props} />)

    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(h.appRoot.inert).not.toBe(true)
    expect(signal?.aborted).toBe(false)
    view.unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => {
      reply.resolve({ kind: 'unavailable', diagnostic: '/wallpaper-engine/settings fetch' })
      await reply.promise
    })
    expect(h.complete).not.toHaveBeenCalled()
    expect(h.warn).not.toHaveBeenCalled()
  })

  it('keeps one pending probe across owner rerenders and completes through the latest callback', async () => {
    const reply = Promise.withResolvers<WallpaperSettingsReadiness>()
    const probe = vi.fn(() => reply.promise)
    const h = harness(probe)
    const latestComplete = vi.fn()
    const view = render(<WallpaperOnboarding {...h.props} />)

    view.rerender(<WallpaperOnboarding {...h.props} complete={latestComplete} />)
    expect(probe).toHaveBeenCalledOnce()
    await act(async () => {
      reply.resolve({ kind: 'configured' })
      await reply.promise
    })
    expect(h.complete).not.toHaveBeenCalled()
    expect(latestComplete).toHaveBeenCalledOnce()
  })

  it('completes configured readiness once without rendering', async () => {
    const h = harness(vi.fn(async (): Promise<WallpaperSettingsReadiness> => ({ kind: 'configured' })))
    const view = render(<WallpaperOnboarding {...h.props} />)
    await waitFor(() => { expect(h.complete).toHaveBeenCalledOnce() })
    view.rerender(<WallpaperOnboarding {...h.props} />)
    expect(h.complete).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.warn).not.toHaveBeenCalled()
  })

  it('logs an unavailable probe once, completes once, and renders nothing', async () => {
    const h = harness(vi.fn(async (): Promise<WallpaperSettingsReadiness> => ({
      kind: 'unavailable', diagnostic: '/wallpaper-engine/settings http',
    })))
    const view = render(<WallpaperOnboarding {...h.props} />)
    await waitFor(() => { expect(h.complete).toHaveBeenCalledOnce() })
    view.rerender(<WallpaperOnboarding {...h.props} />)
    expect(h.warn).toHaveBeenCalledExactlyOnceWith('/wallpaper-engine/settings http')
    expect(h.complete).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows localized setup copy, inerts the product, and focuses the title', async () => {
    const h = harness(vi.fn(async (): Promise<WallpaperSettingsReadiness> => ({ kind: 'setup-required' })))
    render(<WallpaperOnboarding {...h.props} />)

    expect(await screen.findByRole('dialog', { name: en.title })).toBeTruthy()
    expect(screen.getByText(en.body)).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: en.openSettings })).toBeTruthy()
    expect(h.appRoot.inert).toBe(true)
    await waitFor(() => { expect(document.activeElement).toBe(screen.getByRole('heading', { name: en.title })) })
  })

  it('completes before opening Wallpaper Engine settings', async () => {
    const h = harness(vi.fn(async (): Promise<WallpaperSettingsReadiness> => ({ kind: 'setup-required' })))
    render(<WallpaperOnboarding {...h.props} />)
    fireEvent.click(await screen.findByRole('button', { name: en.openSettings }))

    expect(h.calls).toEqual(['complete', 'open:wallpaper-engine'])
    expect(h.complete).toHaveBeenCalledOnce()
    expect(h.openSection).toHaveBeenCalledExactlyOnceWith('wallpaper-engine')
  })

  it('cannot be dismissed implicitly and restores the previous inert value', async () => {
    const h = harness(vi.fn(async (): Promise<WallpaperSettingsReadiness> => ({ kind: 'setup-required' })))
    h.appRoot.inert = true
    const view = render(<WallpaperOnboarding {...h.props} />)
    await screen.findByRole('dialog')

    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(document.querySelector('[class*="mask"]')!)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(h.complete).not.toHaveBeenCalled()
    view.unmount()
    expect(h.appRoot.inert).toBe(true)
  })
})
