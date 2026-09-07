import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-tool-todo/client'
import { ToolboxPanel, StageStrip, ToolchainDetails, type ToolboxInjected } from './components.tsx'
import { GAME_IMAGE_STAGES, GAME_UI_STAGES, newestToolSession } from './model.ts'
import { en, zh } from './locales.ts'

const NS = 'gameToolbox'
const UI_ENTRY_PROMPT = '启动 UI 生成工具链。首先加载 oasis-wiki Skill，然后用 todo_write 建立并维护这 8 个阶段：来源、视觉、分层、工作台、UMG 需求、UMG 构建、逻辑绑定、最终验收。需要生图时加载 ai-image-prompts Skill，让当前默认对话 GPT 先细化完整英文 prompt 再调用 image_generate。一次只执行一个阶段，每个阶段完成后必须使用 ask_user_question 等待我确认，未经确认不得进入下一阶段。'
const IMAGE_ENTRY_PROMPT = '启动纯生图工作流。首先加载 oasis-wiki 和 ai-image-prompts Skill，然后用 todo_write 建立并维护这 4 个阶段：需求、规格、生成、确认。使用 skill_search 检索对应视觉配方，让当前默认对话 GPT 把我的描述优化为完整、细节充分的英文 prompt，再使用设置页配置的默认生图模型调用 image_generate；不要直接转发简短描述，不要进入 UI Tree、分层、Workbench、UMG、Lua 或编辑器写入流程。'
type ToolboxPreset = 'game-ui' | 'game-image'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { gameToolbox: keyof typeof zh } }
export const inject = ['slots', 'sessions', 'workspaces', 'layout', 'connection', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-game-toolbox: dictionaries')
  const api = (ctx.get('connection') as ConnectionHandle).api
  const start = async (agentPreset: ToolboxPreset, entryPrompt: string): Promise<void> => {
    const sessions = ctx.sessions.list.getSnapshot()
    const existing = newestToolSession(
      sessions.ids.map(id => sessions.byId[id]).filter(row => row !== undefined),
      agentPreset,
    )
    let sessionId: SessionId
    if (existing !== undefined) sessionId = existing.id
    else {
      const workspaces = ctx.workspaces.list.getSnapshot()
      const current = sessions.current
      const target = workspaces.items.find(item => current !== undefined && item.sessionIds.includes(current))?.workspaceId
        ?? workspaces.recentWorkspaceId
        ?? workspaces.items[0]?.workspaceId
      if (target === undefined) throw new Error('请先添加工作区')
      sessionId = await ctx.workspaces.connectWorkspace(target)
      const summary = ctx.sessions.list.getSnapshot().byId[sessionId]
      if (summary?.agentPreset !== agentPreset) {
        if (summary !== undefined && !summary.blank) throw new Error('目标会话已开始，不能切换为专用工具')
        const response = await api.agentPresets.select({ sessionId, agentPreset })
        if (!response.result.ok) throw new Error(response.result.error.message)
        ctx.sessions.noteAgentPreset(sessionId, response.result.value.agentPreset)
      }
    }
    ctx.sessions.open(sessionId)
    ctx.layout.openDetails()
    const binding = ctx.sessions.binding(sessionId)
    if (binding === undefined) throw new Error('专用工具会话尚未就绪')
    if (ctx.sessions.list.getSnapshot().byId[sessionId]?.blank === true) {
      const result = await binding.session.prompt([{ type: 'text', text: entryPrompt }], 'queue')
      if (!result.ok) throw new Error(result.error.message)
    }
  }
  ctx.slots.inject('sidebar.toolbox', () => ctx.slots.register({
    name: 'sidebar.toolbox',
    locale: NS,
    inject: (): ToolboxInjected => ({
      startUi: () => start('game-ui', UI_ENTRY_PROMPT),
      startImage: () => start('game-image', IMAGE_ENTRY_PROMPT),
    }),
  }, ToolboxPanel))
  const details = (): void => { ctx.layout.openDetails() }
  ctx.slots.inject('conversation.session.header.progress', () => ctx.slots.register({ name: 'conversation.session.header.progress', id: 'game-ui', locale: NS, inject: () => ({ agentPreset: 'game-ui', stages: GAME_UI_STAGES, openDetails: details }) }, StageStrip))
  ctx.slots.inject('conversation.session.header.progress', () => ctx.slots.register({ name: 'conversation.session.header.progress', id: 'game-image', locale: NS, inject: () => ({ agentPreset: 'game-image', stages: GAME_IMAGE_STAGES, openDetails: details }) }, StageStrip))
  ctx.slots.inject('conversation.details.summary', () => ctx.slots.register({ name: 'conversation.details.summary', id: 'game-ui', locale: NS, inject: () => ({ agentPreset: 'game-ui', stages: GAME_UI_STAGES, openDetails: details }) }, ToolchainDetails))
  ctx.slots.inject('conversation.details.summary', () => ctx.slots.register({ name: 'conversation.details.summary', id: 'game-image', locale: NS, inject: () => ({ agentPreset: 'game-image', stages: GAME_IMAGE_STAGES, openDetails: details }) }, ToolchainDetails))
}

export { GAME_IMAGE_STAGES, GAME_UI_STAGES, newestGameUiSession, newestToolSession, projectStages } from './model.ts'
