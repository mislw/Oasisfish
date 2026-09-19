/** Supported sources for the first workflow stage. */
export type OasisUiSource = 'generate' | 'existing' | 'continue'
/** Launcher interaction density selected by the user. */
export type OasisUiMode = 'text' | 'desktop'

/** Task context retained across every workflow stage. */
export interface OasisUiLaunchRequest {
  readonly source: OasisUiSource
  readonly pageName: string
  readonly purpose: string
  readonly references: string
  readonly constraints: string
}

/** User-visible guidance and acceptance output for one fixed stage. */
export interface OasisUiStageDefinition {
  readonly name: string
  readonly agentWork: string
  readonly userAcceptance: string
  readonly expectedOutput: string
}

/** Ordered workflow shared by the overlay rail and model-visible stage prompts. */
export const OASIS_UI_STAGES: readonly OasisUiStageDefinition[] = [
  {
    name: '来源',
    agentWork: '读取当前项目、附件、配置表和已有产物，确认页面目标、来源类型与可用参考，只提出一个真正缺失的关键问题。',
    userAcceptance: '检查任务目标、参考图、已有文件和项目范围是否准确。',
    expectedOutput: '来源清单、缺失项，以及可供 UI Tree 使用的明确输入。',
  },
  {
    name: 'UI Tree',
    agentWork: '检测项目并加载项目控件库，先搜索可复用控件，再建立完整 UI 规格与 UI Tree，标明父级、层级、交互、数据归属和 Native/Skin/Artwork/Composite 分类。',
    userAcceptance: '检查页面区域、节点父级、层级、操作、数据归属，以及龙玉等项目控件是否正确复用。',
    expectedOutput: '完整 UI Tree、直接复用清单、待确认控件和层级检查结果。',
  },
  {
    name: '视觉稿',
    agentWork: '基于已确认 UI Tree 和真实风格参考构建 Generation Package，调用允许的图片生成能力产出正式候选图，并保留生成记录。',
    userAcceptance: '检查布局、项目风格、信息层级、控件复用和文字可读性。',
    expectedOutput: '可审阅的正式视觉稿、生成记录和视觉自检结果。',
  },
  {
    name: '分层',
    agentWork: '拆分正式视觉稿，区分原生控件、皮肤、图标、装饰和组合控件，记录候选控件及其状态，不自动把候选提升为可复用控件。',
    userAcceptance: '检查每个切片的边界、遮挡关系、交互归属，以及哪些控件允许进入项目控件库。',
    expectedOutput: '分层清单、切片资源、控件候选和需要用户确认的决策。',
  },
  {
    name: 'Workbench',
    agentWork: '把已确认 UI Tree、视觉稿和切片交给 Workbench，生成可移动、可检查的控件层级，并提供真实可访问的审阅入口。',
    userAcceptance: '检查控件位置、尺寸、层级、遮挡、命名和可编辑性。',
    expectedOutput: 'Workbench 审阅入口、组件决定记录和修正后的层级。',
  },
  {
    name: 'UMG',
    agentWork: '把已确认层级映射为 Unreal UMG 结构、原生控件、资源引用、命名和编辑器验收步骤；未经单独授权不修改 UGC 工程资产。',
    userAcceptance: '检查 Widget 层级、控件类型、资源映射、锚点、适配和编辑器操作计划。',
    expectedOutput: 'UMG 交付计划、资源映射表和编辑器验收清单。',
  },
  {
    name: '逻辑',
    agentWork: '根据已确认页面梳理 Lua、配置、数据归属、事件、RPC、刷新和异常状态；先参考同类型模板与现有实现，未经授权不改代码或配置。',
    userAcceptance: '检查数据来源、服务端权威性、交互反馈、失败状态和多人行为。',
    expectedOutput: '逻辑接线计划、配置字段映射和可执行测试清单。',
  },
  {
    name: '验收',
    agentWork: '分别核对静态文件、浏览器界面、UMG 编译保存、PIE、多人和重连证据，只报告真实执行过的验收状态。',
    userAcceptance: '按清单确认视觉、交互、编辑器、运行时和多人结果，明确仍未验证的部分。',
    expectedOutput: '最终验收记录、已通过项、未通过项和仍待执行项。',
  },
]

const SOURCE_LABEL: Record<OasisUiSource, string> = {
  generate: '还没有 UI，需要先生成正式视觉稿',
  existing: '已经有 UI 图，使用当前会话附件或下面列出的文件',
  continue: '继续之前做到一半的 UI，先只读重发现实际产物',
}

const MODE_LABEL: Record<OasisUiMode, string> = {
  text: '文字导航版',
  desktop: 'UI 桌面版',
}

/** Inputs required to compile one stage-scoped user message. */
export interface OasisUiStagePromptRequest {
  readonly mode: OasisUiMode
  readonly stageIndex: number
  readonly request: OasisUiLaunchRequest
  readonly feedback?: string
}

/**
 * Compile one user-confirmed workflow stage into a model-visible request.
 * @param input - selected mode, stage, retained task context, and optional revision feedback.
 * @returns the complete trusted launcher message for the composer.
 */
export function buildOasisUiStagePrompt(input: OasisUiStagePromptRequest): string {
  const stage = OASIS_UI_STAGES[input.stageIndex]
  if (stage === undefined) throw new RangeError(`Unknown Oasis UI stage: ${input.stageIndex}`)
  const request = normalizeRequest(input.request)
  const feedback = input.feedback?.trim()
  const revision = feedback !== undefined && feedback !== ''

  return `[OASIS_UI_WORKFLOW]\n请切换到 Oasis Wiki 的 UI 生图工具链。\n\n模式：${MODE_LABEL[input.mode]}\n当前阶段：${input.stageIndex + 1}/${OASIS_UI_STAGES.length} · ${stage.name}\n本轮类型：${revision ? '修改当前阶段' : '开始当前阶段'}\n任务名称：${request.pageName}\n来源：${SOURCE_LABEL[request.source]}\n页面目的：${request.purpose}\n参考图/现有产物：${request.references}\n额外约束：${request.constraints}${revision ? `\n修改意见：${feedback}` : ''}\n\nAgent 本阶段工作：${stage.agentWork}\n用户本阶段验收：${stage.userAcceptance}\n预期产物：${stage.expectedOutput}\n\n执行约束：\n1. 先调用 skill 工具加载 oasis-wiki，并按 task-router 进入 UI Design System + Cowart UI Production。\n2. 检测当前项目并解析 RedCliff profile；搜索已有组件后再设计，优先复用项目控件库。\n3. 正式生成前必须有完整 UI Tree 和经过验证的 Generation Package；Style/Layout 参考必须真实进入生成调用。\n4. 正式生图优先使用内置 image_gen。能力不可用时返回 IMAGE_GENERATION_UNAVAILABLE，不得用 HTML/CSS/Chromium 截图伪造。\n5. 动态文字、数值、进度和点击热区保持 Native。\n6. 未经我明确授权，不修改 WidgetBlueprint、Lua、DataTable、.uasset、.umap 或其他 UGC 工程资产。\n7. 只完成当前阶段，不要进入下一阶段，也不要把计划、静态读取或未执行检查标记为完成。\n\n本轮完成后停止，等待用户在工具中确认。`
}

/**
 * Compile the first desktop stage for callers using the original launcher API.
 * @param request - initial task context.
 * @returns the complete stage-one launcher message.
 */
export function buildOasisUiWorkflowPrompt(request: OasisUiLaunchRequest): string {
  return buildOasisUiStagePrompt({ mode: 'desktop', stageIndex: 0, request })
}

function normalizeRequest(request: OasisUiLaunchRequest): OasisUiLaunchRequest {
  return {
    source: request.source,
    pageName: request.pageName.trim(),
    purpose: request.purpose.trim() || '请从项目与上下文推断，并只询问一个真正缺失的关键问题',
    references: request.references.trim() || '优先使用当前消息附件；若没有可读 Style Image，请停在来源阶段询问',
    constraints: request.constraints.trim()
      || '保持 RedCliff 现有风格，优先复用已有 Panel、Button、Tab；动态文字、数值、进度和点击热区保持 Native',
  }
}
