# DSH 通用图像优化能力设计

[English](2026-09-20-dsh-image-optimization-design.md) | 中文

## 目标

DSH 为所有随发行版提供的 Agent 和 Profile 提供同一套图像生成与编辑需求优化能力。该能力把用户意图、参考图、精确文字、构图要求和编辑约束编译为与图像模型无关的 `ImageGenerationSpec`，供现有外部生图工具及后续 DSH 原生图像执行器使用。

本设计融合 `freestylefly/awesome-gpt-image-2` 的模板、标签和案例组织方式，DSH 现有 `oasis-wiki` Cowart 工作流的生产约束，以及 DSH 已有的 Skill、Tool、Attachment、Session 和 Profile 组合机制。融合以统一接口和当前需求为准，不复制上游网站、计费、账户、Provider 应用代码或重复工作流。

## 范围

本次交付包含图像优化 Service Definition、内置案例库 Provider、模型可调用工具、正式生图 Skill、全部随发行版 Profile 的默认组合，以及 Oasis/Cowart 对统一优化结果的复用。

本次交付不包含真实图像生成、图像模型发现、Provider 凭据管理、付费调用、预算控制、生成重试或生成结果存储。没有图像执行器时，能力只返回可执行的优化结果并明确标记为 `prepared`。

后续图像执行器使用独立能力设计。它必须消费本设计的 `ImageGenerationSpec`，并在执行操作内部调用优化服务，不能依靠提示词约定来保证优化发生。

## 架构

新增 `packages/image/` 包组。包组遵循 DSH 的 Service Definition、Service Provider 和 Consumer 分工，不在公共接口中出现 GPT Image、Gemini、Flux 或其他具体模型名称。

| 包 | 责任 |
|---|---|
| `@deepseek-ai/dsh-image-optimizer` | 声明 `ctx.imageOptimizer`、请求和结果类型、Provider 注册、候选合并及规范化编译 |
| `@deepseek-ai/dsh-image-optimizer-library` | 提供随包发布的模板、风格标签、场景标签和案例索引 |
| `@deepseek-ai/dsh-tool-image-optimize` | 注册模型可调用的 `image_optimize` 工具，将当前 Agent 输入转换为优化请求并呈现结果 |
| `@deepseek-ai/dsh-skill-image-generation` | 提供通用生图工作流，要求图像生成或编辑任务先取得优化结果，再交给可用执行器 |

`image-optimizer` 是唯一的编译行为所有者。Skill 不维护案例数据，Tool 不实现模板选择，案例库 Provider 不调用工具或模型。Provider 注册通过 `ctx.effect()` 管理，卸载后其候选立即从后续编译中消失。

## 请求模型

`ImageOptimizationRequest` 描述用户任务，不携带 Provider 名称或凭据。

```ts ignore-check
interface ImageOptimizationRequest {
  operation: 'generate' | 'edit' | 'variation'
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

相关请求类型固定为以下字段；实现不得用无类型键值替代这些结构。

```ts ignore-check
interface ImageReferenceRequest {
  inputIndex: number
  role: 'style' | 'layout' | 'content' | 'edit-target'
  priority: number
}

interface ExactTextRequest {
  text: string
  placement?: string
  preserveCase: boolean
}

interface ImageOutputRequest {
  aspectRatio?: string
  width?: number
  height?: number
  transparentBackground: boolean
  count: number
}
```

图像引用的公开工具参数使用当前输入中的一基序号。Tool Consumer 从发起操作的 Agent 和 Session 解析序号，并把它转换为现有 `ImageAttachmentRef`；请求不得使用本地文件路径代替持久化引用。

`edit` 必须恰好有一个 `edit-target`。`variation` 必须至少有一个 `content` 引用且不能有 `edit-target`。`generate` 可以没有参考图。精确文字与保留项保持独立字段，不能只存在于自由文本提示词中。

## 统一结果

`ImageOptimizationResult` 是 Tool Consumer 接收的闭合联合。只有 `prepared` 分支携带可执行的 `ImageGenerationSpec`；未来执行器必须拒绝其他分支。

```ts ignore-check
type ImageOptimizationResult =
  | { status: 'prepared'; spec: ImageGenerationSpec }
  | { status: 'needs_clarification'; issues: readonly ImageOptimizationIssue[] }

interface ImageGenerationSpec {
  schemaVersion: 1
  operation: 'generate' | 'edit' | 'variation'
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

`requiredCapabilities` 描述多参考图、局部编辑、透明背景、精确文字或特定比例等能力，不描述实现这些能力的模型。`evidence` 记录 Provider、模板 ID、案例 ID、风格标签和场景标签，使选择结果可检查但不把上游案例正文复制到 Session。

`ImageOptimizationIssue` 包含稳定 `code`、受影响字段路径和面向 Agent 的具体说明。`schemaVersion` 版本化的是优化结果的数据结构，不改变 Session 格式。Tool 调用和完整结果继续作为现有 `tool/call` 与 `tool/result` 记录持久化；第一阶段不增加 Session 事件类型。

## Provider 接口

Service Definition 接受多个 Provider，但优化编排只由 `image-optimizer` 执行。

```ts ignore-check
interface ImageOptimizationProvider {
  name: string
  rank: number
  resolve(ids: ImageOptimizationSelection, signal?: AbortSignal): Promise<readonly ImageOptimizationCandidate[]>
  match(query: ImageOptimizationQuery, signal?: AbortSignal): Promise<readonly ImageOptimizationCandidate[]>
}

interface ImageOptimizerOptions {
  signal?: AbortSignal
}

abstract class ImageOptimizer {
  registerProvider(provider: ImageOptimizationProvider): () => void
  abstract optimize(
    request: ImageOptimizationRequest,
    options?: ImageOptimizerOptions,
  ): Promise<ImageOptimizationResult>
}
```

`resolve()` 只处理显式模板和案例 ID，并必须区分不存在与重复 ID。`match()` 返回 Provider 自己的候选分数和规范化元数据。服务按显式选择、匹配分数降序、Provider rank 降序、Provider 名称和候选 ID 升序组成稳定排序；相同 Provider 名称在同一 Context 中拒绝注册。

## 选择和编译

优化服务按以下顺序选择模板与案例：显式模板或案例 ID、Agent 提供的分类与标签、本地标签索引对用户意图的匹配、类别通用模板、全局基础模板。没有案例命中时仍生成有效结果，并在 `warnings` 中说明使用了通用模板。

第一阶段不发起辅助 LLM 请求。主 Agent 根据用户内容和参考图填写分类、风格及场景提示；Provider 对结构化提示和原始意图执行确定性本地匹配。以后可以增加语义检索 Provider，但它必须返回相同候选类型，并遵守相同的结果上限和合并规则。

合并过程先应用用户显式要求，再应用领域约束和模板默认值。低优先级来源不能覆盖精确文字、编辑保留项、引用角色、输出尺寸或用户禁止项。编译后的 `canonicalPrompt` 按固定节顺序生成，保证相同请求、配置和案例快照得到相同结果。

## 调用流程

1. `image-generation` Skill 的目录描述覆盖图像生成、图像编辑和变体任务。
2. Agent 加载 Skill，并调用 `image_optimize`。
3. Tool Consumer 从当前直接用户输入中解析图片引用，校验序号和角色，然后调用 `ctx.imageOptimizer.optimize()`。
4. 优化服务收集 Provider 候选、执行排序与合并并生成 `ImageGenerationSpec`。
5. Tool 返回完整 Spec；现有 Session 工具记录保存调用参数和结果。
6. 当前环境有外部图像工具时，Agent把 `canonicalPrompt`、持久化参考图和输出要求交给该工具。
7. 当前环境没有执行器时，Agent报告 Spec 已准备好，不声称图片已生成。

第一阶段的自动路由由 Skill 目录和工具说明驱动，因此不能可靠拦截 DSH 之外的任意图像工具。后续 DSH 原生 `image_generate` Consumer 必须在执行内部调用优化服务，提供不可绕过的自动优化。

## Profile 组合

`dsh-base` 在 Host 层装载优化服务、案例库 Provider 和内置 Skill Provider。Headless、普通 SDK 和 ACP 使用 Base 的全局 `image_optimize` 工具。

Web 继续把模型工具放在 Agent Preset 中。`standard`、`ptc` 和 `cordis` Preset 均装载 `tool-image-optimize`；它们解析 Host 层的同一优化服务和案例库，不为每个 Session 复制资源。

`sdk-minimal` 明确装载 Skill Registry、内置 `image-generation` Skill、`tool-skill`、优化服务、案例库和 `image_optimize`。它不增加用户目录 Skill 扫描或其他 Base 工具。为支持参考图片输入，它同时装载现有 Attachment Service 和本地 Provider；无参考图任务不读取 Attachment 数据。

Desktop 通过正式包依赖获得通用能力，不依赖 `DSH_BUNDLED_SKILL_DIR` 或用户目录中的 `gpt-image-2-style-library`。随 Desktop 发布的 `oasis-wiki` 仍可保留在现有资源目录，直到该领域知识另行获得正式包归属。

用户和部署可以通过后续 Profile patch 禁用工具或 Skill；所有随 DSH 发布的 Profile 默认启用。

## Oasis 和 Cowart 集成

`oasis-wiki` 继续拥有 UI Tree、Generation Package、Cowart 视觉审核、组件拆分、PSD 到 UMG、Native 动态文字和编辑器交付规则。通用模板选择、风格标签选择和规范化提示词编译改为调用 `image_optimize`。

Oasis 工作流把动态文字、数值、进度、点击热区、可复用控件和编辑器写入限制作为显式请求约束加入统一 Spec。它不得复制案例库或维护第二套通用模板选择规则。

现有 Provider 模型发现和显式授权的直接生成逻辑暂时保留在 Oasis 执行阶段。本设计不改变其凭据、授权或付费调用规则；后续通用图像执行器设计再决定是否迁移这些逻辑。

## 案例库和来源治理

初始 Provider 从 `freestylefly/awesome-gpt-image-2` 生成受控快照。同步操作固定上游 commit，并输出来源清单、资源哈希、模板计数、案例计数和许可证记录。运行时只读取随包资源，不访问上游网络。

上游仓库使用 MIT License，但其免责声明指出部分公开案例和图片可能含第三方权利。因此快照默认只包含分类、标签、模板结构、案例 ID、结构化摘要和来源信息。案例图片、完整网站代码、账户、计费、API Provider 和第三方完整素材不进入 DSH 包。完整案例提示词只有在同步清单确认其来源允许再分发时才能进入快照。

同步脚本拒绝未知字段、重复 ID、无来源记录、路径逃逸、可执行文件和未列入允许清单的二进制资源。生成的快照按稳定键排序，保证代码评审和测试结果确定。

## 配置和限制

优化服务提供经过验证的 `maxCases`、`maxPromptBytes` 和 `maxExactTextEntries` 配置。随发行版组合显式设置 `maxCases: 3`、`maxPromptBytes: 16384` 和 `maxExactTextEntries: 64`。案例 Provider 可以配置资源根目录以支持打包载体，但必须是绝对路径，并在激活时验证清单和全部必需资源。

限制在完整结果已知的位置执行。单个超长用户字段、多个字段合并后的超限和多字节字符都按 UTF-8 字节数验证。配置错误和随包资源错误在插件激活时失败；用户请求错误在工具执行时返回稳定错误代码。

## 错误和安全

| 条件 | 结果 |
|---|---|
| 图片序号不存在 | `IMAGE_REFERENCE_NOT_FOUND` |
| `edit` 没有且不能解析出 `edit-target` | `IMAGE_EDIT_TARGET_REQUIRED` |
| 多个 `edit-target` | `IMAGE_EDIT_TARGET_AMBIGUOUS` |
| `variation` 没有 `content` 引用 | `IMAGE_VARIATION_SOURCE_REQUIRED` |
| `variation` 包含 `edit-target` | `IMAGE_VARIATION_TARGET_UNSUPPORTED` |
| 精确文字要求互相冲突 | `needs_clarification`，列出冲突字段 |
| 显式模板或案例 ID 不存在 | `IMAGE_OPTIMIZATION_SOURCE_NOT_FOUND` |
| 没有自动匹配案例 | 使用通用模板并添加 warning |
| 案例库资源损坏 | Provider 激活失败 |
| 没有图像执行器 | 返回 `prepared` |

优化器不读取模型凭据、不发现模型、不调用付费接口、不下载远程图片，也不执行案例库中的文本。Provider 输出通过公共 Schema 校验后才参与合并。用户输入只能填充请求字段，不能修改 Skill、工具说明、配置上限或 Provider 排序规则。

## 测试

`image-optimizer` 单元测试覆盖请求校验、Provider 排序、显式选择、标签匹配、默认模板、优先级合并、UTF-8 字节限制、确定性结果和 Provider 注销。

案例库 Provider 测试覆盖清单、来源、许可证记录、重复 ID、禁止文件、资源哈希和快照稳定性。同步测试使用固定输入夹具，不依赖网络。

Tool 测试覆盖当前输入图片序号到 `ImageAttachmentRef` 的解析、角色校验、稳定错误代码、工具呈现和取消传播。真实 Loader 组合测试分别启动 Base-backed Profile、Web Agent Preset 和 `sdk-minimal`，验证服务、Skill 和工具在实际组合中可用。

关键模型可见行为使用无 Key 的录制 Session Snapshot 覆盖：Skill 目录、Skill 加载、工具 Schema、成功调用、`needs_clarification` 和错误结果。Oasis 回归测试验证 Generation Package、Cowart 阶段和 Provider 直接生成授权规则保持有效。

文档更新包含新的包组和包 README 中英文对、架构能力表、Profile 文档、生成的工具与配置目录，以及 Oasis/Cowart 工作流说明。实施完成前运行差异对应的聚焦测试、Snapshot、类型检查、文档同步检查和 Git 差异检查；命令选择遵守 `dsh-pre-push-checks`。

## 实施阶段

第一阶段建立 Service Definition、案例库 Provider、Tool Consumer 和正式 Skill，并完成单元测试和案例快照。

第二阶段把能力加入 Base、Web Preset、SDK、ACP、Headless、`sdk-minimal` 和 Desktop 打包依赖，并完成真实组合测试。

第三阶段让 `oasis-wiki` 和 Cowart 工作流消费统一 Spec，删除其重复的通用提示词选择规则并完成回归与 Session Snapshot。

第四阶段是单独设计和实施的图像执行器能力，包括 Provider 注册、能力匹配、预算、授权、重试和结果 Attachment。第四阶段不属于本设计的实施计划。

## 验收标准

- 所有随 DSH 发布的 Agent 和 Profile 默认能够发现并调用 `image_optimize`。
- 相同请求、配置和案例快照产生字节一致的 `ImageGenerationSpec`。
- Spec 不包含具体图像模型名称、凭据或本地图片路径。
- 没有执行器时只返回 `prepared`，不产生付费调用或虚假生成结果。
- `oasis-wiki` 在统一 Spec 上追加领域约束，不维护第二套通用案例库或模板选择实现。
- 增加图像模型 Provider 不需要修改案例库、正式 Skill 或优化工具调用方。
- 上游同步不把未授权案例图片、网站运行代码或未列入允许清单的资源带入发布包。
