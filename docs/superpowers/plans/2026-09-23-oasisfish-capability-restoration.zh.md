# Oasisfish 能力恢复实施计划

[English](2026-09-23-oasisfish-capability-restoration.md) | 中文

> **面向代理执行者：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，逐任务实施本计划。各步骤使用复选框（`- [ ]`）跟踪。

**目标：** 在当前桌面发布架构上恢复已发布的 Oasisfish 默认模型偏好、本地 Skill 检索、原生记忆、辅助图片生成和图片优化能力。

**架构：** 将每项能力向前移植到当前 Cordis 职责所有者，而不是合并历史应用分支。Provider 无关服务与 Provider、模型可见工具保持分离；产品专属启用与二进制资源留在桌面和 Oasisfish 组合中。现有 Session 记录、附件格式、自动更新器行为、Oasis UI 工作流、Codex 桥接、内置 Oasis Wiki 和 Wallpaper Engine 集成继续作为权威实现。

**技术栈：** TypeScript ESM、Cordis、Typert Remote、Schemastery 与 Zod、React、SQLite、Transformers.js/ONNX、Vitest、Playwright、pnpm workspaces、Electron Builder。

**规格：** [Oasisfish 能力恢复设计](../specs/2026-09-23-oasisfish-capability-restoration-design.zh.md)

## 全局约束

- 从隔离工作树中的 `codex/release-v1.20260923.1` 开始，并在实施前创建 `codex/oasisfish-capability-restoration`。
- 不合并历史产品分支，也不替换当前桌面启动、自动更新器、Oasis UI 工作流、Codex 桥接或 Wallpaper Engine 实现。
- 完整保留已发布的 `native_memory` 存储域名称、版本 `0` 和存储类型。
- 模型可见记忆、检索、优化和生成数据必须使用现有持久消息、工具和附件记录；不修改 `agent-loop`，也不增加 Session 事件类型。
- 本地 Skill 源码、嵌入请求、记忆记录、凭据和附件字节不得离开各自操作，也不得出现在无关诊断中。
- 产品可见 UI 文案必须使用类型化英文和简体中文 locale 字典。
- 每个新注册必须使用 `ctx.effect()`、`ctx.on()` 或注册表 disposer，并证明可以释放。
- 每项产品可见能力都需要真实 Loader 组合测试和相关无密钥 Session 或 Web 快照。
- 保留一个结尾换行、严格 TypeScript、ESM 导入、包 README 配对、生成目录和当前包组约定。

## 执行准备

- [ ] 验证发布工作树干净并创建实施分支。

```powershell
git status --short --branch
git switch -c codex/oasisfish-capability-restoration
```

- [ ] 记录基线检查，不运行完整仓库测试。

```powershell
pnpm exec vitest run packages/core/agent-default-model/tests/agent-default-model.spec.ts packages/api/session-controller/tests/session-models.host.spec.ts
pnpm run test:docs
```

### 任务 1：恢复默认模型设置编辑器

**文件：**
- 修改：`packages/api/session-controller/src/types.ts`
- 修改：`packages/api/session-controller/src/commands.ts`
- 修改：`packages/api/session-controller/src/index.ts`
- 修改：`packages/api/session-controller/tests/session-models.host.spec.ts`
- 修改：`packages/client/ui-settings-models/src/client/store.ts`
- 修改：`packages/client/ui-settings-models/src/client/ModelsSection.tsx`
- 修改：`packages/client/ui-settings-models/src/client/ModelsSection.module.css`
- 修改：`packages/client/ui-settings-models/src/client/locales.ts`
- 修改：`packages/client/ui-settings-models/tests/store.client.spec.ts`
- 修改：`packages/client/ui-settings-models/tests/components.client.spec.tsx`
- 修改：`packages/client/ui-settings-models/README.md`
- 修改：`packages/client/ui-settings-models/README.zh.md`

**接口：**
- 消费：`ctx.agentDefaultModel.currentSelection()`、`ctx.agentDefaultModel.saveSelection(selection)` 和 `ctx.llm.resolveCallConfig(request)`。
- 产出：`session.setDefaultModel(request): Promise<{ selected: AgentModelSelection }>` 和由 `ModelCatalog.default` 支持的模型设置页编辑器。

- [ ] 增加失败的 Host 测试，覆盖无 Session 保存规范化默认值、清除省略的推理强度和拒绝不可用路由。

```text
expectValue(await remote.setDefaultModel({ provider: 'deepseek-official', model: 'deepseek-chat' }))
expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'deepseek-official', model: 'deepseek-chat' })
```

- [ ] 运行聚焦 Host 测试，确认缺少 Remote 方法时失败。

```powershell
pnpm exec vitest run packages/api/session-controller/tests/session-models.host.spec.ts
```

- [ ] 增加类型化请求、Remote 方法和命令实现；共享 `selectModel()` 使用的 `resolveCallConfig()` 规范化，并返回独立 selected 值。

```ts
export interface SessionSetDefaultModelRequest {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}
```

- [ ] 增加失败的 Client 测试，覆盖初始默认选择、Provider/模型切换、推理强度清除、保存失败和默认 Provider 删除保护。

```powershell
pnpm exec vitest run packages/client/ui-settings-models/tests/store.client.spec.ts packages/client/ui-settings-models/tests/components.client.spec.tsx
```

- [ ] 为 `ModelsSettingsState` 增加目录默认值，与 Provider 目录一起加载 `session.modelCatalog()`，实现 `selectDefault()`，并渲染本地化 Provider/模型/强度控件与保存按钮。

- [ ] 运行聚焦 Host 和 Client 测试，更新 README 配对，重新记录翻译配对并提交。

```powershell
pnpm exec vitest run packages/core/agent-default-model/tests/agent-default-model.spec.ts packages/api/session-controller/tests/session-models.host.spec.ts packages/client/ui-settings-models/tests/store.client.spec.ts packages/client/ui-settings-models/tests/components.client.spec.tsx
git add packages/api/session-controller packages/client/ui-settings-models
git commit -m "feat(models): restore default model settings"
```

### 任务 2：恢复本地 Skill 检索服务与 Provider

**文件：**
- 从 `v1.20260912.4` 恢复：`packages/skill/skill-search/`
- 从 `v1.20260912.4` 恢复：`packages/skill/skill-search-local/`
- 从 `v1.20260912.4` 恢复：`packages/skill/tool-skill-search/`
- 修改：`packages/skill/README.md`
- 修改：`packages/skill/README.zh.md`
- 修改：`tsconfig.base.json`
- 修改：`tsconfig.host.json`
- 修改：`pnpm-workspace.yaml`

**接口：**
- 产出：`ctx.skillSearch.registerProvider(name, provider)`、语料声明和具有有界可寻址来源结果的 `search(request, options)`。
- Provider 输入保留在已加载 Skill 资源根目录内；Provider 输出包含 Skill id、相对路径、从一开始的行号、摘录和分数。

- [ ] 恢复三个包树作为实现起点，不恢复历史组合文件。

```powershell
git restore --source=v1.20260912.4 -- packages/skill/skill-search packages/skill/skill-search-local packages/skill/tool-skill-search
```

- [ ] 运行其现有测试并记录当前 API、依赖、编译器或生命周期失败。

```powershell
pnpm exec vitest run packages/skill/skill-search/tests packages/skill/skill-search-local/tests packages/skill/tool-skill-search/tests
```

- [ ] 将服务定义适配到当前品牌 id、Skill 资源 API、Cordis effect 释放、类型化工具失败和当前包清单；保留已发布的公开操作名。

- [ ] 将受限发现、标题感知切分、事务 SQLite 刷新、本地嵌入、混合排序、取消和缓存兼容适配到当前存储与 Skill 加载 API。

- [ ] 在每项适配前增加或更新失败测试，覆盖路径穿越、重解析点、提交前取消、不兼容缓存、Provider 释放、中文检索和有界结果。

- [ ] 运行包测试和类型检查，更新包 README 与 Skill 子系统配对，然后提交 Provider 无关能力。

```powershell
pnpm exec vitest run packages/skill/skill-search/tests packages/skill/skill-search-local/tests packages/skill/tool-skill-search/tests
pnpm run typecheck
git add packages/skill tsconfig.base.json tsconfig.host.json pnpm-workspace.yaml pnpm-lock.yaml docs/subsystems/skills.md docs/subsystems/skills.zh.md
git commit -m "feat(skill): restore local skill retrieval"
```

### 任务 3：为 Oasisfish 桌面打包 Skill 检索

**文件：**
- 修改：`packages/bundle/base/cordis.patch.yml`
- 修改：`packages/bundle/base/package.json`
- 修改：`apps/desktop-host/oasisfish.cordis.patch.yml`
- 修改：`apps/desktop-runtime/package.json`
- 修改：`apps/desktop/package.json`
- 修改：`apps/desktop/scripts/prepare-primary-runtime.ts`
- 修改：`apps/desktop/scripts/staged-inventory.mjs`
- 修改：`apps/desktop/tests/primary-runtime-preparation.spec.ts`
- 修改：`apps/desktop/tests/staged-inventory.spec.ts`
- 创建或恢复：由当前运行时准备职责所有者选择位置的打包嵌入模型清单与许可模型文件。
- 增加：`apps/cli/tests/` 和 `apps/desktop/tests/` 下的真实 Loader 组合与打包搜索测试。

**接口：**
- 消费：任务 2 的包和当前内置 Skill 目录。
- 产出：显式 `oasis-wiki` 与图片指导语料声明，以及不可变本地模型资源和可变缓存路径。

- [ ] 增加失败的组合测试，要求仅存在声明语料并拒绝未声明 Skill 资源。

- [ ] 增加失败的运行时准备测试，覆盖模型清单、哈希、解析器依赖和缺失文件拒绝。

- [ ] 将已发布模型资源与语料配置移植到当前桌面资源准备，不增加运行时下载路径。

- [ ] 增加无密钥真实组合搜索快照和重用已提交索引的打包重启冒烟。

- [ ] 运行聚焦组合、暂存和搜索检查，然后提交。

```powershell
pnpm exec vitest run apps/desktop/tests/primary-runtime-preparation.spec.ts apps/desktop/tests/staged-inventory.spec.ts apps/cli/tests/desktop-oasis-wiki.snapshot.ts
git add apps packages/bundle/base pnpm-lock.yaml
git commit -m "build(desktop): package local skill retrieval"
```

### 任务 4：恢复原生记忆服务与本地持久化

**文件：**
- 从 `v1.20260912.4` 恢复：`packages/memory/README.md`
- 从 `v1.20260912.4` 恢复：`packages/memory/README.zh.md`
- 从 `v1.20260912.4` 恢复：`packages/memory/memory/`
- 从 `v1.20260912.4` 恢复：`packages/memory/memory-local/`
- 修改：`pnpm-workspace.yaml`
- 修改：`tsconfig.base.json`
- 修改：`tsconfig.host.json`

**接口：**
- 产出：已发布的 `MemoryProvider` 操作和 `native_memory` 存储域版本 `0`。
- 存储字段保持为 `enabled` 加具有 id、项目标识、内容、来源信息和时间戳的不可变用户/项目记录。

- [ ] 恢复包组与两个服务/Provider 包，不恢复组合或 Client 代码。

```powershell
git restore --source=v1.20260912.4 -- packages/memory/README.md packages/memory/README.zh.md packages/memory/memory packages/memory/memory-local
```

- [ ] 运行恢复后的测试，确认当前存储域或品牌 id 不兼容性在适配前失败。

```powershell
pnpm exec vitest run packages/memory/memory/tests packages/memory/memory-local/tests
```

- [ ] 在语义上逐字保留 `memoryDomainSpec`：`name: 'native_memory'`、`version: 0`、已发布全局 schema，并且不增加表。

- [ ] 只适配周围的当前 API，然后增加无效 Fixture，覆盖重复 Provider、项目范围不可用、类似秘密的内容、容量、原子写入失败、取消和异步释放。

- [ ] 运行包测试和持久化验证；要求声明的 Session 持久化变化为零，并且没有存储域后继。

```powershell
pnpm exec vitest run packages/memory/memory/tests packages/memory/memory-local/tests
pnpm --silent run verify-persistence-changes --json
git add packages/memory pnpm-workspace.yaml tsconfig.base.json tsconfig.host.json pnpm-lock.yaml
git commit -m "feat(memory): restore native memory storage"
```

### 任务 5：恢复记忆工具、设置 UI 和已记录上下文

**文件：**
- 从 `v1.20260912.4` 恢复：`packages/memory/tool-memory/`
- 从 `v1.20260912.4` 恢复：`packages/client/ui-settings-memory/`
- 修改：`packages/api/remotes/src/client/index.ts`
- 修改：`packages/client/modules/src/index.ts`
- 修改：`packages/client/modules/tests/node-half.client.spec.ts`
- 修改：`packages/bundle/base/cordis.patch.yml`
- 修改：`packages/bundle/base/package.json`
- 修改：`packages/bundle/web-app/cordis.patch.yml`
- 修改：`packages/bundle/web-app/package.json`
- 增加：当前 `snapshots/session/` 职责下的无密钥原生记忆 Session 快照。

**接口：**
- 消费：任务 4 的 `ctx.memory` 操作和当前 Agent Session/cwd 解析。
- 产出：`memory_manage`、每轮第一次接受步骤的已记录上下文注入和类型化记忆设置 Remote 操作。

- [ ] 恢复工具与 Client 包，并运行其测试以暴露当前 Agent 事件、Typert、Slot 和设置差异。

- [ ] 增加失败的 Session 测试，证明已启用可见记录在第一次接受步骤进入一次，以带来源用户消息追加，且不进入同一轮的后续步骤。

- [ ] 将 Consumer 适配到当前 `agent/pre-step` waterfall 语义，委托时始终调用 `next()`，重写消息时保留 `startsRequestSeries`。

- [ ] 将 Remote 方法名、Client store、本地化控件和项目可见性适配到当前 API 与设置 Slot；保留幂等删除行为。

- [ ] 将包加入 base/Web 组合和 Client 模块目录，然后运行工具、UI、真实组合与无密钥快照测试。

```powershell
pnpm exec vitest run packages/memory/tool-memory/tests packages/client/ui-settings-memory/tests packages/client/modules/tests/node-half.client.spec.ts
pnpm run test:snapshot -- -t native-memory
git add packages/memory packages/client/ui-settings-memory packages/client/modules packages/api/remotes packages/bundle snapshots/session pnpm-lock.yaml
git commit -m "feat(memory): restore memory tools and settings"
```

### 任务 6：恢复辅助图片生成与持久结果

**文件：**
- 从 `v1.20260912.4` 恢复：`packages/attachment/image-generation/`
- 从 `v1.20260912.4` 恢复：`packages/attachment/tool-image-generate/`
- 修改：`packages/attachment/README.md`
- 修改：`packages/attachment/README.zh.md`
- 修改：`packages/client/ui-attachment/src/client/index.ts`
- 恢复并适配：`packages/client/ui-attachment/src/client/{ImageGenerateResult.tsx,ImageGenerateResult.module.css}`
- 修改：`packages/client/ui-attachment/tests/`
- 修改：`tsconfig.base.json`
- 修改：`tsconfig.host.json`

**接口：**
- 产出：`ctx.imageGeneration.generate(request, options)` 和 `image_generate` 工具。
- 成功结果包含实际 Provider/模型标识和持久图片附件引用；附件提交前不发布成功。

- [ ] 恢复两个 Host 包与历史结果组件作为起点。

```powershell
$resultDir = 'packages/client/ui-attachment/src/client'
git restore --source=v1.20260912.4 -- packages/attachment/image-generation packages/attachment/tool-image-generate "$resultDir/ImageGenerateResult.tsx" "$resultDir/ImageGenerateResult.module.css"
```

- [ ] 运行恢复测试并增加当前失败测试，覆盖 Provider 注册、凭据脱敏、取消、一次备用、引用授权、附件失败和结果渲染。

- [ ] 将服务适配到当前 LLM 路由配置、凭据、附件准入、直接用户图片引用和工具完成语义。

- [ ] 将 Client 结果注册适配到当前原始事件 Presenter 和持久工具结果元数据，不存储仅 UI 状态。

- [ ] 运行聚焦 Host 和 Client 测试，更新 README 配对，然后提交。

```powershell
pnpm exec vitest run packages/attachment/image-generation/tests packages/attachment/tool-image-generate/tests packages/client/ui-attachment/tests
git add packages/attachment packages/client/ui-attachment tsconfig.base.json tsconfig.host.json pnpm-lock.yaml
git commit -m "feat(image): restore auxiliary generation"
```

### 任务 7：恢复图片路由设置与产品组合

**文件：**
- 修改：`packages/client/ui-settings-models/src/client/store.ts`
- 修改：`packages/client/ui-settings-models/src/client/ModelsSection.tsx`
- 修改：`packages/client/ui-settings-models/src/client/locales.ts`
- 修改：`packages/client/ui-settings-models/tests/`
- 修改：`packages/bundle/base/cordis.patch.yml`
- 修改：`packages/bundle/base/package.json`
- 修改：`packages/bundle/web-app/cordis.patch.yml`
- 修改：`packages/bundle/web-app/package.json`
- 修改：已发布预设职责下的当前 Oasisfish Agent 预设配置。
- 增加：使用 Fixture Provider 的无密钥图片生成 Session 快照。

**接口：**
- 消费：任务 6 的服务/工具和当前可配置 Provider 目录。
- 产出：具有模型 id 与端点路径的完整主/备用图片路由设置。

- [ ] 增加失败的 Client 测试，覆盖未设置路由、主/备用选择、端点校验、清除备用、保存失败和 Provider 删除保护。

- [ ] 将图片路由编辑器移植到当前模型页，复用其连接后的 Provider 目录和类型化设置操作。

- [ ] 通过当前 base/Web 组合挂载服务、Provider 适配器、工具和结果 UI；只在目标 Oasisfish 预设中启用 `image_generate`。

- [ ] 增加无密钥快照，覆盖主路由失败、一次备用、持久附件输出和在工具结果处结束轮次。

- [ ] 运行聚焦设置、组合和快照检查，然后提交。

```powershell
pnpm exec vitest run packages/client/ui-settings-models/tests packages/attachment/image-generation/tests packages/attachment/tool-image-generate/tests
pnpm run test:snapshot -- -t image-generation
git add packages/client/ui-settings-models packages/bundle apps snapshots/session pnpm-lock.yaml
git commit -m "feat(image): restore image route settings"
```

### 任务 8：集成图片优化能力

**文件：**
- 从 `codex/dsh-image-optimization` 恢复：`packages/image/`
- 从 `codex/dsh-image-optimization` 恢复：`docs/subsystems/image-optimization.md`
- 从 `codex/dsh-image-optimization` 恢复：`docs/subsystems/image-optimization.zh.md`
- 从 `codex/dsh-image-optimization` 恢复：`docs/subsystems/image-optimization.i18n.yaml`
- 从 `codex/dsh-image-optimization` 恢复：`snapshots/session/image-optimization/` 下的图片优化快照。
- 修改：`packages/bundle/base/cordis.patch.yml`
- 修改：`packages/bundle/base/package.json`
- 修改：相关 Oasisfish 预设和 UI 工作流提示。
- 修改：`packages/image/` 所需的工作区、tsconfig、生成器和包组清单。

**接口：**
- 产出：`ctx.imageOptimizer.optimize(request, options)`、`image_optimize`、离线库 Provider 和打包 `image-generation` Skill。
- 已准备规格保持执行器无关；任务 6 仍是唯一图片执行职责所有者。

- [ ] 恢复已完成的本地包组与快照，不恢复无关分支文件。

```powershell
git restore --source=codex/dsh-image-optimization -- packages/image docs/subsystems/image-optimization.md docs/subsystems/image-optimization.zh.md docs/subsystems/image-optimization.i18n.yaml snapshots/session/image-optimization
```

- [ ] 运行所有图片包组测试并识别与当前发布分支的冲突。

```powershell
pnpm exec vitest run packages/image
```

- [ ] 适配包清单、附件类型、当前输入引用解析、工具注册和 Bundle 组合，同时保留已完成的公开类型与失败代码。

- [ ] 更新生成 Skill 和 Oasis UI 工作流提示，要求在优化返回 `prepared` 时显式依次调用 `image_optimize` 与 `image_generate`，并在 `needs_clarification` 时停止。

- [ ] 运行图片包组测试、当前 Oasis UI 工作流测试和无密钥优化快照，然后提交。

```powershell
pnpm exec vitest run packages/image packages/client/ui-oasis-workflow/tests
pnpm run test:snapshot -- -t image-optimization
git add packages/image packages/bundle packages/client/ui-oasis-workflow snapshots/session docs/subsystems pnpm-workspace.yaml tsconfig.base.json tsconfig.host.json pnpm-lock.yaml scripts
git commit -m "feat(image): integrate deterministic optimization"
```

### 任务 9：完成桌面打包与跨能力组合

**文件：**
- 修改：`apps/desktop-host/package.json`
- 修改：`apps/desktop-host/oasisfish.cordis.patch.yml`
- 修改：`apps/desktop-runtime/package.json`
- 修改：`apps/desktop/package.json`
- 修改：`apps/desktop/scripts/prepare-primary-runtime.ts`
- 修改：`apps/desktop/scripts/staged-inventory.mjs`
- 修改：桌面准备、冒烟和 Profile 测试。
- 修改：`scripts/gen-cordis-catalog.ts`
- 修改：`scripts/gen-tool-catalog.ts`
- 修改：`scripts/gen-doc-graphs.ts`
- 修改：`packages/extensions/tool-cordis/src/api-catalog.ts`

**接口：**
- 消费：所有先前任务包和当前桌面 Profile 准备。
- 产出：一个包含恢复能力、当前更新支持、Oasis Wiki、Codex 桥接、Oasis UI 工作流和 Wallpaper Engine 的官方桌面组合。

- [ ] 增加失败的真实 Profile 测试，断言每个必需行恰好出现一次，通用 Profile 保留原默认值。

- [ ] 更新桌面依赖与解析器清单、资源库存、运行时准备和生成目录。

- [ ] 增加集成 Fixture 流程：选择默认模型、增加用户/项目记忆、搜索 Oasis Wiki、优化图片请求、生成 Fixture 图片、重启并验证持久状态。

- [ ] 运行聚焦 Profile、准备、冒烟和生成目录检查；修复缺失依赖，不增加运行时安装。

```powershell
pnpm exec vitest run apps/desktop-host/tests/oasisfish-profile.spec.ts apps/desktop/tests/primary-runtime-preparation.spec.ts apps/desktop/tests/staged-inventory.spec.ts apps/desktop/tests/smoke-unpacked.spec.ts
pnpm run doc-sync
git add apps packages scripts docs pnpm-lock.yaml
git commit -m "feat(desktop): compose restored Oasisfish capabilities"
```

### 任务 10：记录用户工作流并运行最终验证

**文件：**
- 修改：受影响的包 README 配对与子系统配对。
- 修改：`apps/desktop/README.md`
- 修改：`apps/desktop/README.zh.md`
- 增加：通过 PR 附件工作流保存的默认模型、记忆和图片工作流产品可见 GIF 证据。
- 修改：仅通过生成器更新的配置、工具、事件、模块和持久化目录。

**接口：**
- 产出：每项恢复能力的评审证据与当前文档。

- [ ] 针对真实 Pull Request 桌面服务器和模型流程使用 `record-browser-gif`，记录已变更 GUI 工作流。

- [ ] 运行 `dsh-pre-push-checks` 选择的聚焦测试；包含实际选择的每条命令，不要只为提交重复已经通过的检查。

- [ ] 运行传出跨包改动所需的最终文档、类型、构建、hygiene 和差异检查。

```powershell
pnpm run test:docs
pnpm run doc-sync
pnpm run typecheck
pnpm run build
pnpm run hygiene
git diff --check
```

- [ ] 检查完整分支差异中的无关改动、持久化声明、生成文件、locale 职责、包依赖和当前桌面行为。

- [ ] 提交最终文档与生成输出。

```powershell
git add apps packages docs scripts snapshots pnpm-lock.yaml pnpm-workspace.yaml tsconfig*.json
git commit -m "docs(oasisfish): document restored capabilities"
```

- [ ] 只有当所有选定检查通过且工作树干净后，才调用 `superpowers:finishing-a-development-branch` 并给出集成选项。
