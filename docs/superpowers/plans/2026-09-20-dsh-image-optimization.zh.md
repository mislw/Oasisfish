# DSH 通用图像优化能力实施计划

[English](2026-09-20-dsh-image-optimization.md) | 中文

> **面向 Agent 工作器：** 必须使用子 Skill：通过 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐项实施本计划。步骤使用复选框（`- [ ]`）语法跟踪。

**目标：** 为所有随 DSH 交付的 Agent 与 Profile 提供确定性、模型无关的 `image_optimize` 能力；该能力由受控离线图像提示词库支持，并可供 Oasis/Cowart 工作流复用。

**架构：** 新增包含四个包的 `packages/image/` 能力组：Service Definition 统一负责校验、Provider 排序、合并与编译；一个 Provider 负责随包发布的案例库；一个 Consumer 暴露 `image_optimize`；一个内置 Skill 指导 Agent 何时以及如何使用结果。Host 所有的服务、Provider 与 Skill 只组合一次，Tool 则挂载到各 Profile 拥有面向模型工具的位置；实际图像执行不在本次交付范围内。

**技术栈：** TypeScript ESM、Cordis 服务／effect／事件、Schemastery 配置、Zod Provider 结果校验、DSH Tool／Skill／Attachment API、Vitest、YAML、JSON fixture、无密钥 Session 快照，以及现有 Oasis Skill 脚本的 Python 测试。

**设计文档：** `docs/superpowers/specs/2026-09-20-dsh-image-optimization-design.zh.md`

## 全局约束

- 公共接口与生成结果不得出现 GPT Image、Gemini、Flux 或任何具体图像模型名称。
- 本次交付不执行图像生成、模型发现、凭据访问、付费调用、重试、预算控制、远程图像下载或生成结果存储。
- 随产品交付的优化器配置必须精确为 `maxCases: 3`、`maxPromptBytes: 16384` 与 `maxExactTextEntries: 64`。
- 运行时案例库仅在本地离线访问；同步过程消费已经审核的本地上游 checkout，并记录其精确提交。
- 不得打包案例图像、上游网站运行时代码、账户或计费代码、Provider 应用代码、可执行资源，以及未确认可再分发权限的第三方资产。
- 公共 Tool 的图像位置使用当前直接用户输入中的一基序号，并且只能解析为持久 `ImageAttachmentRef`，绝不能解析为文件系统路径。
- `edit` 必须恰好有一个 `edit-target`；`variation` 至少需要一个 `content` 引用且禁止 `edit-target`；`generate` 可以不含引用。
- Provider 排序依次为：显式选择、匹配分数降序、Provider rank 降序、Provider 名称升序、候选 ID 升序。
- 规范提示词分节与 JSON 数组顺序必须确定；相同请求、配置、Provider 集合与案例库快照必须产生逐字节相同的输出。
- Provider 注册与每个 Agent 的图像捕获状态必须通过 Cordis effect／listener 释放；注册表 HMR 测试必须观察到移除。
- `agent/pre-step` 是 waterfall：listener 必须调用 `next()`、检查返回的 `enter.messages`、在同一轮中追加后续 step 的用户图像、进入新轮时重置，并在 `agent/disposed` 时清理状态。
- 新代码不得调用已弃用的 Session 历史 API `snapshotEvents()` 或 `eventAt()`。
- 模型可见行为必须由无密钥录制 Session 快照覆盖；产品可见插件还必须具备真实 Loader 组合测试。
- 每个包的改动必须在同一任务中同步更新中英文 README、JSDoc、Model Experience、Known Limitations 与翻译配对记录。
- 不得修改 `agent-loop`；必须通过现有 Skill、Tool、Attachment、Agent 事件、Profile 与 Provider 扩展点实现该能力。
- 未来原生 `image_generate` 操作必须在执行内部调用 `ctx.imageOptimizer.optimize()`，并拒绝 `status: 'prepared'` 以外的所有结果。

---

## 文件结构

### 新能力组

- `packages/image/README.md`、`README.zh.md`、`README.i18n.yaml`：能力组地图与归属声明。
- `packages/image/image-optimizer/src/types.ts`：仅存放公共请求、结果、Provider、候选与错误类型。
- `packages/image/image-optimizer/src/schema.ts`：Provider 候选与公共辅助 Schema 的 Zod 校验。
- `packages/image/image-optimizer/src/registry.ts`：重名拒绝、Provider effect 注册与确定性候选收集。
- `packages/image/image-optimizer/src/compiler.ts`：请求校验、选择、合并优先级、能力推导与固定顺序提示词编译。
- `packages/image/image-optimizer/src/index.ts`：`ImageOptimizer` Cordis 服务、已校验配置、Context augmentation 与公共导出。
- `packages/image/image-optimizer/tests/*.spec.ts`：聚焦单元测试以及 HMR／释放覆盖。
- `packages/image/image-optimizer-library/assets/`：规范化快照、来源清单、哈希与上游许可证记录。
- `packages/image/image-optimizer-library/scripts/sync-upstream.ts`：离线本地 checkout 规范化器与允许清单校验器。
- `packages/image/image-optimizer-library/src/index.ts`：随包 Provider 激活与资产根目录校验。
- `packages/image/image-optimizer-library/tests/`：快照、清单、哈希、损坏与同步 fixture 测试。
- `packages/image/skill-image-generation/assets/image-generation/SKILL.md`：通用图像生成／编辑工作流。
- `packages/image/skill-image-generation/src/index.ts`：内置 Skill Provider。
- `packages/image/tool-image-optimize/src/input-images.ts`：按 Agent 捕获当前输入图像。
- `packages/image/tool-image-optimize/src/schema.ts`：精确的模型可见 Tool 参数 Schema。
- `packages/image/tool-image-optimize/src/index.ts`：Tool 注册、序号解析、优化调用、输出渲染与展示。

### 现有组合与文档

- `packages/bundle/base/cordis.patch.yml` 与 `package.json`：Host 服务、案例库、Skill 与非 Web Tool 行。
- `packages/preset/agent-presets/presets/{standard,ptc,cordis}/agent.cordis.yml`：Web 所有的 Tool 行。
- `packages/bundle/sdk-minimal/cordis.patch.yml` 与 `package.json`：独立 Skill、Tool、优化器、案例库与附件组合树。
- `apps/desktop/package.json` 与 Desktop 打包测试：随包资产的正式运行时依赖。
- `apps/desktop/build-resources/skills/oasis-wiki/`：Cowart／通用图像工作流委托与回归测试。
- `snapshots/session/image-optimization/`：无密钥目录、Skill 加载、Schema、成功、澄清与稳定错误录制。
- `docs/architecture.md`、Profile／包文档、生成目录及双语对应文件：当前能力与组合事实。
- `tsconfig.base.json`、`tsconfig.host.json`、`packages/README.md` 与配对文档：新能力组发现与编译器聚合。

### 本计划固定的公共接口

```ts ignore-check
export type ImageOperation = 'generate' | 'edit' | 'variation'
export type ImageReferenceRole = 'style' | 'layout' | 'content' | 'edit-target'

export interface ImageReferenceRequest {
  inputIndex: number
  role: ImageReferenceRole
  priority: number
}

export interface ExactTextRequest {
  text: string
  placement?: string
  preserveCase: boolean
}

export interface ImageOutputRequest {
  aspectRatio?: string
  width?: number
  height?: number
  transparentBackground: boolean
  count: number
}

export interface ImageOptimizationRequest {
  operation: ImageOperation
  intent: string
  references: readonly ImageReferenceRequest[]
  exactText: readonly ExactTextRequest[]
  output: ImageOutputRequest
  preserve: readonly string[]
  avoid: readonly string[]
  locale: string
  category?: string
  styleHints: readonly string[]
  sceneHints: readonly string[]
  templateId?: string
  caseIds: readonly string[]
}

export interface ResolvedImageReference {
  inputIndex: number
  attachment: ImageAttachmentRef
}

export interface ImageOptimizerOptions {
  signal?: AbortSignal
  resolvedReferences?: readonly ResolvedImageReference[]
}
```

`resolvedReferences` 是 Tool 向服务传递 `ImageOptimizationRequest` 中精确序号字段的通道；它不会给模型可见请求增加字段，并允许服务拥有的 `ImageGenerationSpec` 包含持久引用。

```ts ignore-check
export interface ImageReferencePlan extends ImageReferenceRequest {
  attachment: ImageAttachmentRef
}

export interface ExactTextRequirement extends ExactTextRequest {}

export interface ImageOutputRequirement extends ImageOutputRequest {}

export interface ImageOptimizationEvidence {
  provider: string
  templateId?: string
  caseIds: readonly string[]
  visualStyleTags: readonly string[]
  sceneTags: readonly string[]
}

export interface ImageGenerationSpec {
  schemaVersion: 1
  operation: ImageOperation
  canonicalPrompt: string
  references: readonly ImageReferencePlan[]
  composition: readonly string[]
  visualStyle: readonly string[]
  scene: readonly string[]
  exactText: readonly ExactTextRequirement[]
  output: ImageOutputRequirement
  preserve: readonly string[]
  negativeConstraints: readonly string[]
  requiredCapabilities: readonly string[]
  evidence: readonly ImageOptimizationEvidence[]
  warnings: readonly string[]
}

export type ImageOptimizationErrorCode =
  | 'IMAGE_REFERENCE_NOT_FOUND'
  | 'IMAGE_EDIT_TARGET_REQUIRED'
  | 'IMAGE_EDIT_TARGET_AMBIGUOUS'
  | 'IMAGE_VARIATION_SOURCE_REQUIRED'
  | 'IMAGE_VARIATION_TARGET_UNSUPPORTED'
  | 'IMAGE_OPTIMIZATION_SOURCE_NOT_FOUND'

export interface ImageOptimizationIssue {
  code: 'IMAGE_EXACT_TEXT_CONFLICT'
  path: string
  message: string
}

export type ImageOptimizationResult =
  | { status: 'prepared'; spec: ImageGenerationSpec }
  | { status: 'needs_clarification'; issues: readonly ImageOptimizationIssue[] }
```

Provider 候选统一使用一种经过运行时校验的规范形式：

```ts ignore-check
export interface ImageOptimizationSelection {
  templateId?: string
  caseIds: readonly string[]
}

export interface ImageOptimizationQuery {
  intent: string
  locale: string
  category?: string
  styleHints: readonly string[]
  sceneHints: readonly string[]
}

export interface ImageOptimizationCandidate {
  kind: 'template' | 'case'
  id: string
  category?: string
  score: number
  composition: readonly string[]
  visualStyle: readonly string[]
  scene: readonly string[]
  preserve: readonly string[]
  avoid: readonly string[]
  requiredCapabilities: readonly string[]
  visualStyleTags: readonly string[]
  sceneTags: readonly string[]
  source: { title: string; url: string; license: string; redistributablePrompt: boolean }
}

export interface ImageOptimizationProvider {
  name: string
  rank: number
  resolve(selection: ImageOptimizationSelection, signal?: AbortSignal): Promise<readonly ImageOptimizationCandidate[]>
  match(query: ImageOptimizationQuery, signal?: AbortSignal): Promise<readonly ImageOptimizationCandidate[]>
}
```

### 测试 Helper 约定

下方片段只使用这些由任务拥有的 helper；应在列出的测试 fixture 模块中实现它们，不得因此发明额外公共 API。

```ts ignore-check
// packages/image/image-optimizer/tests/fixtures.ts
export function candidateFixture(overrides?: Partial<ImageOptimizationCandidate>): ImageOptimizationCandidate
export function candidate(kind: 'template' | 'case', id: string, score: number): ImageOptimizationCandidate
export function provider(
  name: string,
  rank: number,
  matches: readonly ImageOptimizationCandidate[],
): ImageOptimizationProvider
export function requestFixture(overrides?: Partial<ImageOptimizationRequest>): ImageOptimizationRequest
export function editRequest(references: readonly ImageReferenceRequest[]): ImageOptimizationRequest
export function variationRequest(references: readonly ImageReferenceRequest[]): ImageOptimizationRequest
export function target(inputIndex: number): ImageReferenceRequest
export function content(inputIndex: number): ImageReferenceRequest
export function resolved(...refs: readonly ResolvedImageReference[]): ImageOptimizerOptions
export function prepared(result: ImageOptimizationResult): ImageGenerationSpec
export function ids(result: ImageOptimizationResult): string[]
export function optimizeBase(ctx: Context): Promise<ImageOptimizationResult>

// packages/image/image-optimizer-library/tests/harness.ts
export function syncFixture(name: string): Promise<Readonly<Record<string, string>>>
export function copiedAssets(): Promise<string>

// packages/image/tool-image-optimize/tests/harness.ts
export function imageRef(id: string): ImageAttachmentRef
export function pluginMessage(): UserMessage
export function userMessage(...refs: readonly ImageAttachmentRef[]): UserMessage
export function emitPreStep(
  ctx: Context,
  agent: Agent,
  turn: number,
  step: number,
  messages: UserMessage[],
  next: () => Promise<PreStepDecision>,
): Promise<PreStepDecision>
export function admit(agent: Agent, turn: number, refs: readonly ImageAttachmentRef[]): Promise<void>
export function executeTool(
  ctx: Context,
  args: ImageOptimizationRequest,
  exec: { agent?: Agent; signal?: AbortSignal },
): Promise<ImageOptimizationResult>
```

Oasis 测试模块把 `prepared_spec_fixture() -> dict`、`build_generation_package(tmp_path, optimization) -> CompletedProcess` 与 `prepare(tmp_path, spec) -> dict` 定义为现有脚本入口的本地 wrapper。

## 任务 1：搭建图像能力组与 Service Definition

**文件：**
- 新建： `packages/image/README.md`
- 新建： `packages/image/README.zh.md`
- 新建： `packages/image/README.i18n.yaml`
- 新建： `packages/image/image-optimizer/package.json`
- 新建： `packages/image/image-optimizer/tsconfig.json`
- 新建： `packages/image/image-optimizer/src/types.ts`
- 新建： `packages/image/image-optimizer/src/schema.ts`
- 新建： `packages/image/image-optimizer/src/index.ts`
- 新建： `packages/image/image-optimizer/tests/config.spec.ts`
- 新建： `packages/image/image-optimizer/tests/fixtures.ts`
- 新建：`packages/image/image-optimizer/` 下的包 README 双语对与配对记录
- 修改： `packages/README.md`, `packages/README.zh.md`, `packages/README.i18n.yaml`
- 修改： `tsconfig.base.json`
- 修改： `tsconfig.host.json`

**接口：**
- 消费：来自 `@deepseek-ai/dsh-attachment` 的 `ImageAttachmentRef`、来自 Cordis 的 `Context`／`Service`、用于配置的 Schemastery，以及用于候选校验的 Zod。
- 产出：“本计划固定的公共接口”中的所有公共类型、`ImageOptimizationError`、`ImageOptimizer` 与 `ctx.imageOptimizer`。

- [ ] **步骤 1：编写配置与公共 Schema 测试**

```ts ignore-check
it('publishes exact defaults and rejects invalid bounds', async () => {
  const ctx = new Context()
  const fiber = await ctx.plugin(ImageOptimizer)
  expect(ctx.imageOptimizer.config).toEqual({
    maxCases: 3,
    maxPromptBytes: 16384,
    maxExactTextEntries: 64,
  })
  await fiber.dispose()
  await expect(ctx.plugin(ImageOptimizer, { maxCases: 0 })).rejects.toThrow('maxCases')
})

it('rejects Provider candidates with unknown fields', () => {
  expect(() => parseCandidate({ ...candidateFixture(), executable: true })).toThrow('unrecognized')
})
```

- [ ] **步骤 2：运行聚焦测试并确认包尚不存在**

运行： `pnpm exec vitest run packages/image/image-optimizer/tests/config.spec.ts`

预期： FAIL because `@deepseek-ai/dsh-image-optimizer` and its files do not exist.

- [ ] **步骤 3：添加清单、编译引用、公共类型、配置、错误类与候选 Schema**

```ts ignore-check
export interface Config {
  maxCases?: number
  maxPromptBytes?: number
  maxExactTextEntries?: number
}

export const Config: z<Config> = z.object({
  maxCases: z.number().step(1).min(1).default(3),
  maxPromptBytes: z.number().step(1).min(1).default(16384),
  maxExactTextEntries: z.number().step(1).min(1).default(64),
})

export class ImageOptimizationError extends Error {
  constructor(
    message: string,
    readonly code: ImageOptimizationErrorCode,
    readonly path: string,
  ) {
    super(message)
    this.name = 'ImageOptimizationError'
  }
}
```

声明 `Context.imageOptimizer`，保持 `src/types.ts` 不含运行时代码，仅为 Provider 激活／测试导出 Zod 解析器，加入 `packages/image/*` 路径别名，并在 `tsconfig.host.json` 注册项目。

- [ ] **步骤 4：编写能力组与包 README 双语对**

记录 Service Definition／Provider／Consumer 归属、无执行器限制、配置表、模型可见提示词／结果成本，以及不导出 `./invariant` 的原因：该包只有一个权威注册表，没有可独立观察并发生分歧的关系。

- [ ] **步骤 5：运行聚焦类型、单元与文档检查**

运行： `pnpm exec vitest run packages/image/image-optimizer/tests/config.spec.ts && pnpm exec tsc -p packages/image/image-optimizer/tsconfig.json --noEmit && pnpm run verify-translation-pairing --write packages/image/README.md && pnpm run verify-translation-pairing --write packages/image/image-optimizer/README.md`

预期： PASS.

- [ ] **步骤 6：提交 Service Definition 骨架**

```bash
git add packages/image packages/README.md packages/README.zh.md packages/README.i18n.yaml tsconfig.base.json tsconfig.host.json
git commit -m "feat(image): add optimizer service definition"
```

## 任务 2：实现 Provider 注册、校验、选择与编译

**文件：**
- 新建： `packages/image/image-optimizer/src/registry.ts`
- 新建： `packages/image/image-optimizer/src/compiler.ts`
- 新建： `packages/image/image-optimizer/tests/registry.spec.ts`
- 新建： `packages/image/image-optimizer/tests/compiler.spec.ts`
- 修改： `packages/image/image-optimizer/src/index.ts`
- 修改： `packages/image/image-optimizer/README.md` and paired files

**接口：**
- 消费： Task 1 public types and `parseCandidate()`.
- 产出： `registerProvider(provider): () => void`, `optimize(request, options): Promise<ImageOptimizationResult>`, deterministic prompt compiler, and stable error behavior.

- [ ] **步骤 1：编写注册表顺序、重名、释放与取消测试**

```ts ignore-check
it('sorts explicit candidates before scored candidates and removes a disposed Provider', async () => {
  const alpha = provider('alpha', 10, [candidate('case', 'b', 0.7)])
  const beta = provider('beta', 20, [candidate('case', 'a', 0.7)])
  const disposeAlpha = ctx.imageOptimizer.registerProvider(alpha)
  ctx.imageOptimizer.registerProvider(beta)
  expect(ids(await optimizeBase(ctx))).toEqual(['beta:a', 'alpha:b'])
  disposeAlpha()
  expect(ids(await optimizeBase(ctx))).toEqual(['beta:a'])
})

it('rejects duplicate Provider names in one Context', () => {
  ctx.imageOptimizer.registerProvider(provider('library', 1, []))
  expect(() => ctx.imageOptimizer.registerProvider(provider('library', 2, [])))
    .toThrow('duplicate image optimization Provider: library')
})
```

- [ ] **步骤 2：运行注册表测试并确认失败**

运行： `pnpm exec vitest run packages/image/image-optimizer/tests/registry.spec.ts`

预期： FAIL because registry collection and disposal are not implemented.

- [ ] **步骤 3：实现由 effect 管理的 Provider 注册表**

```ts ignore-check
registerProvider(provider: ImageOptimizationProvider): () => void {
  validateProviderIdentity(provider)
  if (this.providers.has(provider.name)) {
    throw new Error(`duplicate image optimization Provider: ${provider.name}`)
  }
  return this.ctx.effect(() => {
    this.providers.set(provider.name, provider)
    return () => { this.providers.delete(provider.name) }
  })
}
```

只使用一条注册路径：仅在 `ctx.effect()` 内插入，并返回该 disposer。

- [ ] **步骤 4：为每条校验与合并规则编写编译器测试**

```ts ignore-check
it.each([
  ['edit without target', editRequest([]), 'IMAGE_EDIT_TARGET_REQUIRED'],
  ['edit with two targets', editRequest([target(1), target(2)]), 'IMAGE_EDIT_TARGET_AMBIGUOUS'],
  ['variation without content', variationRequest([]), 'IMAGE_VARIATION_SOURCE_REQUIRED'],
  ['variation with target', variationRequest([target(1), content(2)]), 'IMAGE_VARIATION_TARGET_UNSUPPORTED'],
])('%s', async (_label, request, code) => {
  await expect(ctx.imageOptimizer.optimize(request, resolved())).rejects.toMatchObject({ code })
})

it('keeps user exact text, output, preservation, and prohibitions above Provider defaults', async () => {
  const result = await ctx.imageOptimizer.optimize(requestFixture(), resolved())
  expect(prepared(result).spec).toMatchObject({
    exactText: [{ text: 'PLAY', placement: 'center', preserveCase: true }],
    output: { width: 1024, height: 1024, transparentBackground: false, count: 1 },
    preserve: ['logo geometry'],
    negativeConstraints: ['watermark'],
  })
})
```

还要覆盖缺失显式 ID、重复 case ID、精确文本冲突返回 `needs_clarification`、无自动 case 时的警告、`maxCases`、精确限制边缘、单字段过大、聚合 UTF-8 字节溢出、多字节输入以及逐字节相同的重复输出。完全相同的精确文本条目去重；两个条目若具有相同的去空白、大小写折叠后非空 placement 但文本不同，或文本与 placement 相同但 `preserveCase` 不同，则产生一个 `IMAGE_EXACT_TEXT_CONFLICT` issue，并指出两个数组路径。

- [ ] **步骤 5：运行编译器测试并确认失败**

运行： `pnpm exec vitest run packages/image/image-optimizer/tests/compiler.spec.ts`

预期： FAIL because `optimize()` is not implemented.

- [ ] **步骤 6：实现请求校验与已解析引用拼接**

```ts ignore-check
function resolveReferences(
  request: ImageOptimizationRequest,
  resolved: readonly ResolvedImageReference[],
): ImageReferencePlan[] {
  const byIndex = new Map(resolved.map(item => [item.inputIndex, item.attachment]))
  return request.references.map((reference, position) => {
    const attachment = byIndex.get(reference.inputIndex)
    if (attachment === undefined) {
      throw new ImageOptimizationError(
        `Image ${reference.inputIndex} is not present in the current user input.`,
        'IMAGE_REFERENCE_NOT_FOUND',
        `references[${position}].inputIndex`,
      )
    }
    return { ...reference, attachment }
  })
}
```

编译前校验正安全整数、去除首尾空白后非空的字符串、唯一显式 case ID、成对输出尺寸、数量、精确文本数量、角色规则与缺失显式来源。width 与 height 必须同时提供；若同时提供 `aspectRatio`，它必须等于约分后的宽高比。结构与已配置限制违规使用 Tool 运行时稳定的 `INVALID_ARGUMENTS` 失败；六个领域失败使用 `ImageOptimizationErrorCode`，精确文本冲突使用 `needs_clarification`。

- [ ] **步骤 7：实现候选收集、稳定排序、合并、能力推导与固定提示词分节**

```ts ignore-check
const SECTION_ORDER = [
  'Task', 'References', 'Composition', 'Visual style', 'Scene',
  'Exact text', 'Output', 'Preserve', 'Avoid',
] as const

function compilePrompt(sections: ReadonlyMap<typeof SECTION_ORDER[number], readonly string[]>): string {
  return SECTION_ORDER.flatMap(title => {
    const lines = sections.get(title) ?? []
    return lines.length === 0 ? [] : [`## ${title}`, ...lines.map(line => `- ${line}`)]
  }).join('\n')
}
```

Explicit candidates carry an internal `explicit: true`; automatic candidates sort by score/rank/name/ID. Select explicit cases plus at most `maxCases` automatic cases, ensure a category or global template fallback, deduplicate arrays by first occurrence, derive capability strings from references/output/exact text, produce Provider-grouped evidence, then enforce `Buffer.byteLength(canonicalPrompt, 'utf8') <= maxPromptBytes` on the complete prompt.

- [ ] **步骤 8：运行优化器测试与类型检查**

运行： `pnpm exec vitest run packages/image/image-optimizer/tests && pnpm exec tsc -p packages/image/image-optimizer/tsconfig.json --noEmit`

预期： PASS.

- [ ] **步骤 9：提交确定性优化实现**

```bash
git add packages/image/image-optimizer
git commit -m "feat(image): compile deterministic generation specs"
```

## 任务 3：加入受控离线案例库 Provider

**文件：**
- 新建： `packages/image/image-optimizer-library/package.json`
- 新建： `packages/image/image-optimizer-library/tsconfig.json`
- 新建： `packages/image/image-optimizer-library/src/index.ts`
- 新建： `packages/image/image-optimizer-library/scripts/sync-upstream.ts`
- 新建： `packages/image/image-optimizer-library/assets/manifest.json`
- 新建： `packages/image/image-optimizer-library/assets/templates.json`
- 新建： `packages/image/image-optimizer-library/assets/cases.json`
- 新建： `packages/image/image-optimizer-library/assets/tags.json`
- 新建： `packages/image/image-optimizer-library/assets/sources.json`
- 新建： `packages/image/image-optimizer-library/assets/LICENSE.upstream`
- 新建： tests and fixed upstream fixtures under `packages/image/image-optimizer-library/tests/`
- 新建： `packages/image/image-optimizer-library/tests/harness.ts`
- 新建： package README pair and pairing record
- 修改： `tsconfig.host.json`

**接口：**
- 消费： `ImageOptimizationProvider`, candidate schema, and registry from Tasks 1-2.
- 产出： Provider name `awesome-gpt-image-2-library`, rank `100`, configurable absolute `assetRoot`, deterministic `resolve()` and `match()`.

- [ ] **步骤 1：编写离线同步拒绝规则与稳定输出测试**

```ts ignore-check
it.each([
  ['unknown field', 'unknown-field'],
  ['duplicate id', 'duplicate-id'],
  ['missing source', 'missing-source'],
  ['path traversal', 'path-traversal'],
  ['executable file', 'executable-file'],
  ['forbidden binary', 'forbidden-binary'],
])('rejects %s', async (_label, fixture) => {
  await expect(syncFixture(fixture)).rejects.toThrow()
})

it('writes byte-identical JSON for the same reviewed checkout', async () => {
  expect(await syncFixture('valid')).toEqual(await syncFixture('valid'))
})
```

- [ ] **步骤 2：运行同步测试并确认失败**

运行： `pnpm exec vitest run packages/image/image-optimizer-library/tests/sync-upstream.spec.ts`

预期： FAIL because the sync script is absent.

- [ ] **步骤 3：实现本地 checkout 规范化器**

```ts ignore-check
interface SyncOptions {
  sourceRoot: string
  outputRoot: string
  upstreamCommit: string
}

const ALLOWED_OUTPUTS = new Set([
  'manifest.json', 'templates.json', 'cases.json', 'tags.json',
  'sources.json', 'LICENSE.upstream',
])
```

The script accepts only an absolute local `--source`, an absolute `--output`, and a 40-hex `--commit`; parses upstream structured files; emits summaries, tags, template fragments, source metadata, and only prompts whose source record says redistribution is allowed; sorts object keys and arrays by stable IDs; writes SHA-256 hashes and counts into `manifest.json`; and rejects any discovered executable or binary resource rather than copying it.

- [ ] **步骤 4：生成首个已审核快照**

Run from a separately reviewed local checkout whose absolute path is stored in `DSH_IMAGE_LIBRARY_SOURCE`:

```powershell
$sourceRoot = (Resolve-Path $env:DSH_IMAGE_LIBRARY_SOURCE).Path
$commit = (git -C $sourceRoot rev-parse HEAD).Trim()
pnpm --filter @deepseek-ai/dsh-image-optimizer-library run sync -- --source $sourceRoot --output packages/image/image-optimizer-library/assets --commit $commit
```

Review every emitted source and `redistributablePrompt` flag; the committed manifest contains the concrete commit, so no runtime or test depends on the upstream branch head.

- [ ] **步骤 5：编写 Provider 激活、哈希、解析、匹配与释放测试**

```ts ignore-check
it('fails activation when a packaged hash changes', async () => {
  const assets = await copiedAssets()
  await writeFile(join(assets, 'cases.json'), '[]\n')
  await expect(ctx.plugin(ImageLibrary, { assetRoot: assets })).rejects.toThrow('hash mismatch')
})

it('matches category and tags without network or model calls', async () => {
  await ctx.plugin(ImageLibrary)
  const result = await ctx.imageOptimizer.optimize(requestFixture({
    category: 'game-ui', styleHints: ['flat icon'], sceneHints: ['inventory'],
  }))
  expect(prepared(result).spec.evidence[0]?.provider).toBe('awesome-gpt-image-2-library')
})
```

- [ ] **步骤 6：实现激活时校验与确定性匹配**

Read and validate every asset synchronously before registration, require absolute `assetRoot`, verify manifest version/counts/hashes/source records/license, build immutable maps and lowercase token indexes, implement exact-ID resolution, and score category/style/scene/intent token matches without auxiliary model calls.

- [ ] **步骤 7：运行包测试、类型检查与双语配对检查**

运行： `pnpm exec vitest run packages/image/image-optimizer-library/tests && pnpm exec tsc -p packages/image/image-optimizer-library/tsconfig.json --noEmit && pnpm run verify-translation-pairing --write packages/image/image-optimizer-library/README.md`

预期： PASS with no network access.

- [ ] **步骤 8：提交已审核的案例库快照**

```bash
git add packages/image/image-optimizer-library tsconfig.host.json
git commit -m "feat(image): add offline prompt library provider"
```

## 任务 4：加入正式 `image-generation` Skill Provider

**文件：**
- 新建： `packages/image/skill-image-generation/package.json`
- 新建： `packages/image/skill-image-generation/tsconfig.json`
- 新建： `packages/image/skill-image-generation/src/index.ts`
- 新建： `packages/image/skill-image-generation/assets/image-generation/SKILL.md`
- 新建： `packages/image/skill-image-generation/tests/skill-image-generation.spec.ts`
- 新建： package README pair and pairing record
- 修改： `tsconfig.host.json`

**接口：**
- 消费： `@deepseek-ai/dsh-skill` Provider registry.
- 产出： bundled, model-invocable and user-invocable Skill candidate `image-generation` from Provider `dsh-image-generation`.

- [ ] **步骤 1：编写随包资源、真实 Loader 与释放测试**

```ts ignore-check
it('loads the formal workflow and removes it on disposal', async () => {
  await ctx.plugin(SkillRegistry)
  const fiber = await ctx.plugin(SkillImageGeneration)
  expect(await ctx.skills.list()).toContainEqual(expect.objectContaining({
    name: 'image-generation', provider: 'dsh-image-generation', source: 'bundled',
  }))
  expect((await ctx.skills.get('image-generation'))?.content).toContain('image_optimize')
  await fiber.dispose()
  expect(await ctx.skills.list()).toEqual([])
})
```

- [ ] **步骤 2：运行测试并确认失败**

运行： `pnpm exec vitest run packages/image/skill-image-generation/tests/skill-image-generation.spec.ts`

预期： FAIL because the Provider is absent.

- [ ] **步骤 3：编写 Skill 指令**

The Skill must instruct the agent to: classify `generate`/`edit`/`variation`; derive category/style/scene hints; preserve exact text as structured entries; assign current-input image positions and roles; call `image_optimize` before any available executor; stop and ask about `needs_clarification`; pass only prepared prompt/references/output/capabilities to an executor; and report “prepared” rather than “generated” when none exists. It must state that Oasis/Cowart adds its domain constraints after this generic step.

- [ ] **步骤 4：按 `skill-office` 模式实现内置 Provider**

```ts ignore-check
const candidate: SkillCandidate = {
  name: 'image-generation',
  description: 'Prepare image generation, editing, and variation requests before using an available image executor.',
  invocation: { modelInvocable: true, userInvocable: true },
  provider: 'dsh-image-generation',
  source: 'bundled',
  rank: BUNDLED_SKILL_RANK,
  resourceBase: { kind: 'directory', path: directory },
  locator: join(directory, 'SKILL.md'),
}
```

Support an optional absolute `assetRoot`, parse YAML frontmatter with `yaml`, validate resources before registration, and use `ctx.skills.registerProvider()` so disposal removes the candidate.

- [ ] **步骤 5：运行单元、Loader、类型与配对检查**

运行： `pnpm exec vitest run packages/image/skill-image-generation/tests && pnpm exec tsc -p packages/image/skill-image-generation/tsconfig.json --noEmit && pnpm run verify-translation-pairing --write packages/image/skill-image-generation/README.md`

预期： PASS.

- [ ] **步骤 6：提交正式 Skill**

```bash
git add packages/image/skill-image-generation tsconfig.host.json
git commit -m "feat(image): add generation workflow skill"
```

## 任务 5：加入 `image_optimize` 与当前输入图像解析

**文件：**
- 新建： `packages/image/tool-image-optimize/package.json`
- 新建： `packages/image/tool-image-optimize/tsconfig.json`
- 新建： `packages/image/tool-image-optimize/src/input-images.ts`
- 新建： `packages/image/tool-image-optimize/src/schema.ts`
- 新建： `packages/image/tool-image-optimize/src/index.ts`
- 新建： `packages/image/tool-image-optimize/tests/input-images.spec.ts`
- 新建： `packages/image/tool-image-optimize/tests/tool-image-optimize.spec.ts`
- 新建： `packages/image/tool-image-optimize/tests/loader-composition.spec.ts`
- 新建： `packages/image/tool-image-optimize/tests/harness.ts`
- 新建： package README pair and pairing record
- 修改： `tsconfig.host.json`

**接口：**
- 消费： `ctx.tools`, `ctx.imageOptimizer`, `agent/pre-step`, `agent/disposed`, `ToolRunContext.agent`, `ImageAttachmentRef`.
- 产出： model-facing tool `image_optimize` and pure presentation metadata.

- [ ] **步骤 1：编写 Agent 输入捕获测试**

```ts ignore-check
it('captures admitted direct-user images after downstream pre-step listeners', async () => {
  const decision = await emitPreStep(ctx, agent, 1, 1, incoming, async () => ({
    kind: 'enter',
    messages: [pluginMessage(), userMessage(imageRef('a')), userMessage(imageRef('b'))],
  }))
  expect(decision.kind).toBe('enter')
  expect(capture.references(agent)).toEqual([imageRef('a'), imageRef('b')])
})

it('appends same-turn later-step images, resets next turn, and clears on disposal', async () => {
  await admit(agent, 3, [imageRef('a')])
  await admit(agent, 3, [imageRef('b')])
  expect(capture.references(agent)).toEqual([imageRef('a'), imageRef('b')])
  await admit(agent, 4, [imageRef('c')])
  expect(capture.references(agent)).toEqual([imageRef('c')])
  ctx.emit('agent/disposed', { agent })
  expect(capture.references(agent)).toEqual([])
})
```

- [ ] **步骤 2：运行捕获测试并确认失败**

运行： `pnpm exec vitest run packages/image/tool-image-optimize/tests/input-images.spec.ts`

预期： FAIL because capture state is absent.

- [ ] **步骤 3：实现不扫描 Session 且符合 waterfall 语义的捕获**

```ts ignore-check
ctx.on('agent/pre-step', async ({ agent, turn }, next): Promise<PreStepDecision> => {
  const decision = await next()
  if (decision.kind !== 'enter') return decision
  const refs = decision.messages
    .filter(message => message.source.kind === 'user')
    .flatMap(message => message.content.flatMap(block => block.type === 'image' ? [block.attachment] : []))
  capture.admit(agent, turn, refs)
  return decision
})

ctx.on('agent/disposed', ({ agent }) => { capture.delete(agent) })
```

使用 `WeakMap<Agent, { turn: number; refs: ImageAttachmentRef[] }>` 保存捕获状态并返回防御性只读副本。不得读取 Session 历史。

- [ ] **步骤 4：编写精确 Tool Schema 与执行测试**

```ts ignore-check
it('resolves one-based positions and forwards the execution signal', async () => {
  const controller = new AbortController()
  const result = await executeTool(ctx, {
    operation: 'edit', intent: 'replace the title',
    references: [{ inputIndex: 2, role: 'edit-target', priority: 100 }],
    exactText: [{ text: 'READY', preserveCase: true }],
    output: { transparentBackground: false, count: 1 },
    preserve: ['layout'], avoid: [], locale: 'en', styleHints: [], sceneHints: [], caseIds: [],
  }, { agent, signal: controller.signal })
  expect(optimize).toHaveBeenCalledWith(expect.anything(), {
    signal: controller.signal,
    resolvedReferences: [{ inputIndex: 2, attachment: secondRef }],
  })
  expect(result.status).toBe('prepared')
})

it('rejects a call without an owning Agent', async () => {
  await expect(executeTool(ctx, request, { agent: undefined })).rejects.toThrow('owning Agent')
})
```

Cover all six stable error codes, duplicate ordinal resolution, cancellation, `needs_clarification`, output JSON losslessness, and `presentCall`/`presentResult` titles.

- [ ] **步骤 5：运行 Tool 测试并确认失败**

运行： `pnpm exec vitest run packages/image/tool-image-optimize/tests/tool-image-optimize.spec.ts`

预期： FAIL because the tool is absent.

- [ ] **步骤 6：实现严格 Tool Schema 与注册**

Use `defineTool()` with `additionalProperties: false` at every object layer; enum operation and roles; safe positive integer positions/priorities/count/dimensions; arrays for exact text, preservation, prohibitions, style hints, scene hints, and case IDs; optional category/template/aspect ratio. Register through `ctx.tools.register()`, pass `exec.signal`, and fail before service invocation when `exec.agent` is absent.

- [ ] **步骤 7：实现规范输出渲染与展示**

将完整 `ImageOptimizationResult` 作为 Tool 值返回。渲染一个 JSON 文本块，使模型收到完整 Spec；展示元数据仅包含 `status`、`operation`、已选 evidence ID、警告与 issue code，不得包含本地路径或 case 提示词正文。

- [ ] **步骤 8：加入真实 Loader 组合测试**

Boot `tools`, `agent`, `image-optimizer`, a fixture Provider, and `tool-image-optimize` from a temporary `cordis.yml`; create an Agent, emit `agent/pre-step`, call through `ctx.tools.execute()`, and assert the durable model-facing result and disposal behavior.

- [ ] **步骤 9：运行包检查并提交**

运行： `pnpm exec vitest run packages/image/tool-image-optimize/tests && pnpm exec tsc -p packages/image/tool-image-optimize/tsconfig.json --noEmit && pnpm run verify-translation-pairing --write packages/image/tool-image-optimize/README.md`

预期： PASS.

```bash
git add packages/image/tool-image-optimize tsconfig.host.json
git commit -m "feat(image): add image optimization tool"
```

## 任务 6：把 Host 能力组合进 `dsh-base`

**文件：**
- 修改： `packages/bundle/base/cordis.patch.yml`
- 修改： `packages/bundle/base/package.json`
- 修改： `packages/bundle/base/tests/base.spec.ts`
- 修改： `packages/bundle/base/README.md`, paired files

**接口：**
- 消费： all four new packages.
- 产出： Host-owned optimizer/library/Skill and the Base global Tool used by Headless, SDK, ACP, and raw Base-backed profiles.

- [ ] **步骤 1：加入会失败的 Bundle 行测试**

```ts ignore-check
expect(rows).toEqual(expect.arrayContaining([
  expect.objectContaining({ id: 'image-optimizer', name: '@deepseek-ai/dsh-image-optimizer' }),
  expect.objectContaining({ id: 'image-optimizer-library', name: '@deepseek-ai/dsh-image-optimizer-library' }),
  expect.objectContaining({ id: 'skill-image-generation', name: '@deepseek-ai/dsh-skill-image-generation' }),
  expect.objectContaining({ id: 'tool-image-optimize', name: '@deepseek-ai/dsh-tool-image-optimize' }),
]))
expect(row('image-optimizer').config).toEqual({ maxCases: 3, maxPromptBytes: 16384, maxExactTextEntries: 64 })
```

- [ ] **步骤 2：运行 Bundle 测试并确认失败**

运行： `pnpm exec vitest run packages/bundle/base/tests/base.spec.ts`

预期： FAIL because the rows and dependencies are absent.

- [ ] **步骤 3：插入 Host 行与依赖**

Mount `image-optimizer` before its Provider and Tool, mount `skill-image-generation` after the global Skill registry, and add all bare plugin packages to `dependencies`. Keep the Tool in the normal Base tool group so Web can disable it in the Web bundle before Presets add their scoped Tool.

- [ ] **步骤 4：更新 Base 文档并运行检查**

运行： `pnpm exec vitest run packages/bundle/base/tests/base.spec.ts && pnpm run verify-cordis-config && pnpm run verify-translation-pairing --write packages/bundle/base/README.md`

预期： PASS.

- [ ] **步骤 5：提交 Base 组合**

```bash
git add packages/bundle/base
git commit -m "feat(image): enable optimization in base profiles"
```

## 任务 7：在所有含工具的 Web Preset 中挂载 Tool

**文件：**
- 修改： `packages/bundle/web-app/cordis.patch.yml`
- 修改： `packages/preset/agent-presets/presets/standard/agent.cordis.yml`
- 修改： `packages/preset/agent-presets/presets/ptc/agent.cordis.yml`
- 修改： `packages/preset/agent-presets/presets/cordis/agent.cordis.yml`
- 修改： `packages/preset/agent-presets/package.json`
- 修改： `packages/preset/agent-presets/tests/shipped-root.spec.ts`
- 修改： package README pair and pairing record

**接口：**
- 消费： Base Host service/library/Skill.
- 产出： one `tool-image-optimize` row in `standard`, `ptc`, and `cordis`; no row in `minimal`.

- [ ] **步骤 1：编写随产品发布 Preset 的断言**

```ts ignore-check
it('mounts image_optimize in every shipped tool-bearing Web preset', async () => {
  for (const id of ['standard', 'ptc', 'cordis']) {
    expect(findEntry(await shippedEntries(id), 'tool-image-optimize')).toMatchObject({
      name: '@deepseek-ai/dsh-tool-image-optimize',
    })
  }
  expect(findEntry(await shippedEntries('minimal'), 'tool-image-optimize')).toBeUndefined()
})
```

- [ ] **步骤 2：运行 Preset 测试并确认失败**

运行： `pnpm exec vitest run packages/preset/agent-presets/tests/shipped-root.spec.ts`

预期： FAIL because the preset rows are absent.

- [ ] **步骤 3：在 Web 中禁用 Base Tool，并加入 Preset 所有的行**

Add a Web patch that sets Base `tool-image-optimize.disabled: true`, then add the same Tool row beside `tool-skill` in each tool-bearing preset. Add the Tool package to the preset package dependencies so shipped bare names resolve.

- [ ] **步骤 4：运行 Preset 与 CLI Web 组合检查**

运行： `pnpm exec vitest run packages/preset/agent-presets/tests/shipped-root.spec.ts apps/cli/tests/web-agent-presets.e2e.ts`

预期： PASS and exactly one `image_optimize` schema per Web Agent.

- [ ] **步骤 5：提交 Web 组合**

```bash
git add packages/bundle/web-app packages/preset/agent-presets
git commit -m "feat(image): add optimizer to web agent presets"
```

## 任务 8：扩展 `sdk-minimal` 与 Desktop 打包

**文件：**
- 修改： `packages/bundle/sdk-minimal/cordis.patch.yml`
- 修改： `packages/bundle/sdk-minimal/package.json`
- 修改： `packages/bundle/sdk-minimal/tests/sdk-minimal.spec.ts`
- 修改： package README pair and pairing record
- 修改： `apps/desktop/package.json`
- 修改： `apps/desktop-host/package.json`
- 修改： desktop package/bundle tests that assert runtime dependency closure
- 修改： `pnpm-lock.yaml`

**接口：**
- 消费： new capability packages plus existing `dsh-skill`, `dsh-tool-skill`, `dsh-attachment`, and `dsh-attachment-local`.
- 产出： standalone `sdk-minimal` discovery/call support and packaged Desktop availability without `DSH_BUNDLED_SKILL_DIR`.

- [ ] **步骤 1：扩展精确的 `sdk-minimal` 组合树测试**

Assert rows for `attachment-local`, `skill`, `skill-image-generation`, `tool-skill`, `image-optimizer`, `image-optimizer-library`, and `tool-image-optimize`, with the optimizer’s exact config and no `skill-filesystem` row.

- [ ] **步骤 2：运行测试并确认失败**

运行： `pnpm exec vitest run packages/bundle/sdk-minimal/tests/sdk-minimal.spec.ts`

预期： FAIL because the standalone tree lacks the capability.

- [ ] **步骤 3：按依赖顺序加入独立组合行**

Mount the local attachment service before Agent input admission, the Skill registry before the bundled Skill and `tool-skill`, the optimizer before the library and Tool, and keep user-directory discovery absent. Add every bare plugin to `dependencies` and keep manifest-dependency equality exact.

- [ ] **步骤 4：加入 Desktop 运行时依赖与打包断言**

Add the four new packages and their packaged assets to the app/host dependency owner used by the Desktop bundle. Extend packaging tests to resolve `SKILL.md`, `manifest.json`, and library JSON from the packaged dependency tree while `DSH_BUNDLED_SKILL_DIR` is unset.

- [ ] **步骤 5：运行独立组合与 Desktop 检查**

运行： `pnpm exec vitest run packages/bundle/sdk-minimal/tests/sdk-minimal.spec.ts apps/desktop/tests apps/desktop-host/tests && pnpm run verify-cordis-config`

预期： PASS.

- [ ] **步骤 6：提交独立组合与打包改动**

```bash
git add packages/bundle/sdk-minimal apps/desktop/package.json apps/desktop-host/package.json pnpm-lock.yaml
git commit -m "feat(image): ship optimization in minimal sdk and desktop"
```

## 任务 9：让 Oasis/Cowart 消费统一优化结果

**文件：**
- 修改： `apps/desktop/build-resources/skills/oasis-wiki/SKILL.md`
- 修改： `apps/desktop/build-resources/skills/oasis-wiki/references/task-router.md`
- 修改： `apps/desktop/build-resources/skills/oasis-wiki/references/cowart-ui-workflow.md`
- 修改： `apps/desktop/build-resources/skills/oasis-wiki/references/game-ui/workflow.md`
- 修改： `apps/desktop/build-resources/skills/oasis-wiki/scripts/game-ui/prepare_image_generation.py`
- 修改： `apps/desktop/build-resources/skills/oasis-wiki/scripts/game-ui/build_generation_prompt.py`
- 修改： relevant Oasis Python tests, especially `tests/test_game_ui_generation.py` and Cowart workflow tests

**接口：**
- 消费： `image-generation` Skill semantics and `ImageGenerationSpec` JSON returned by `image_optimize`.
- 产出： Oasis domain constraints layered onto the unified Spec; existing Provider authorization and execution remain unchanged.

- [ ] **步骤 1：为新的 Generation Package 输入加入回归测试**

```python
def test_generation_package_requires_prepared_optimization_result(tmp_path):
    result = build_generation_package(tmp_path, optimization={"status": "needs_clarification", "issues": []})
    assert result.returncode != 0
    assert "prepared" in result.stderr

def test_oasis_constraints_extend_canonical_spec_without_reselecting_templates(tmp_path):
    package = prepare(tmp_path, prepared_spec_fixture())
    assert package["imageSpec"]["canonicalPrompt"] == prepared_spec_fixture()["canonicalPrompt"]
    assert package["oasisConstraints"]["dynamicText"] is True
    assert "templateSelection" not in package
```

- [ ] **步骤 2：运行聚焦 Oasis 测试并确认失败**

运行： `python -m unittest apps.desktop.build-resources.skills.oasis-wiki.tests.test_game_ui_generation`

预期： FAIL because the scripts still own general prompt selection.

- [ ] **步骤 3：修改 Generation Package Schema 与提示词构建器**

Require one `imageSpec` with `schemaVersion: 1` and `status: prepared` at the script boundary. Preserve its canonical prompt, references, exact text, output, preservation, prohibitions, evidence, and warnings. Add Oasis-only fields for dynamic text/numbers/progress, hit targets, reusable controls, UI Tree, editor-write restrictions, and Cowart review stages; remove duplicate general template/style/case selection from Python.

- [ ] **步骤 4：更新 Oasis 指令**

Route generic generation/edit/variation preparation through the formal `image-generation` Skill and `image_optimize`. Keep model discovery, explicit paid-call authorization, Codex Provider execution, Cowart visual review, component extraction, PSD-to-UMG, Native dynamic text, and editor delivery in Oasis.

- [ ] **步骤 5：运行所有受影响的 Oasis 回归测试**

运行： `python -m unittest discover -s apps/desktop/build-resources/skills/oasis-wiki/tests -p "test_*generation*.py" && python -m unittest apps.desktop.build-resources.skills.oasis-wiki.tests.test_cowart_ui_usage_guide`

预期： PASS, including unchanged direct-generation authorization assertions.

- [ ] **步骤 6：提交 Oasis 复用改动**

```bash
git add apps/desktop/build-resources/skills/oasis-wiki
git commit -m "refactor(oasis): consume unified image optimization"
```

## 任务 10：加入真实 Profile 组合测试与无密钥 Session 快照

**文件：**
- 新建： `snapshots/session/image-optimization/cordis.yml`
- 新建： `snapshots/session/image-optimization/profile.patch.yml`
- 新建： `snapshots/session/image-optimization/snapshot.yml`
- 新建： expected snapshot files recorded by the harness
- 修改： Base/Profile/SDK real-composition tests at their existing owners
- 修改： snapshot index/manifest files generated by the snapshot harness

**接口：**
- 消费： completed runtime and profile composition.
- 产出： keyless evidence for Base-backed Headless, Web Preset, and `sdk-minimal` availability plus model-visible transcript output.

- [ ] **步骤 1：加入三项真实组合断言**

Boot: (1) Base + Headless, (2) Base + Web app with `standard`, and (3) standalone `sdk-minimal`. In each, assert `ctx.imageOptimizer`, catalog entry `image-generation`, load through `skill`, and exactly one `image_optimize` tool schema. Submit an admitted image in the tool-bearing scenarios and assert ordinal `1` resolves to its durable attachment ID.

- [ ] **步骤 2：运行组合测试，并只修复该能力引起的失败**

运行： `pnpm exec vitest run packages/bundle/base/tests packages/preset/agent-presets/tests/shipped-root.spec.ts packages/bundle/sdk-minimal/tests`

预期： PASS.

- [ ] **步骤 3：定义无密钥回放场景**

The recorded adapter must produce, in order: inspect Skill catalog, load `image-generation`, inspect/call `image_optimize` for a successful generate request, call a conflicting exact-text request yielding `needs_clarification`, and call a missing image position yielding `IMAGE_REFERENCE_NOT_FOUND`. Use fixture attachment metadata only; no real model or image endpoint.

- [ ] **步骤 4：录制并审阅快照**

运行： `pnpm run test:snapshot:record -- -t image-optimization`

Review that the snapshot contains the Skill description/body, exact tool JSON Schema, full prepared Spec, clarification issue, stable error code, and no model name, credential, local path, upstream full case prompt, or generation claim.

- [ ] **步骤 5：无密钥回放**

运行： `pnpm run test:snapshot -- -t image-optimization`

预期： PASS without `DEEPSEEK_API_KEY`.

- [ ] **步骤 6：提交组合证据与快照**

```bash
git add snapshots/session/image-optimization packages/bundle packages/preset apps/cli/tests
git commit -m "test(image): cover shipped optimization profiles"
```

## 任务 11：完成双语文档与生成目录

**文件：**
- 修改： `docs/architecture.md` and `docs/architecture.zh.md`
- Create or modify: the image subsystem reference pair selected by `packages/image/README.md`
- 修改： shipped Profile documentation pairs for Base/Web/Headless/SDK/ACP/Desktop/`sdk-minimal`
- 修改： package README pairs from earlier tasks after behavior is final
- 修改： Oasis/Cowart workflow guidance and its pairing records where applicable
- 重新生成： `docs/tool-catalog.md`, `docs/tool-catalog.zh.md`, `docs/config-catalog.md`, `docs/config-catalog.zh.md`, `docs/module-graph.md`, and associated records through owning generators

**接口：**
- 消费： final source, tests, and generated schemas.
- 产出： one current-state documentation home per fact and fresh generated catalogs.

- [ ] **步骤 1：更新架构与子系统归属**

Document the four roles, Host vs Agent-plane placement, current-input attachment flow, deterministic/offline selection, Session logging through existing tool events, and the future executor obligation. Do not restate public type catalogs outside the owning subsystem page.

- [ ] **步骤 2：更新 Profile 与 Oasis 用户路径**

State that every shipped tool-bearing Agent can load `image-generation` and call `image_optimize`; `sdk-minimal` includes attachment support but not filesystem Skill discovery; Desktop uses package dependencies; and Oasis adds Cowart/UMG constraints after generic optimization.

- [ ] **步骤 3：重新生成权威目录**

Run the repository generators selected by `pnpm run doc-sync`; do not hand-edit generated English catalog regions. Review `image_optimize`, optimizer config defaults, the new package group, and module edges in generated output.

- [ ] **步骤 4：重新记录每个变更的双语对**

Collect the changed unsuffixed Markdown paths and re-record them explicitly:

```powershell
$pairs = git diff --name-only -- '*.md' | Where-Object { $_ -notmatch '\.zh\.md$' }
pnpm run verify-translation-pairing --write -- $pairs
```

- [ ] **步骤 5：运行聚焦文档检查**

运行： `pnpm run test:docs && pnpm run doc-sync && pnpm run website:build`

预期： the new image documents pass. If the two known pre-existing failures remain, report them separately without changing unrelated files: the unpaired Oasis Wiki `references/wiki/README.md` and the incomplete `packages/client/ui-codex-bridge/README.md` Model Experience.

- [ ] **步骤 6：提交文档与生成引用**

```bash
git add docs packages/image packages/README.md packages/README.zh.md packages/README.i18n.yaml apps/desktop/build-resources/skills/oasis-wiki
git commit -m "docs(image): document unified optimization capability"
```

## 任务 12：运行聚焦的推送前验证与最终审阅

**文件：**
- Modify only files required to fix failures caused by this plan.

**接口：**
- 消费： the complete implementation.
- 产出： review-ready evidence without claiming unrun checks.

- [ ] **步骤 1：阅读待推送 diff，并通过 `dsh-pre-push-checks` 选择检查**

Inspect `git diff --stat`, `git diff --name-only`, package dependency changes, generated artifacts, snapshot changes, and any persistence-type detector output. This project adds no Session event or persistence type; if a detector says otherwise, stop and follow the acknowledgement workflow before proceeding.

- [ ] **步骤 2：运行所有聚焦图像包测试**

运行： `pnpm exec vitest run packages/image/image-optimizer/tests packages/image/image-optimizer-library/tests packages/image/skill-image-generation/tests packages/image/tool-image-optimize/tests`

预期： PASS.

- [ ] **步骤 3：运行受影响的组合、快照、Oasis 与类型检查**

运行： `pnpm exec vitest run packages/bundle/base/tests packages/bundle/sdk-minimal/tests packages/preset/agent-presets/tests/shipped-root.spec.ts && pnpm run test:snapshot -- -t image-optimization && python -m unittest discover -s apps/desktop/build-resources/skills/oasis-wiki/tests -p "test_*generation*.py" && pnpm run typecheck`

预期： PASS.

- [ ] **步骤 4：运行由 diff 选择的仓库元数据与文档检查**

运行： `pnpm run lint && pnpm run hygiene && pnpm run doc-sync && pnpm run test:docs && git diff --check`

预期： all image-owned checks PASS; separately report unchanged pre-existing failures identified in Task 11.

- [ ] **步骤 5：手工审计验收标准**

Confirm: every shipped tool-bearing profile has exactly one Tool; identical calls produce byte-identical Specs; no Spec contains a concrete model, credential, or local path; no code calls paid/image endpoints; missing executors yield only `prepared`; Oasis contains no second general library/template selector; the packaged upstream snapshot contains only allowlisted normalized resources; and future Provider addition requires no change to the Tool, Skill, or library.

- [ ] **步骤 6：审阅是否意外扩大范围**

运行： `git diff -- packages/image packages/bundle packages/preset apps/desktop snapshots/session/image-optimization docs`

Remove unrelated refactors, generated build outputs, upstream images, and any change to `agent-loop`.

- [ ] **步骤 7：如有需要，提交仅用于修复验证的改动**

```bash
git add packages/image packages/bundle/base packages/bundle/sdk-minimal packages/bundle/web-app packages/preset/agent-presets apps/desktop apps/desktop-host snapshots/session/image-optimization docs
git commit -m "fix(image): satisfy integration checks"
```

没有验证修复时跳过此提交。
