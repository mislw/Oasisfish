// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { OASIS_UI_STAGES } from '../src/client/workflow.ts'
import { OasisUiLauncherStore } from '../src/client/launcher-store.ts'
import {
  OasisUiLauncherButton, OasisUiWorkflowOverlay, type OasisUiLauncherButtonProps,
} from '../src/client/OasisUiWorkflow.tsx'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function openLauncher(
  addFiles = vi.fn<(files: readonly File[]) => string | null>(() => null),
  sessionId = 'session-ui',
  draft = '',
) {
  const setDraft = vi.fn()
  const submit = vi.fn()
  const launcher = new OasisUiLauncherStore()
  const target = { sessionId, draft, addFiles, inputActions: { setDraft, submit } }
  launcher.open(target)
  render(<OasisUiWorkflowOverlay launcher={launcher} />)
  return { launcher, setDraft, submit, addFiles, reopen: () => { act(() => { launcher.open(target) }) } }
}

const REQUEST = {
  source: 'generate' as const,
  pageName: '龙玉交换',
  purpose: '',
  references: '',
  constraints: '',
}

describe('OasisUiWorkflowOverlay', () => {
  it('renders nothing while closed and closes from Escape, the backdrop, and close controls', () => {
    const launcher = new OasisUiLauncherStore()
    const view = render(<OasisUiWorkflowOverlay launcher={launcher} />)
    expect(view.container.firstChild).toBeNull()

    const opened = openLauncher()
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()

    opened.reopen()
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.mouseDown(screen.getByRole('presentation'))
    expect(screen.queryByRole('dialog')).toBeNull()

    opened.reopen()
    fireEvent.click(screen.getAllByRole('button', { name: '关闭' })[0]!)
    expect(screen.queryByRole('dialog')).toBeNull()
    opened.reopen()
    fireEvent.click(screen.getAllByRole('button', { name: '关闭' })[1]!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('requires a navigation mode before showing stage-one input', () => {
    openLauncher()

    expect(screen.getByRole('button', { name: '文字导航版' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'UI 桌面版' })).toBeTruthy()
    expect(screen.queryByPlaceholderText('例如：城防塔升级界面')).toBeNull()
  })

  it('submits stage one and waits for explicit confirmation before advancing', () => {
    const { launcher, setDraft, submit, reopen } = openLauncher()
    fireEvent.click(screen.getByRole('button', { name: 'UI 桌面版' }))
    fireEvent.change(screen.getByPlaceholderText('例如：城防塔升级界面'), {
      target: { value: '城防塔升级界面' },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始本阶段' }))

    expect(setDraft).toHaveBeenCalledOnce()
    expect(setDraft.mock.calls[0]?.[0]).toContain('[OASIS_UI_WORKFLOW]')
    expect(setDraft.mock.calls[0]?.[0]).toContain('当前阶段：1/8 · 来源')
    expect(setDraft.mock.calls[0]?.[0]).toContain('城防塔升级界面')
    expect(submit).toHaveBeenCalledOnce()
    expect(launcher.getSnapshot().open).toBe(false)

    reopen()
    expect(screen.getByText('第 1/8 步')).toBeTruthy()
    expect(screen.getByText('等待你确认')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '确认通过并进入下一步' }))
    expect(screen.getByText('第 2/8 步')).toBeTruthy()
    expect(screen.getByText('准备开始')).toBeTruthy()
    expect(submit).toHaveBeenCalledOnce()
  })

  it('accepts a clipboard image inside the existing-image branch', () => {
    const { addFiles, setDraft } = openLauncher()
    fireEvent.click(screen.getByRole('button', { name: 'UI 桌面版' }))
    fireEvent.click(screen.getByText('使用已有图'))
    const file = new File(['png'], 'copied-ui.png', { type: 'image/png' })
    const item = { kind: 'file', type: 'image/png', getAsFile: () => file }
    fireEvent.paste(screen.getByRole('dialog'), { clipboardData: { items: [item] } })

    expect(addFiles).toHaveBeenCalledWith([file])
    expect(screen.getByText(/已添加 1 张/)).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('例如：城防塔升级界面'), {
      target: { value: '已有图页面' },
    })
    fireEvent.click(screen.getByRole('button', { name: '仅填入输入框' }))
    expect(setDraft.mock.calls[0]?.[0]).toContain('已从剪贴板粘贴参考图')
  })

  it('reports clipboard validation errors and ignores clipboard content outside the image branch', () => {
    const addFiles = vi.fn<(files: readonly File[]) => string | null>(() => '图片超过 8 MB 限制')
    openLauncher(addFiles)
    fireEvent.click(screen.getByRole('button', { name: 'UI 桌面版' }))
    const dialog = screen.getByRole('dialog')
    const file = new File(['png'], 'too-large.png', { type: 'image/png' })
    const image = { kind: 'file', type: 'image/png', getAsFile: () => file }

    fireEvent.paste(dialog, { clipboardData: { items: [image] } })
    expect(addFiles).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('使用已有图'))
    fireEvent.paste(dialog, { clipboardData: { items: [
      { kind: 'string', type: 'text/plain', getAsFile: () => null },
      { kind: 'file', type: 'image/png', getAsFile: () => null },
    ] } })
    expect(addFiles).not.toHaveBeenCalled()

    fireEvent.paste(dialog, { clipboardData: { items: [image] } })
    expect(addFiles).toHaveBeenCalledWith([file])
    expect(screen.getByText('图片超过 8 MB 限制')).toBeTruthy()
  })

  it('keeps an existing reference and lists unnamed pasted images', () => {
    const { addFiles } = openLauncher()
    fireEvent.click(screen.getByRole('button', { name: 'UI 桌面版' }))
    fireEvent.click(screen.getByText('使用已有图'))
    fireEvent.change(screen.getByPlaceholderText('可填写文件路径；聊天里的图片请先用输入框附件按钮添加'), {
      target: { value: 'existing.png' },
    })
    const unnamed = new File(['png'], '', { type: 'image/png' })
    fireEvent.paste(screen.getByRole('dialog'), { clipboardData: { items: [
      { kind: 'file', type: 'image/png', getAsFile: () => unnamed },
    ] } })

    expect(addFiles).toHaveBeenCalledWith([unnamed])
    expect(screen.getByText(/已添加 1 张：剪贴板图片/)).toBeTruthy()
    expect(screen.getByDisplayValue('existing.png')).toBeTruthy()
  })

  it('offers a simplified text-guided first stage', () => {
    const { setDraft } = openLauncher()
    fireEvent.click(screen.getByRole('button', { name: '文字导航版' }))
    fireEvent.change(screen.getByPlaceholderText('例如：龙玉交换系统'), {
      target: { value: '龙玉交换系统' },
    })
    fireEvent.change(screen.getByPlaceholderText('告诉 Agent 你已有的内容、想做的页面和最重要的限制'), {
      target: { value: '我有线框图，需要复用项目里的龙玉控件' },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始本阶段' }))

    expect(setDraft.mock.calls[0]?.[0]).toContain('模式：文字导航版')
    expect(setDraft.mock.calls[0]?.[0]).toContain('我有线框图，需要复用项目里的龙玉控件')
  })

  it('keeps stage buttons disabled until a task name is present and warns before replacing a draft', () => {
    openLauncher(undefined, 'session-draft', 'unfinished draft')
    fireEvent.click(screen.getByRole('button', { name: 'UI 桌面版' }))
    expect(screen.getByRole('button', { name: '开始本阶段' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('当前输入框已有草稿。本次操作会用当前阶段请求替换它。')).toBeTruthy()

    fireEvent.click(screen.getByText('继续现有任务'))
    fireEvent.change(screen.getByPlaceholderText('例如：城防塔升级界面'), {
      target: { value: '  继续任务  ' },
    })
    fireEvent.change(screen.getByPlaceholderText('例如：选择防御塔并展示升级消耗'), {
      target: { value: '继续验证' },
    })
    fireEvent.change(screen.getByPlaceholderText('可填写文件路径；聊天里的图片请先用输入框附件按钮添加'), {
      target: { value: 'workbench.json' },
    })
    fireEvent.change(screen.getByPlaceholderText('留空时默认使用 RedCliff 风格，并保持文字、数值、进度和点击区为 Native'), {
      target: { value: '只读检查' },
    })
    expect(screen.getByRole('button', { name: '开始本阶段' }).hasAttribute('disabled')).toBe(false)
  })

  it('ignores a stale click when a disabled stage button is forced active by the host DOM', () => {
    const { setDraft, submit } = openLauncher()
    fireEvent.click(screen.getByRole('button', { name: 'UI 桌面版' }))
    const button = screen.getByRole('button', { name: '开始本阶段' })
    button.removeAttribute('disabled')
    fireEvent.click(button)
    expect(setDraft).not.toHaveBeenCalled()
    expect(submit).not.toHaveBeenCalled()
  })

  it('ignores a stage click when its request disappears after render', () => {
    const launcher = new OasisUiLauncherStore()
    const setDraft = vi.fn()
    const submit = vi.fn()
    launcher.open({
      sessionId: 'stale-request', draft: '', addFiles: () => null,
      inputActions: { setDraft, submit },
    })
    const progress = launcher.getSnapshot().target!.progress
    let request: typeof REQUEST | null = REQUEST
    const snapshot = {
      mode: 'desktop' as const,
      currentStage: 1,
      status: 'ready' as const,
      taskName: REQUEST.pageName,
      get request() { return request },
    }
    Object.defineProperty(progress, 'getSnapshot', { value: () => snapshot })
    render(<OasisUiWorkflowOverlay launcher={launcher} />)
    expect(screen.getByRole('button', { name: '开始本阶段' }).hasAttribute('disabled')).toBe(false)

    request = null
    fireEvent.click(screen.getByRole('button', { name: '开始本阶段' }))
    expect(setDraft).not.toHaveBeenCalled()
    expect(submit).not.toHaveBeenCalled()
  })

  it('submits revision feedback without advancing and uses the chat-follow-up fallback when empty', () => {
    const { setDraft, submit, reopen } = openLauncher()
    fireEvent.click(screen.getByRole('button', { name: '文字导航版' }))
    fireEvent.change(screen.getByPlaceholderText('例如：龙玉交换系统'), {
      target: { value: '龙玉交换' },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始本阶段' }))

    reopen()
    fireEvent.change(screen.getByPlaceholderText('写下本阶段需要调整的地方；留空时会在聊天中继续补充'), {
      target: { value: '  补充配置表里的龙玉图标  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: '需要修改' }))
    expect(setDraft.mock.calls.at(-1)?.[0]).toContain('修改意见：补充配置表里的龙玉图标')

    reopen()
    fireEvent.click(screen.getByRole('button', { name: '需要修改' }))
    expect(setDraft.mock.calls.at(-1)?.[0]).toContain('请根据我接下来在对话中补充的意见继续修改当前阶段。')
    expect(submit).toHaveBeenCalledTimes(3)

    reopen()
    expect(screen.getByText('第 1/8 步')).toBeTruthy()
    expect(screen.getByText('等待你确认')).toBeTruthy()
  })

  it('ignores revision submission when persisted confirmation state has no request', () => {
    localStorage.setItem('dsh.oasis-ui.workflow.session-bad-confirmation', JSON.stringify({
      mode: 'text', currentStage: 0, status: 'awaiting_confirmation', taskName: '', request: null,
    }))
    const { setDraft, submit } = openLauncher(undefined, 'session-bad-confirmation')
    fireEvent.click(screen.getByRole('button', { name: '需要修改' }))
    expect(setDraft).not.toHaveBeenCalled()
    expect(submit).not.toHaveBeenCalled()
  })

  it('starts later stages, shows summary fallbacks, completes all eight stages, and resets', () => {
    const { launcher, setDraft, submit, reopen } = openLauncher()
    fireEvent.click(screen.getByRole('button', { name: 'UI 桌面版' }))
    fireEvent.change(screen.getByPlaceholderText('例如：城防塔升级界面'), {
      target: { value: '龙玉交换' },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始本阶段' }))

    for (let stage = 0; stage < OASIS_UI_STAGES.length; stage++) {
      reopen()
      fireEvent.click(screen.getByRole('button', { name: '确认通过并进入下一步' }))
      if (stage === OASIS_UI_STAGES.length - 1) break
      expect(screen.getByText(`第 ${stage + 2}/8 步`)).toBeTruthy()
      if (stage === 0) {
        expect(screen.getByText('由 Agent 从上下文推断')).toBeTruthy()
        expect(screen.getByText('使用当前会话附件与已确认产物')).toBeTruthy()
      }
      fireEvent.click(screen.getByRole('button', { name: '开始本阶段' }))
      expect(launcher.getSnapshot().open).toBe(false)
    }

    expect(screen.getByText('流程已完成')).toBeTruthy()
    expect(screen.getByText('8 个阶段均已由你确认')).toBeTruthy()
    expect(setDraft.mock.calls.at(-1)?.[0]).toContain('当前阶段：8/8 · 验收')
    expect(submit).toHaveBeenCalledTimes(8)
    fireEvent.click(screen.getByRole('button', { name: '重新开始流程' }))
    expect(screen.getByRole('button', { name: '文字导航版' })).toBeTruthy()
  })

  it('returns no dialog when the stage catalog cannot resolve persisted progress', () => {
    const stages = OASIS_UI_STAGES as Array<(typeof OASIS_UI_STAGES)[number]>
    const original = [...stages]
    const opened = openLauncher()
    fireEvent.click(screen.getByRole('button', { name: 'UI 桌面版' }))
    stages.splice(0, stages.length)
    act(() => { opened.reopen() })
    expect(screen.queryByRole('dialog')).toBeNull()
    stages.push(...original)
  })
})

describe('OasisUiLauncherButton', () => {
  it('opens the launcher with the current draft and attachment limits', () => {
    const launcher = new OasisUiLauncherStore()
    const addFiles = vi.fn(() => null)
    const inputActions = { setDraft: vi.fn(), submit: vi.fn() }
    const imageLimits = { maxCount: 3, maxBytes: 1024 }
    const props = {
      launcher,
      addFiles,
      sessionId: 'button-session',
      input: { phase: 'plain', draft: 'current draft' },
      inputActions,
      useProjection: vi.fn(() => imageLimits),
    } as unknown as OasisUiLauncherButtonProps
    render(<OasisUiLauncherButton {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '打开 Oasis UI 生图工具链' }))

    const target = launcher.getSnapshot().target
    expect(target).toMatchObject({ sessionId: 'button-session', draft: 'current draft', inputActions })
    const file = new File(['png'], 'one.png', { type: 'image/png' })
    expect(target?.addFiles([file])).toBeNull()
    expect(addFiles).toHaveBeenCalledWith([file], imageLimits)
  })

  it('disables launch while the composer is busy', () => {
    const launcher = new OasisUiLauncherStore()
    const props = {
      launcher,
      addFiles: vi.fn(() => null),
      sessionId: 'busy-session',
      input: { phase: 'submitting', draft: '' },
      inputActions: { setDraft: vi.fn(), submit: vi.fn() },
      useProjection: vi.fn(() => undefined),
    } as unknown as OasisUiLauncherButtonProps
    render(<OasisUiLauncherButton {...props} />)
    const button = screen.getByRole('button', { name: '打开 Oasis UI 生图工具链' })
    expect(button.hasAttribute('disabled')).toBe(true)
    fireEvent.click(button)
    expect(launcher.getSnapshot().open).toBe(false)
  })
})

describe('OasisUiLauncherStore', () => {
  it('keeps close idempotent and normalizes an inconsistent closed snapshot', () => {
    const launcher = new OasisUiLauncherStore()
    const listener = vi.fn()
    launcher.subscribe(listener)
    launcher.close()
    expect(listener).not.toHaveBeenCalled()

    launcher.open({
      sessionId: 'inconsistent-close', draft: '', addFiles: () => null,
      inputActions: { setDraft: () => {}, submit: () => {} },
    })
    const target = launcher.getSnapshot().target
    launcher.close()
    ;(launcher as unknown as { snapshot: { open: boolean; target: typeof target } }).snapshot = {
      open: false, target,
    }
    launcher.close()
    expect(launcher.getSnapshot()).toEqual({ open: false, target: null })
  })
})
