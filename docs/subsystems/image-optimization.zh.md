# 图像优化

[English](image-optimization.md) | 中文

图像优化把结构化的生成、编辑或变体意图转换为提供方无关的 `ImageGenerationSpec`。四个随附组件划分职责：Service Definition 负责公开类型、限制、Provider 注册、校验、选择与确定性编译；离线库 Provider 贡献可复用指导；随包 Skill 描述准备流程；Tool Consumer 收集模型可见请求、提供共享的当前 turn 图像清单、解析附件序号并渲染结果。独立的生成 Tool Consumer 在执行 prepared 引用时使用同一清单。此子系统只准备指令：它不执行图像或模型调用、不读取凭据，也不授权执行器。

来源：[`packages/image/image-optimizer/src/types.ts`](../../packages/image/image-optimizer/src/types.ts)

## 请求与附件传输

模型可见请求只使用从一开始计数的序号，引用调用方 Agent 当前 turn 已准入的直接用户图像。Tool Consumer 在 `ImageOptimizerOptions.resolvedReferences` 中把这些序号解析为持久附件；该字段位于请求之外，避免 Provider 名称、凭据、存储路径或附件实现细节进入任务词汇。同一 turn 中后续已接受 step 按消息与内容顺序追加图像；新 turn 会替换列表。

```ts type-equiv
/** Current-turn direct-user image inputs shared by optimizer and executor Consumers. */
interface ImageInputImages {
  /**
   * Return a defensive copy of one live Agent's admitted current-turn images.
   * @param agent - live Agent whose current input is requested.
   * @returns durable image references in admitted message and content order.
   */
  references(agent: Agent): readonly ImageAttachmentRef[]
}
```

```ts type-equiv
/** Image operation requested by the Consumer. */
type ImageOperation = 'generate' | 'edit' | 'variation'
```

```ts type-equiv
/** Semantic role assigned to one ordered image input. */
type ImageReferenceRole = 'style' | 'layout' | 'content' | 'edit-target'
```

```ts type-equiv
/** One model-visible reference selection expressed by input ordinal. */
interface ImageReferenceRequest {
  inputIndex: number
  role: ImageReferenceRole
  priority: number
}
```

```ts type-equiv
/** Exact text that the generated image must preserve. */
interface ExactTextRequest {
  text: string
  placement?: string
  preserveCase: boolean
}
```

```ts type-equiv
/** Requested dimensions, transparency, and output count. */
interface ImageOutputRequest {
  aspectRatio?: string
  width?: number
  height?: number
  transparentBackground: boolean
  count: number
}
```

```ts type-equiv
/** Provider-neutral image task submitted by a Consumer. */
interface ImageOptimizationRequest {
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
```

```ts type-equiv
/** Durable attachment resolved for one request input ordinal. */
interface ResolvedImageReference {
  inputIndex: number
  attachment: ImageAttachmentRef
}
```

```ts type-equiv
/** Cancellation and durable references supplied outside the model-visible request. */
interface ImageOptimizerOptions {
  signal?: AbortSignal
  resolvedReferences?: readonly ResolvedImageReference[]
}
```

## 已准备规范与结果

只有 `prepared` 结果携带独立执行器可以接收的指令。Consumer 绝不能把 `needs_clarification` 解释为可执行工作。Evidence 记录所选 Provider 标识与来源 id，不把 Provider 所有的提示词正文复制到结果中。

```ts type-equiv
/** Resolved reference embedded in an executable generation specification. */
interface ImageReferencePlan extends ImageReferenceRequest {
  attachment: ImageAttachmentRef
}
```

```ts type-equiv
/** Exact-text requirement embedded in a generation specification. */
interface ExactTextRequirement extends ExactTextRequest {}
```

```ts type-equiv
/** Output requirement embedded in a generation specification. */
interface ImageOutputRequirement extends ImageOutputRequest {}
```

```ts type-equiv
/** Inspectable provider and source selection retained with a compiled specification. */
interface ImageOptimizationEvidence {
  provider: string
  templateId?: string
  caseIds: readonly string[]
  visualStyleTags: readonly string[]
  sceneTags: readonly string[]
}
```

```ts type-equiv
/** Complete provider-neutral instructions prepared for a future image executor. */
interface ImageGenerationSpec {
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
```

```ts type-equiv
/** Stable domain failure codes emitted by image optimization. */
type ImageOptimizationErrorCode =
  | 'IMAGE_REFERENCE_NOT_FOUND'
  | 'IMAGE_EDIT_TARGET_REQUIRED'
  | 'IMAGE_EDIT_TARGET_AMBIGUOUS'
  | 'IMAGE_VARIATION_SOURCE_REQUIRED'
  | 'IMAGE_VARIATION_TARGET_UNSUPPORTED'
  | 'IMAGE_OPTIMIZATION_SOURCE_NOT_FOUND'
```

```ts type-equiv
/** One caller-actionable clarification issue. */
interface ImageOptimizationIssue {
  code: 'IMAGE_EXACT_TEXT_CONFLICT'
  path: string
  message: string
}
```

```ts type-equiv
/** Closed optimization outcome returned to the Consumer. */
type ImageOptimizationResult =
  | { status: 'prepared'; spec: ImageGenerationSpec }
  | { status: 'needs_clarification'; issues: readonly ImageOptimizationIssue[] }
```

## Provider 约定

Provider 通过 `resolve()` 接收显式 id，通过 `match()` 接收提供方无关任务提示，并返回统一的规范化候选项。`parseCandidate()` 在注册表接纳前拒绝未声明的候选项与来源字段。Provider 来源材料、排名实现与许可证仍由 Provider 负责。

```ts type-equiv
/** Explicit provider-owned template and case selection. */
interface ImageOptimizationSelection {
  templateId?: string
  caseIds: readonly string[]
}
```

```ts type-equiv
/** Provider-neutral fields used for deterministic candidate matching. */
interface ImageOptimizationQuery {
  intent: string
  locale: string
  category?: string
  styleHints: readonly string[]
  sceneHints: readonly string[]
}
```

```ts type-equiv
/** Normalized, runtime-validated template or case returned by a Provider. */
interface ImageOptimizationCandidate {
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
```

```ts type-equiv
/** Provider that resolves explicit evidence and matches task hints. */
interface ImageOptimizationProvider {
  name: string
  rank: number
  resolve(selection: ImageOptimizationSelection, signal?: AbortSignal): Promise<readonly ImageOptimizationCandidate[]>
  match(query: ImageOptimizationQuery, signal?: AbortSignal): Promise<readonly ImageOptimizationCandidate[]>
}
```

## 服务、配置与失败

挂载 `@deepseek-ai/dsh-image-optimizer` 会发布 `ctx.imageOptimizer`。其公开操作为 `registerProvider(provider): () => void` 与 `optimize(request, options): Promise<ImageOptimizationResult>`。Provider 注册是借用的同进程状态；返回的 disposer 负责对应的精确贡献。取消通过 `ImageOptimizerOptions.signal` 传递。

同一个 Service Definition 包声明 `ctx.imageInputImages`，因为 optimizer 与 executor Consumer 必须共享一份序号清单。`@deepseek-ai/dsh-tool-image-optimize` 从已接受的当前 turn 直接用户消息提供该查询、消费它来解析优化引用，并返回防御性副本。Prepared `@deepseek-ai/dsh-tool-image-generate` 执行消费同一查询来解析 `ImageGenerationSpec.references`；它不会从最近消息重新构建顺序。

| 字段 | 默认值 | 要求 |
|---|---:|---|
| `maxCases` | `3` | 限制自动选择的 case 候选项数量的正整数。 |
| `maxPromptBytes` | `16384` | 限制完整序列化 prepared 结果 UTF-8 字节数的正整数。 |
| `maxExactTextEntries` | `64` | 限制 exact-text 要求数量的正整数。 |

无效的自包含配置会在插件激活期间失败。`ImageOptimizationInputError` 携带结构化请求与配置限制失败的路径；Tool Consumer 将它映射为 Tool 运行时的稳定 invalid-argument 失败。`ImageOptimizationError` 携带稳定的 `ImageOptimizationErrorCode` 与请求 `path`；clarification issue 仍作为普通 `needs_clarification` 结果返回。Tool Consumer 负责模型可见展示。

随包库只从已校验本地资源执行确定性选择，不发起网络或辅助模型请求。其随附 bootstrap 包含 DSH 自有全局回退；经审查的同步快照可以增加获准再分发的 template 指导与仅含元数据的上游 case，但在没有明确再分发授权时绝不包含 case prompt、prompt preview 或图片。

已准备规范不包含具体模型、凭据或本地路径。它只通过 Consumer 现有的 `tool/call` 与 `tool/result` 处理完成持久化和展示；此子系统不增加 Session 事件类型。执行器选择、凭据使用、输入授权、图像执行与结果存储仍是独立职责。

`ImageAttachmentRef` 见[持久附件](attachment.zh.md)，Consumer 的执行与结果归属见[工具](tools.zh.md)。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctximageoptimizer--imageoptimizer"></a>

### `ctx.imageOptimizer` — `ImageOptimizer`

Concrete service owner for image optimization configuration and operations.

```ts cordis-catalog
/**
 * Register one borrowed Provider until the returned disposer runs.
 * @param provider - Provider contributing explicit resolution and matching.
 * @returns disposer for the exact Provider registration.
 * @throws {Error} when the Provider identity is invalid or its name is already registered.
 */
registerProvider(provider: ImageOptimizationProvider): () => void

/**
 * Select Provider evidence and prepare an executor-neutral specification.
 * @param request - complete Provider-neutral user task.
 * @param options - optional cancellation and durable reference transport.
 * @returns a prepared specification or caller-actionable clarification issues.
 * @throws {ImageOptimizationInputError} when request structure or configured limits are invalid.
 * @throws {ImageOptimizationError} when references, roles, or explicit source ids cannot be resolved.
 * @throws {DOMException} when cancellation is requested before compilation completes.
 */
async optimize( request: ImageOptimizationRequest, options?: ImageOptimizerOptions, ): Promise<ImageOptimizationResult>
```

Source: [`packages/image/image-optimizer/src/index.ts`](../../packages/image/image-optimizer/src/index.ts)
<!-- END GENERATED cordis-surface -->
