/** Simplified Chinese game-toolbox dictionary and key-set source. */
export const zh = {
  title: '游戏开发工具',
  ui: 'UI 生成工具链',
  uiDescription: '从视觉方案到 UMG 构建、逻辑绑定与验收',
  image: '纯生图',
  imageDescription: '整理图片需求并调用默认生图模型',
  open: '打开',
  resume: '继续',
  starting: '正在启动…',
  needsWorkspace: '请先在会话页添加工作区',
  upcoming: '后续接入',
  lua: 'Lua 开发',
  data: '配置表',
  logs: '日志诊断',
  stages: '执行阶段',
  current: '当前阶段',
  artifacts: '产物与检查',
  noArtifacts: 'Agent 完成阶段后，产物和检查项会记录在会话中。',
  details: '打开任务详情',
} satisfies Record<string, string>
/** Game-toolbox locale key. */
export type GameToolboxKey = keyof typeof zh
/** English game-toolbox dictionary, complete against the Chinese key set. */
export const en = {
  title: 'Game Development Tools', ui: 'UI Generation Toolchain',
  uiDescription: 'From visual direction through UMG build, binding, and acceptance',
  image: 'Image Generation', imageDescription: 'Refine an image request and use the default image model',
  open: 'Open', resume: 'Resume', starting: 'Starting…', needsWorkspace: 'Add a Workspace from Sessions first',
  upcoming: 'Coming later', lua: 'Lua Development', data: 'Data Tables', logs: 'Log Diagnostics',
  stages: 'Stages', current: 'Current stage', artifacts: 'Artifacts and checks',
  noArtifacts: 'Artifacts and checks appear in the session as the agent completes stages.', details: 'Open task details',
} satisfies Record<GameToolboxKey, string>
