import { describe, expect, it } from 'vitest'
import { buildOasisUiStagePrompt, buildOasisUiWorkflowPrompt } from '../src/workflow.ts'

describe('buildOasisUiWorkflowPrompt', () => {
  it('compiles the trusted marker and every hard workflow gate', () => {
    const prompt = buildOasisUiWorkflowPrompt({
      source: 'generate',
      pageName: '城防塔升级',
      purpose: '展示升级消耗',
      references: 'style.png',
      constraints: '保留动态金币文本',
    })

    expect(prompt).toContain('[OASIS_UI_WORKFLOW]')
    expect(prompt).toContain('城防塔升级')
    expect(prompt).toContain('RedCliff profile')
    expect(prompt).toContain('UI Tree')
    expect(prompt).toContain('Generation Package')
    expect(prompt).toContain('image_optimize')
    expect(prompt).toContain('needs_clarification')
    expect(prompt).toContain('prepared')
    expect(prompt).toContain('image_generate')
    expect(prompt.indexOf('image_optimize')).toBeLessThan(prompt.indexOf('image_generate'))
    expect(prompt).toContain('未经我明确授权，不修改')
  })

  it('passes only prepared executor inputs to generation and stops for clarification', () => {
    const prompt = buildOasisUiStagePrompt({
      mode: 'desktop',
      stageIndex: 2,
      request: {
        source: 'generate',
        pageName: '城防塔升级',
        purpose: '展示升级消耗',
        references: 'style.png',
        constraints: '保留动态金币文本',
      },
    })

    expect(prompt).toContain('needs_clarification 时停止')
    expect(prompt).toContain('prepared prompt、references、output settings 和 required capabilities')
    expect(prompt).toContain('再调用 image_generate')
  })

  it('describes the selected mode, current stage, responsibilities, and acceptance output', () => {
    const prompt = buildOasisUiStagePrompt({
      mode: 'text',
      stageIndex: 1,
      request: {
        source: 'continue',
        pageName: '龙玉交换',
        purpose: '复用项目控件库完成交换页面',
        references: '当前会话附件',
        constraints: '优先复用龙玉控件',
      },
    })

    expect(prompt).toContain('模式：文字导航版')
    expect(prompt).toContain('当前阶段：2/8 · UI Tree')
    expect(prompt).toContain('Agent 本阶段工作：')
    expect(prompt).toContain('用户本阶段验收：')
    expect(prompt).toContain('预期产物：')
    expect(prompt).toContain('本轮完成后停止，等待用户在工具中确认')
  })

  it('keeps revision requests in the current stage', () => {
    const prompt = buildOasisUiStagePrompt({
      mode: 'desktop',
      stageIndex: 2,
      feedback: '按钮需要改成项目里的金色主按钮',
      request: {
        source: 'existing',
        pageName: '龙玉交换',
        purpose: '',
        references: 'dragon-jade.png',
        constraints: '',
      },
    })

    expect(prompt).toContain('模式：UI 桌面版')
    expect(prompt).toContain('当前阶段：3/8 · 视觉稿')
    expect(prompt).toContain('本轮类型：修改当前阶段')
    expect(prompt).toContain('按钮需要改成项目里的金色主按钮')
    expect(prompt).toContain('不要进入下一阶段')
  })

  it('rejects an unknown stage index', () => {
    expect(() => buildOasisUiStagePrompt({
      mode: 'desktop',
      stageIndex: 99,
      request: {
        source: 'generate', pageName: 'x', purpose: '', references: '', constraints: '',
      },
    })).toThrow(new RangeError('Unknown Oasis UI stage: 99'))
  })
})
