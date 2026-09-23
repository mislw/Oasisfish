# Agent Note: Codex 到 Harness 的可视化委派桥接

Status: proposed

[English](2026-09-20-visual-codex-delegation-bridge.md) | 中文

## 问题

用户希望 Codex 继续负责复杂工作，同时把范围明确、成本较低的工作委派给 Harness agent（智能体）。仓库已通过 [Codex subagent（子智能体）提供方](../../../../packages/subagent/subagent-codex/README.zh.md)支持相反方向：Harness agent 可以启动全新的 Codex 任务。Codex 目前无法通过受支持的 Codex 集成来发现、调用、监控或取消 Harness 任务。

只有命令行的适配器无法满足产品需求。用户需要在 Oasisfish 界面中建立连接，选择连接可用的 Workspace（工作区）与权限，在普通 Session（会话）界面中观察委派工作，回答交互、取消运行，并在不手工编辑协议配置的情况下撤销访问。

该连接是一条进入文件系统、shell、模型及携带凭据能力的授权路径。若本机端点没有明确的身份验证、Workspace 准入与服务端权限策略，无关进程或浏览器页面便可能使用用户的 Harness 权限启动工作。

## 提案

提供一个可选 Codex Bridge（桥接）Bundle，使运行中的 Oasisfish Web 或 Desktop Host 成为仅回环可用的 Streamable HTTP MCP 服务端。Codex 作为 MCP 客户端连接，并获得一个同步委派工具。每个获准的工具调用都在已准入的 Workspace 中创建一个普通根 Session，驱动一个 Harness turn（轮次），并返回有界的最终结果。现有 Session 与对话界面继续作为详细的可视化记录。

桥接不是第二个 agent loop（智能体循环），也不把 Codex 协议消息翻译成内部循环调用。它接纳外部请求，通过现有 registry（注册表）创建普通 Harness Agent，并观察产生的 Session。[Codex 产品提供方决策](../../implemented/feature/2026-08-04-claude-code-and-codex-subagent-backends.zh.md)继续负责 Harness 到 Codex 的委派；本提案增加独立的 Codex 到 Harness 方向，不改变该提供方。

```text
Codex
  -> Streamable HTTP MCP
  -> Codex Bridge service
  -> ordinary Harness root Session
  -> AgentLoop, tools, persistence, and Web presentation
```

### 产品流程

可选 Bundle 贡献一个 **Codex 连接**设置分区。未配对的安装显示本机端点、可用性检查和一个主要的 **连接 Codex** 操作。当已安装的 Codex 提供受支持的 MCP 注册操作时，Host 使用该操作；否则，界面显示准确的注册值，并把产品自有配置留给用户处理。桥接不会使用仓库自有的 TOML 编辑器解析或改写 Codex 配置。

连接设置使用授权流程，而不是把用户的 Harness 凭据放进 Codex 配置。Oasisfish 在批准前显示请求连接的身份与准入 Workspace，批准后签发可撤销的桥接凭据，并只在 Harness 凭据提供方中保存服务端凭据记录。Codex 侧集成根据受支持的 MCP 身份验证流程持有其客户端凭据。配对失败不会留下已准入连接或可重复使用的一次性授权。

已连接视图显示连接健康状态、准入 Workspace、选定的 Agent Preset（智能体预设）、权限策略、模型路由、活动运行数量和凭据撤销操作。它还列出活动桥接运行，并提供 **打开会话**与**取消**操作。已完成的委派 Session 保留在普通 Workspace 历史中，并显示由持久 Session 数据派生的本地化 Codex 来源标记。

配套 Codex 插件是可选项。其 Skill（技能）说明何时委派范围明确的搜索、文档修改、聚焦编辑和窄范围检查，以及何时 Codex 必须保留架构、安全敏感、跨包或模糊工作。没有配套插件时，传输仍可通过显式 MCP 工具调用使用。Oasisfish 无法保证 Codex 会委派任务；该路由决策归 Codex 所有。

### MCP 接口

第一版公开一个操作稳定、产品无关且带 Codex 显示名称的工具：

```ts
interface DelegateTaskInput {
  requestId: string
  task: string
  workspacePath: string
  intent: 'analyze' | 'edit'
}

interface DelegateTaskResult {
  requestId: string
  runId: string
  sessionId: string
  status: 'completed' | 'cancelled' | 'failed'
  finalText?: string
  diagnostic?: string
}
```

`requestId` 是客户端生成的不透明 id，用于在连接的有界去重窗口内拒绝重复的活动或已完成请求。`task` 是作为 Session 用户输入传入的完整独立指令。`workspacePath` 必须解析到已准入且已注册的 Workspace；服务端对其进行规范化，并拒绝未知路径、逃出准入根目录的别名以及已删除的注册。`intent` 描述请求的操作，但绝不会提升权限：连接为只读时，`edit` 请求失败。

当轮次完成时，结果携带最终非空 assistant（助手）文本。它不会把推理、临时 assistant chunk（分块）、工具流量、原始错误、凭据或完整 Session 日志复制进 Codex。`diagnostic` 使用桥接自有的安全类别与可操作文本。Codex 获得 Session id，因此其最终响应可以引导用户查看可视化记录，而无需把该记录复制到自身上下文。

第一版不提供继续、后台模式、资源目录、提示词目录、任意模型选择器、任意 Agent Preset 选择器或通用工具代理。取消 MCP 请求会取消其拥有的轮次。从 Oasisfish 界面取消会结算同一运行；若 HTTP 请求仍保持连接，则返回 `cancelled`。传输丢失时工作不会静默继续；桥接取消实时轮次并保留中断的 Session 记录。

### 运行时归属

新的 Host service（服务）负责连接准入、MCP 传输 Session、请求去重和实时运行句柄。其 controller（控制器）包为状态、连接、撤销、活动运行列表、打开运行身份和取消提供类型化浏览器操作。client（客户端）插件贡献设置分区与 Codex 来源呈现。可选 Bundle 组合 Host、controller、client、locale（本地化）和配置行，不增加另一个可执行文件或包 bin。

预期的包放置如下：

| 包 | 职责 |
|---|---|
| `packages/mcp/codex-bridge` | MCP 服务端、身份验证适配器、连接策略、运行生命周期与委派服务 |
| `packages/api/codex-bridge-controller` | 类型化 Host 到浏览器操作及实时状态通知 |
| `packages/client/ui-codex-bridge` | 设置分区、配对状态、运行控制与 Session 来源呈现 |
| `packages/bundle/codex-bridge` | 完整集成的可选 Profile 组合 |

service 通过 Cordis effect（作用）注册，并在 dispose（释放）时移除其 HTTP route（路由）、授权处理器、通知与运行观察器。dispose 拒绝新请求，取消实时桥接自有轮次，等待其结算，然后关闭传输状态。它不会删除 Session，也不会回滚工具已经产生的文件系统更改。

桥接创建普通根 Session，因为 Codex 是外部发起方，而不是 Harness 父 Agent。它在委派用户消息之前追加一个可忽略、集成自有的 `codex/delegation` Session event（事件）。该事件记录桥接运行 id、稳定连接 id、外部请求 id、请求意图与准入 Workspace 身份；它不包含凭据。插件自有 projection（投影）提供列表标记与活动运行发现，不改变 subagent lineage（子智能体谱系），也不从 Workspace 导航中隐藏 Session。

添加该事件需要声明持久化类型变更确认、TypeScript 与 Python SDK 预期输出更新、当前 Session 格式验证，以及 `ignorable: true` envelope（信封），使不消费该集成事件的 build（构建）仍可读取日志。除非实现改变公共事件 envelope，本提案不改变 Session framing（分帧），也不要求提升格式版本。

### 安全与权限

桥接只在 Host Web 服务端绑定到 `127.0.0.1` 时激活。使用 `0.0.0.0` 的组合会在加载桥接行时失败并给出可操作错误；第一版不允许通过配置字段放宽此规则。远程访问、反向代理和 TLS 终止需要带网络威胁模型的独立提案。

每个 MCP 请求都需要准确的已准入连接凭据、受支持的 MCP 内容类型与方法，以及允许的 Origin 状态。即使源自浏览器的跨站请求能到达回环地址，也会被拒绝。响应绝不包含 bearer material（承载凭据材料）。身份验证失败使用统一响应，不暴露连接 id 是否存在。

每个连接保存一个 Workspace id allowlist（允许列表）、一个 Agent Preset、一个已解析模型路由或 Preset 默认值、一个权限预设、最大并发运行数、最大任务大小、每轮输出限制和交互超时。这些随部署变化的限制是经过验证的设置，而不是隐藏在插件中的常量。调用不能选择其他 Preset、模型、权限模式、Workspace 或限制。

默认连接为只读。启用 Workspace 写入需要一次明确的界面确认，并列出准入 Workspace。shell 与其他权限决策继续经过选定的 Harness 权限预设与 approval service（审批服务）。等待审批或用户回答的请求会出现在 Oasisfish Session 界面中；超时或连接撤销会取消运行，而不会授予权限或编造回答。

服务端绝不把环境中的 Codex 环境变量、Codex 账户凭据或 Codex 配置转发给 Harness Agent。Harness 路由通过现有提供方解析自身凭据。日志与诊断会遮盖连接凭据和 Authorization header（授权头）。

### Workspace 并发

第一版同步执行，并指示 Codex 在编辑重叠文件前等待工具结果。Oasisfish 无法从技术上阻止 Codex 或其他本机进程更改同一 Workspace，因此界面把同 Workspace 写入委派描述为协作式，而不是隔离式。

只读委派不会产生桥接写入的文件竞争。写入委派会在可用时记录 Workspace 的初始 repository status（仓库状态），并在最终状态包含无法从 Harness 工具记录归因的更改时发出警告。它不声称提供事务隔离、自动合并、回滚或完整文件归因。隔离 worktree（工作树）与 patch（补丁）交接仍可作为 Git Workspace 的后续模式，而不是第一版的隐藏 fallback（回退）。

### 失败行为

不可用的模型路由、无效 Preset、缺失 Workspace、过期凭据、重复请求、并发限制、过大任务或不支持的权限状态会在 Agent 发布前失败。Session 发布后的错误会保留持久 Session，其中包含实际记录的已结算或中断轮次事实。

如果 Codex 断开连接、Oasisfish 重启、Bundle 卸载或 MCP 传输在运行期间失败，桥接会请求取消，并且不会报告完成。重启后的桥接不会恢复旧 HTTP 请求。用户可以打开保留的 Session，并把它作为普通 Oasisfish 对话继续，但该继续结果不会返回原 Codex 调用。

撤销凭据会立即拒绝新请求，并在界面确认后取消该连接拥有的实时请求。移除可选 Bundle 会关闭端点，并且仅在凭据提供方的普通删除约定要求时保留连接记录；Bundle 移除文档必须说明准确的保留状态。

### 验证与文档

协议测试通过真实 MCP 服务端适配器覆盖 initialize（初始化）、工具发现、工具调用、abort（中止）、畸形输入、不支持的方法与内容类型、重复请求 id 和传输 dispose。安全测试覆盖缺失与错误凭据、Origin 拒绝、回环强制、路径规范化、Workspace 移除、只读降级、授权超时、撤销、日志遮盖与并发限制竞争。

生命周期测试覆盖 Session 发布前后失败、从 Codex 与界面取消、Host dispose、连接撤销、中断持久化，以及一个等待用户交互的运行。Session 测试验证可忽略事件、投影、当前格式读取和两套 SDK 预期输出。UI 组件测试覆盖每种连接与运行状态；构建后的 Web 测试覆盖配对、委派、打开 Session、审批、取消、撤销、重连与本地化输出。

无密钥 recorded-session snapshot（录制会话快照）覆盖用户与模型看到的完整委派 Session。无密钥真实 Codex 兼容性测试使用受支持的 Codex MCP 客户端连接回环 fixture（夹具），在不使用模型凭据的情况下确认握手与工具调用行为。产品可见的实现 PR 包含从真实 Web 服务端与模型流程录制的 GIF。包 README、子系统文档、配置 JSDoc、工具呈现、本地化字典和用户设置指南随代码一起更新。

## 考虑过的替代方案

**让 Codex 启动独立 stdio 适配器。** 这对 Codex 配置更简单，但会让可视化 Oasisfish 进程成为独立观察者。实时取消、交互、连接状态和运行归属都需要跨进程协调，用户仍需管理界面之外的命令。嵌入式 HTTP 端点让运行中的 Host 保持授权者与呈现来源身份。

**直接使用 ACP 或现有 SDK 协议。** 这些协议可以驱动 Harness agent，但 Codex 已消费 MCP 工具。要求 Codex 专用 ACP 或 SDK 客户端会增加另一个 Codex 集成，也不能提供 MCP 发现或配套 Skill 路径。

**通过反转 wire（通信协议）复用 `subagent-codex`。** 该提供方把 Codex 作为一次性子级启动，并把 Codex 的最终回答返回 Harness 父级。它不会让运行中的 Harness Host 可被 Codex 调用，反转其私有 app-server 客户端还会混合两个独立的生命周期与授权归属者。

**直接写入 Codex 配置文件。** 仓库自有的 TOML 变更路径需要跟随产品私有布局、合并、锁定与版本规则。桥接使用受支持的 Codex 注册与身份验证操作；无法使用时显示配置值，而不是创建另一个配置归属者。

**公开通用远程工具代理。** 转发任意 Harness 工具会绕过 Session 日志、Agent 策略、模型中介和现有交互界面。单个委派工具让面向模型的输入保持已记录状态，并由普通循环负责工具与审批。

**第一版允许网络绑定。** 可远程访问的 agent 端点需要 TLS 身份、部署身份验证、代理信任、rate limiting（速率限制）、网络来源策略与不同的凭据恢复模型。仅回环配对能够服务所请求的本机 Codex 与 Oasisfish 工作流，而不声称提供这些保证。

**从后台与可继续运行开始。** 持久继续需要 Codex 可见的运行收集、后续消息排序、重连语义与通知策略。同步单轮调用会先建立授权、生命周期、日志与 UI 归属。

## 验收标准

- 用户启用可选 Bundle，在 Oasisfish 设置界面连接受支持的本机 Codex 安装，验证连接健康状态，并在不手工编辑 Harness 配置的情况下撤销连接。
- Codex 发现一个委派工具，为准入 Workspace 调用该工具，等待最终结果，并收到准确的持久 Session id，以及有界的最终回答或安全失败。
- 每个获准请求创建一个可见的普通根 Session，其持久来源记录不包含凭据。用户可以打开它、观察工具与消息、回答受支持的交互，并取消活动运行。
- 连接策略而非工具参数决定 Workspace、Preset、模型路由、权限预设、限制与写入权限。无效的身份验证、Origin、Workspace、路径别名、重复 id 或提权尝试不会启动 Agent。
- 端点无法在非回环 Web 服务端上激活。撤销与 dispose 拒绝新调用、结算实时调用、移除 route 与观察器，并保留真实的 Session 历史。
- 聚焦的协议、安全、生命周期、持久化、SDK、UI、Web、快照与真实 Codex 兼容性证据通过。双语文档与所需 GUI GIF 随实现提交。

## 风险

Codex 产品注册与身份验证行为可以独立于本仓库变化。因此桥接依赖经过验证的 Codex 版本范围，并且在该集成不可用时必须失败并给出可操作的设置指南；它不能回退到编辑未知配置格式。

同 Workspace 写入委派是协作式的，可能与 Codex、编辑器、构建工具或其他 agent 冲突。默认只读、同步路由指导、可见运行状态与显式写入准入会降低风险，但不会提供隔离或回滚。

嵌入式 MCP 端点增加 Host 的安全责任。身份验证错误、Origin 错误、过宽的 Workspace 准入、不安全诊断或权限策略不匹配都可能暴露本机执行能力。仅回环激活、可撤销凭据、fail-closed（失败关闭）验证、聚焦的恶意输入测试和禁止参数驱动提权是验收要求，而不是可选强化。

新的持久事件与 UI 投影给原本可能只是传输功能的改动增加了持久化和 SDK 工作。省略该记录会使完成的委派 Session 在重启后无法区分，并违背所请求的可视化归属，因此本提案接受这项协调成本。
