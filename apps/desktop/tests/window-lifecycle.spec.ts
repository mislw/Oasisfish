import { describe, expect, it, vi } from 'vitest'
import {
  createTrayMenuTemplate,
  createWindowLifecycle,
  handleParentControlMessage,
  type DesktopWindowHandle,
  type PreventableWindowEvent,
} from '../src/window-lifecycle.ts'

class FakeWindow implements DesktopWindowHandle {
  destroyed = false
  hidden = false
  minimized = false
  focused = false
  shown = false

  focus(): void {
    this.focused = true
  }

  hide(): void {
    this.hidden = true
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  isMinimized(): boolean {
    return this.minimized
  }

  restore(): void {
    this.minimized = false
  }

  show(): void {
    this.shown = true
  }
}

function preventableEvent(): PreventableWindowEvent & { prevented: boolean } {
  return {
    prevented: false,
    preventDefault() {
      this.prevented = true
    },
  }
}

describe('createWindowLifecycle', () => {
  it('hides a minimized window without requesting application exit', () => {
    const window = new FakeWindow()
    const quit = vi.fn()
    const confirmCloseToBackground = vi.fn(async () => true)
    const lifecycle = createWindowLifecycle({ window, quit, confirmCloseToBackground })
    lifecycle.handleMinimize()

    expect(window.hidden).toBe(true)
    expect(quit).not.toHaveBeenCalled()
    expect(confirmCloseToBackground).not.toHaveBeenCalled()
  })

  it('confirms a title-bar close before hiding the window in the background', async () => {
    const window = new FakeWindow()
    const quit = vi.fn()
    const lifecycle = createWindowLifecycle({
      window,
      quit,
      confirmCloseToBackground: async () => true,
    })
    const event = preventableEvent()

    await lifecycle.handleClose(event)

    expect(event.prevented).toBe(true)
    expect(window.hidden).toBe(true)
    expect(quit).not.toHaveBeenCalled()
  })

  it('keeps the window open when background close confirmation is cancelled', async () => {
    const window = new FakeWindow()
    const lifecycle = createWindowLifecycle({
      window,
      quit: vi.fn(),
      confirmCloseToBackground: async () => false,
    })
    const event = preventableEvent()

    await lifecycle.handleClose(event)

    expect(event.prevented).toBe(true)
    expect(window.hidden).toBe(false)
  })

  it('allows the window to close only after the tray requests application exit', async () => {
    const window = new FakeWindow()
    const quit = vi.fn()
    const confirmCloseToBackground = vi.fn(async () => true)
    const lifecycle = createWindowLifecycle({ window, quit, confirmCloseToBackground })

    lifecycle.requestQuit()
    const event = preventableEvent()
    await lifecycle.handleClose(event)

    expect(quit).toHaveBeenCalledOnce()
    expect(event.prevented).toBe(false)
    expect(confirmCloseToBackground).not.toHaveBeenCalled()
    expect(window.hidden).toBe(false)
  })

  it('restores and focuses the window when it is opened from the tray', () => {
    const window = new FakeWindow()
    window.minimized = true
    const lifecycle = createWindowLifecycle({
      window,
      quit: vi.fn(),
      confirmCloseToBackground: async () => true,
    })

    lifecycle.showWindow()

    expect(window.minimized).toBe(false)
    expect(window.shown).toBe(true)
    expect(window.focused).toBe(true)
  })
})

describe('createTrayMenuTemplate', () => {
  it('opens the window or requests the only user-initiated application exit', () => {
    const showWindow = vi.fn()
    const requestQuit = vi.fn()
    const template = createTrayMenuTemplate({
      handleClose: vi.fn(async () => undefined),
      handleMinimize: vi.fn(),
      requestQuit,
      showWindow,
    })

    expect(template.map(item => item.label ?? item.type)).toEqual([
      '打开 Oasisfish',
      'separator',
      '退出 Oasisfish',
    ])

    template[0]?.click?.()
    template[2]?.click?.()

    expect(showWindow).toHaveBeenCalledOnce()
    expect(requestQuit).toHaveBeenCalledOnce()
  })
})

describe('handleParentControlMessage', () => {
  it('dispatches only the exact parent-owned quit command', () => {
    const requestQuit = vi.fn()
    const lifecycle = {
      handleClose: vi.fn(async () => undefined),
      handleMinimize: vi.fn(),
      requestQuit,
      showWindow: vi.fn(),
    }

    expect(handleParentControlMessage({ type: 'oasisfish.quit' }, lifecycle)).toBe(true)
    expect(handleParentControlMessage({ type: 'quit' }, lifecycle)).toBe(false)
    expect(handleParentControlMessage('oasisfish.quit', lifecycle)).toBe(false)

    expect(requestQuit).toHaveBeenCalledOnce()
  })
})
