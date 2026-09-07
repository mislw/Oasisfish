import type { SessionSummary } from '@deepseek-ai/dsh-client-runtime/client'
import type { TodoItem } from '@deepseek-ai/dsh-tool-todo/client'

/** Canonical first-version Oasis UI workflow stages in display order. */
export const GAME_UI_STAGES = [
  { id: 'source', label: '来源' },
  { id: 'visual', label: '视觉' },
  { id: 'layering', label: '分层' },
  { id: 'workbench', label: '工作台' },
  { id: 'umg-requirements', label: 'UMG 需求' },
  { id: 'umg-build', label: 'UMG 构建' },
  { id: 'logic-binding', label: '逻辑绑定' },
  { id: 'acceptance', label: '最终验收' },
] as const

/** Durable status displayed for one game UI stage. */
export type GameUiStageStatus = TodoItem['status']
/** Canonical stage metadata combined with its current durable status. */
export type GameUiStage = typeof GAME_UI_STAGES[number] & { status: GameUiStageStatus }
/** Stage metadata accepted by a toolbox workflow. */
export type ToolStageDefinition = { readonly id: string; readonly label: string }
/** Toolbox stage combined with its current durable status. */
export type ToolStage = ToolStageDefinition & { status: GameUiStageStatus }

/**
 * Select the most recently updated dedicated game UI session.
 * @param rows - session summaries visible to the client.
 * @returns the newest `game-ui` session, when one exists.
 */
export function newestGameUiSession(rows: readonly SessionSummary[]): SessionSummary | undefined {
  return newestToolSession(rows, 'game-ui')
}

/**
 * Select the most recently updated session for one toolbox preset.
 * @param rows - session summaries visible to the client.
 * @param agentPreset - dedicated preset owned by the toolbox workflow.
 * @returns the newest matching session, when one exists.
 */
export function newestToolSession(rows: readonly SessionSummary[], agentPreset: string): SessionSummary | undefined {
  return rows.filter(row => row.agentPreset === agentPreset).sort((a, b) => b.updatedAt - a.updatedAt)[0]
}

/**
 * Project durable todo statuses onto one fixed toolbox workflow.
 * @param todos - current todo projection, or an absent projection for a new session.
 * @param definitions - ordered stages owned by the selected toolbox workflow.
 * @returns every workflow stage with its displayed status.
 */
export function projectStages(
  todos: readonly TodoItem[] | null | undefined,
  definitions: readonly ToolStageDefinition[] = GAME_UI_STAGES,
): readonly ToolStage[] {
  return definitions.map((stage, index) => ({
    ...stage,
    status: todos?.[index]?.status ?? 'pending',
  }))
}
