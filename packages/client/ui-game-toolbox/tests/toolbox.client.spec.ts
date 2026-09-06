import { describe, expect, it } from 'vitest'
import type { SessionSummary } from '@deepseek-ai/dsh-client-runtime/client'
import {
  GAME_IMAGE_STAGES,
  GAME_UI_STAGES,
  newestToolSession,
  projectStages,
} from '../src/client/model.ts'

describe('game toolbox model', () => {
  it('selects the newest dedicated game-ui session', () => {
    const rows = [
      { id: 'a', agentPreset: 'game-ui', updatedAt: 2 },
      { id: 'b', agentPreset: 'standard', updatedAt: 9 },
      { id: 'c', agentPreset: 'game-ui', updatedAt: 7 },
    ] as SessionSummary[]
    expect(newestToolSession(rows, 'game-ui')?.id).toBe('c')
  })

  it('selects the newest dedicated game-image session independently', () => {
    const rows = [
      { id: 'a', agentPreset: 'game-image', updatedAt: 2 },
      { id: 'b', agentPreset: 'game-ui', updatedAt: 9 },
      { id: 'c', agentPreset: 'game-image', updatedAt: 7 },
    ] as SessionSummary[]
    expect(newestToolSession(rows, 'game-image')?.id).toBe('c')
  })

  it('projects the durable todo list onto the canonical eight stages', () => {
    const stages = projectStages([
      { content: '来源', status: 'completed' },
      { content: '视觉', status: 'in_progress' },
    ])
    expect(stages).toHaveLength(8)
    expect(stages[0]).toMatchObject({ id: 'source', status: 'completed' })
    expect(stages[1]).toMatchObject({ id: 'visual', status: 'in_progress' })
    expect(stages.slice(2).every(stage => stage.status === 'pending')).toBe(true)
    expect(GAME_UI_STAGES.map(stage => stage.label)).toEqual([
      '来源', '视觉', '分层', '工作台', 'UMG 需求', 'UMG 构建', '逻辑绑定', '最终验收',
    ])
  })

  it('projects the pure image workflow onto four focused stages', () => {
    const stages = projectStages([
      { content: '需求', status: 'completed' },
      { content: '规格', status: 'in_progress' },
    ], GAME_IMAGE_STAGES)
    expect(stages).toHaveLength(4)
    expect(stages.map(stage => stage.label)).toEqual(['需求', '规格', '生成', '确认'])
    expect(stages.map(stage => stage.status)).toEqual(['completed', 'in_progress', 'pending', 'pending'])
  })
})
