# 模型与中转站管理实现计划

[English](2026-08-26-model-relay-management.md) | 中文

> **面向执行 Agent：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，逐任务执行本计划。步骤使用复选框（`- [ ]`）跟踪。

**目标：** 将现有模型设置分节升级为独立的“模型与中转站”页面，提供提供方摘要、真实连接测试、默认模型切换和默认提供方删除保护。

**架构：** 在现有 `ctx.llm` 配置操作中增加按设置命名空间注册的草稿提供方测试，通过 ApiProxy 暴露测试与默认模型操作，同时继续将提供方档案保存在 `llm-pi-ai`、将密钥保存在 `ctx.credentials`。现有模型客户端插件继续作为唯一 UI 管理者，将提供方设置、凭据、实时模型目录和共享 `agent-default-model` 选择组合到一个页面。

**技术栈：** TypeScript、Cordis services 与 effects、Schemastery RPC schemas、React、CSS modules、Vitest、Playwright、Electron 打包。

**设计文档：** `docs/superpowers/specs/2026-08-26-model-relay-management-design.zh.md`

## 全局约束

- 只管理 DeepSeek Harness 配置；绝不读取或写入 Codex、Claude Code 或其他产品的配置文件。
- API Key 继续通过 `credentials.set` 只写保存；settings、日志、诊断、快照和 UI 文本都不能包含密钥值。
- 新默认值只影响新任务；已有任务保留自己的 Session 路由。
- 首个版本只支持手动切换，不提供提供方轮转、负载均衡或自动故障转移。
- `llm.testProvider` 接受用户选择的 URL 和草稿凭据，因此只能从回环地址调用。
- 所有用户可见字符串同时维护英文和简体中文。

---

### 任务 1：草稿提供方测试能力

**文件：**
- 修改：`packages/llm/llm/src/types.ts`
- 修改：`packages/llm/llm/src/index.ts`
- 测试：`packages/llm/llm/tests/topology.spec.ts`
- 修改：`packages/llm/llm/README.md`
- 修改：`packages/llm/llm/README.zh.md`

**接口：**
- 产出：`LlmProviderProbeRequest`、`LlmProviderProbeStage`、`LlmProviderProbeResult`。
- 产出：`LlmRuntime.registerProviderProbe(settingsNs, handler)` 和 `LlmRuntime.testProvider(settingsNs, request)`。
- 使用：`registerModelDiscovery` 已采用的设置命名空间归属方式。

- [ ] **步骤 1：编写失败的注册表测试**

增加测试：为 `llm-pi-ai` 注册一个测试处理器、拒绝重复注册、转发独立的草稿请求与 signal、使用 `NO_PROVIDER_PROBE` 拒绝未知命名空间，并在 disposer 执行后停止服务。

```ts ignore-check
const dispose = runtime.registerProviderProbe('llm-pi-ai', async request => ({
  ok: true,
  stage: 'response',
  model: request.model,
  text: 'OK',
  elapsedMs: 12,
}))
expect(await runtime.testProvider('llm-pi-ai', request)).toMatchObject({ ok: true, text: 'OK' })
dispose()
await expect(runtime.testProvider('llm-pi-ai', request)).rejects.toMatchObject({ code: 'NO_PROVIDER_PROBE' })
```

- [ ] **步骤 2：运行定向测试并确认缺少 API 的失败**

运行：`pnpm vitest run packages/llm/llm/tests/topology.spec.ts`

预期：FAIL，因为 `registerProviderProbe` 和 `testProvider` 尚不存在。

- [ ] **步骤 3：增加请求与结果类型**

```ts
export type LlmProviderProbeStage = 'endpoint' | 'authentication' | 'protocol' | 'model' | 'response'

export interface LlmProviderProbeRequest {
  provider?: string
  baseURL?: string
  api?: string
  apiKey?: string
  model: string
  signal?: AbortSignal
}

export type LlmProviderProbeResult =
  | { ok: true; stage: 'response'; model: string; text: string; elapsedMs: number }
  | { ok: false; stage: LlmProviderProbeStage; code: string; message: string; elapsedMs: number }
```

- [ ] **步骤 4：实现按设置命名空间注册的测试表**

沿用 `registerModelDiscovery`：验证非空命名空间，通过 `ctx.effect()` 注册，调用前复制草稿字段，传递调用方 signal，并通过 `LlmError` 拒绝重复或缺失的处理器。

- [ ] **步骤 5：运行定向测试并更新双语包说明**

运行：`pnpm vitest run packages/llm/llm/tests/topology.spec.ts`

预期：PASS。文档说明测试属于配置阶段操作，不写入 settings，也不进入 Session 日志。

- [ ] **步骤 6：提交能力改动**

```powershell
git add packages/llm/llm
git commit -m "feat(llm): add draft provider probes"
```

### 任务 2：Pi-AI 连接测试实现

**文件：**
- 新建：`packages/llm/llm-pi-ai/src/probe.ts`
- 修改：`packages/llm/llm-pi-ai/src/index.ts`
- 测试：`packages/llm/llm-pi-ai/tests/probe.spec.ts`
- 修改：`packages/llm/llm-pi-ai/README.md`
- 修改：`packages/llm/llm-pi-ai/README.zh.md`

**接口：**
- 使用：任务 1 的 `LlmProviderProbeRequest` 和 `LlmProviderProbeResult`。
- 使用：`resolveProfiles`、`PiAiAdapter`、现有 auth injection 和模型发现使用的已存密钥回退。
- 产出：`testProvider(request, options)` 以及 `llm-pi-ai` 测试注册。

- [ ] **步骤 1：使用本地脚本服务器编写失败测试**

覆盖 OpenAI Chat Completions 成功返回 `OK`、Responses 成功、401/403 映射为 `authentication`、404 模型拒绝映射为 `model`、无效 JSON 或错误流映射为 `response`、不支持协议映射为 `protocol`、端点不可达映射为 `endpoint`、调用方取消映射为 `ABORTED`，以及输入密钥优先于已存密钥。

```ts ignore-check
const result = await testProvider({
  provider: 'probe-route',
  baseURL: server.url,
  api: 'openai-completions',
  apiKey: 'sk-draft',
  model: 'probe-model',
}, options)
expect(result).toMatchObject({ ok: true, stage: 'response', model: 'probe-model', text: 'OK' })
expect(server.headers[0]?.authorization).toBe('Bearer sk-draft')
```

- [ ] **步骤 2：运行新测试并确认缺少模块的失败**

运行：`pnpm vitest run packages/llm/llm-pi-ai/tests/probe.spec.ts`

预期：FAIL，因为 `src/probe.ts` 尚不存在。

- [ ] **步骤 3：构建一个临时解析路由和 adapter**

在 `provider ?? '__probe__'` 下解析单路由档案，为请求的 `model` 强制创建一个模型条目，并使用草稿 `baseURL` 和 `api`。凭据先读取 `request.apiKey`，然后才读取已存路由密钥。基于该不可变档案和现有 auth injection 创建 `PiAiAdapter`，但不注册到 `ctx.llm`。

- [ ] **步骤 4：发送最小请求并分类失败**

发送一条内容为 `Reply with exactly OK.` 的用户消息，只收集到 `finish` 为止的 assistant 文本。设置 `maxTokens: 8`、关闭 adapter 重试，并使用 `AbortSignal.timeout(15_000)` 与调用方 signal 限制整体操作。最多返回 200 个响应字符。将状态或鉴权失败、不支持协议、未知模型、传输失败和错误完成流映射到 stage union，不返回原始提供方响应体。

- [ ] **步骤 5：在模型发现旁注册连接测试**

```ts ignore-check
ctx.llm.registerProviderProbe(NS, request => testProvider(request, {
  auth: { credentials: credentialStore, authContext },
  storedApiKey: () => storedApiKey(request.provider),
}))
```

- [ ] **步骤 6：运行定向测试并更新双语包说明**

运行：`pnpm vitest run packages/llm/llm-pi-ai/tests/probe.spec.ts packages/llm/llm-pi-ai/tests/discovery.spec.ts`

预期：PASS，断言消息和快照中没有密钥值。

- [ ] **步骤 7：提交提供方实现**

```powershell
git add packages/llm/llm-pi-ai
git commit -m "feat(llm-pi-ai): test draft provider connections"
```

### 任务 3：ApiProxy 操作与回环安全

**文件：**
- 修改：`packages/host/apiproxy/src/api/llm.ts`
- 修改：`packages/host/apiproxy/src/api/rpc.ts`
- 修改：`packages/host/apiproxy/src/api-proxy.ts`
- 修改：`packages/host/apiproxy/src/fetch/client.ts`
- 修改：`packages/host/apiproxy/tests/client-handler.spec.ts`
- 修改：`packages/host/apiproxy/tests/fetch-carrier.spec.ts`
- 修改：`packages/client/connection/src/index.ts`
- 修改：`packages/client/connection/src/client/fixture.ts`
- 修改：`packages/client/connection/tests/fake-api.client.ts`
- 修改：`packages/client/connection/tests/node-half.host.spec.ts`

**接口：**
- 产出：`llm.defaultModel`、`llm.selectDefaultModel` 和 `llm.testProvider` RPC 方法。
- 使用：`ApiProxyDefaults.defaultModelSelection`、`saveDefaultModelSelection`、`ctx.llm.resolveModelInfo` 和 `ctx.llm.testProvider`。
- 产出：不含密钥的客户端值 `ProviderProbeView`。

- [ ] **步骤 1：编写失败的 API carrier 测试**

断言三个方法的精确请求与响应解析，验证 `selectDefaultModel` 在保存前拒绝不可用的提供方或模型，并验证 `testProvider` 转发 AbortSignal 且错误中绝不回显 `apiKey`。

```ts
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import { expect } from 'vitest'

declare const client: IApiClient

const selected = await client.llm.selectDefaultModel({ provider: 'acme', model: 'large' })
expect(selected.result).toEqual({ ok: true, value: { selected: { provider: 'acme', model: 'large' } } })
```

- [ ] **步骤 2：运行定向 Host 和 carrier 测试**

运行：`pnpm vitest run packages/host/apiproxy/tests/client-handler.spec.ts packages/host/apiproxy/tests/fetch-carrier.spec.ts packages/client/connection/tests/node-half.host.spec.ts`

预期：FAIL，因为 RPC method map 和客户端尚未包含新方法。

- [ ] **步骤 3：增加 schema 和 ApiProxy 实现**

`defaultModel` 返回当前共享默认值。`selectDefaultModel` 先调用 `ctx.llm.resolveModelInfo(provider, model)`，然后调用 `saveDefaultModelSelection` 并返回完整已存选择。`testProvider` 验证 `settingsNs`、端点、协议、模型和可选凭据，调用任务 1 的操作，并将抛出的 `LlmError` 转换为不含密钥的 RPC 错误。

- [ ] **步骤 4：将测试标记为仅回环可用**

将 `llm.testProvider` 加入 `PRIVILEGED_METHODS` 和两个 trusted-host 拒绝列表。`defaultModel` 和 `selectDefaultModel` 只携带模型 ID，与现有 Session 模型选择权限一致，因此不加入该集合。

- [ ] **步骤 5：更新 fixture 和 fake client**

fixture 返回现有默认值，在进程内状态中接受新的默认选择，并返回确定性的成功测试结果。增加 dispatch case，使 built-client 测试覆盖同一 method map。

- [ ] **步骤 6：运行定向测试**

运行步骤 2 的命令，再运行 `pnpm vitest run packages/client/connection/tests/fixture.client.spec.ts`。

预期：PASS。

- [ ] **步骤 7：提交 API 操作**

```powershell
git add packages/host/apiproxy packages/client/connection
git commit -m "feat(api): expose relay testing and default model selection"
```

### 任务 4：模型页面状态与命令

**文件：**
- 修改：`packages/client/ui-settings-models/src/client/store.ts`
- 新建：`packages/client/ui-settings-models/src/client/provider-summary.ts`
- 新建：`packages/client/ui-settings-models/src/client/ProviderProbe.tsx`
- 新建：`packages/client/ui-settings-models/src/client/ProviderProbe.module.css`
- 修改：`packages/client/ui-settings-models/src/client/ProviderEditor.tsx`
- 修改：`packages/client/ui-settings-models/src/client/CustomProviderCard.tsx`
- 测试：`packages/client/ui-settings-models/tests/store.client.spec.ts`
- 测试：`packages/client/ui-settings-models/tests/provider-form.client.spec.tsx`

**接口：**
- 产出：包含端点主机、协议和模型数量的 `ProviderRow.summary`。
- 产出：`ModelsSettingsState.defaultSelection`、`groups` 和 `catalogFailures`。
- 产出：`ModelsSettingsStore.selectDefault(selection)`。
- 使用：任务 3 的三个 RPC 方法。

- [ ] **步骤 1：编写失败的状态与组件测试**

测试 load 会组合 providers、settings、credentials、catalog 和默认选择；旧 load 不会覆盖新 load；保存默认选择后会刷新快照；摘要不包含 query string 或凭据；ProviderProbe 提交当前尚未保存的 Base URL、协议、密钥和模型。

- [ ] **步骤 2：运行定向客户端测试**

运行：`pnpm vitest run packages/client/ui-settings-models/tests/store.client.spec.ts packages/client/ui-settings-models/tests/provider-form.client.spec.tsx`

预期：FAIL，因为新状态和组件尚不存在。

- [ ] **步骤 3：扩展组合 store**

将 `llm.providers`、`llm.models` 和 `llm.defaultModel` 与 settings mirror 并行加载，凭据扩充失败仍保持非致命，并提供 `selectDefault()`：失败时保留旧快照，成功后重新加载。

- [ ] **步骤 4：派生安全的提供方摘要**

通过 `SettingsSchemaOperations` 读取已解析档案，只显示 `new URL(baseURL).host`、协议和有效模型数量；缺失或无效数据返回本地化未知标记。提供方行绝不展示完整 URL。

- [ ] **步骤 5：实现可复用连接测试控件**

ProviderProbe 管理 idle/testing/success/failure 状态，要求选择模型，调用 `llm.testProvider`，显示耗时与完成阶段，提示成功测试可能使用少量额度，并在任何草稿字段变化时清除旧结果。

- [ ] **步骤 6：在两个编辑入口中挂载测试控件**

从 ProviderEditor 和 CustomProviderCard 传递精确草稿字段。已存提供方的密钥输入为空时，由 Host 使用已存凭据；输入替换密钥时，新值优先。

- [ ] **步骤 7：运行定向测试并提交**

运行步骤 2 的命令。

```powershell
git add packages/client/ui-settings-models
git commit -m "feat(ui): add relay summaries and connection tests"
```

### 任务 5：独立模型与中转站页面

**文件：**
- 修改：`packages/client/ui-settings-models/src/client/ModelsSection.tsx`
- 修改：`packages/client/ui-settings-models/src/client/ModelsSection.module.css`
- 修改：`packages/client/ui-settings-models/src/client/locales.ts`
- 修改：`packages/client/ui-settings-models/src/client/index.ts`
- 测试：`packages/client/ui-settings-models/tests/components.client.spec.tsx`
- 测试：`packages/client/ui-settings-models/tests/apply.client.spec.ts`
- 测试：`packages/client/ui-settings-general/tests/settings-root.client.spec.tsx`

**接口：**
- 使用：任务 4 的组合 store 和测试组件。
- 产出：导航标签“模型与中转站”、默认路由选择器、提供方摘要行和删除保护。

- [ ] **步骤 1：编写失败的 UI 测试**

断言分节标签与标题、默认提供方和模型控件、“设为默认”操作、当前默认标记、端点/协议/模型数量摘要、连接测试入口，以及当前默认提供方行禁用删除。

- [ ] **步骤 2：运行定向 UI 测试**

运行：`pnpm vitest run packages/client/ui-settings-models/tests/components.client.spec.tsx packages/client/ui-settings-models/tests/apply.client.spec.ts packages/client/ui-settings-general/tests/settings-root.client.spec.tsx`

预期：FAIL，原因是旧模型文案和缺少新控件。

- [ ] **步骤 3：重命名并整理页面**

保留分节 id `models` 以维持兼容，显示文案改为 Models and Relays / 模型与中转站，在提供方列表之前放置紧凑的默认路由控件，并继续保证一次只打开一个编辑器。使用现有 primitives 和设置弹窗里的导航按钮，不新增第二个应用或桌面专用窗口。

- [ ] **步骤 4：增加明确的默认选择**

提供方控件列出实时目录分组，模型控件跟随所选提供方，操作调用 `controller.selectDefault`。不修改当前 Session。当选择已等于默认值或该路由存在目录失败时禁用操作。

- [ ] **步骤 5：保护默认提供方删除**

当提供方等于 `defaultSelection` 时禁用“删除”，tooltip 和 accessible name 使用“先切换默认模型再删除”，并在 `removeProviderProfile` 中增加同样保护，避免程序化点击绕过。

- [ ] **步骤 6：完成响应式样式**

只有内容列空间足够时才使用两列提供方摘要，保证按钮和文字适配现有 700px 设置面板，并在窄桌面宽度折叠为单列，避免卡片嵌套。

- [ ] **步骤 7：运行定向测试并提交**

运行步骤 2 的命令。

```powershell
git add packages/client/ui-settings-models packages/client/ui-settings-general/tests/settings-root.client.spec.tsx
git commit -m "feat(ui): add models and relays management page"
```

### 任务 6：真实组合、快照与文档

**文件：**
- 修改：`apps/web/tests/models-settings.e2e.ts`
- 修改：`apps/web/tests/default-model.e2e.ts`
- 新增或更新：`apps/web/tests/snapshots/models-settings/*.expected.md`
- 新建：`.agents/notes/implemented/feature/2026-08-26-model-relay-management.md`
- 修改：`packages/client/ui-settings-models/README.md`
- 修改：`packages/client/ui-settings-models/README.zh.md`
- 修改：`packages/host/apiproxy/README.md`
- 修改：`packages/host/apiproxy/README.zh.md`

**接口：**
- 使用：完整 Host 和 UI 流程。
- 产出：无密钥的用户可见快照和必需的决策记录。

- [ ] **步骤 1：扩展真实 Web scaffold 场景**

使用本地 OpenAI 兼容服务器创建自定义中转站、获取模型、执行成功连接测试、将模型设为默认、刷新页面并验证默认值仍存在。增加一个 401 失败场景，确认结果指出鉴权失败且不展示密钥。

- [ ] **步骤 2：更新默认模型场景**

从“模型与中转站”页面设置默认值，创建之后的 Session 并验证使用选定路由，然后证明已有 request header 日志的 Session 仍保持自己的路由。

- [ ] **步骤 3：记录并验证 UI 快照**

运行：`pnpm run test:snapshot:record -- -t "Models settings page"`

然后运行：`pnpm run test:snapshot -- -t "Models settings page"`

预期：更新后的中文快照显示独立导航标签、默认控件、提供方摘要和测试结果，且不含凭据值。

- [ ] **步骤 4：编写 implemented Agent Note 和包说明**

记录提供方档案继续归属 `llm-pi-ai` 的原因、默认切换与当前 Session 切换分离的原因、测试由 Host 管理并限制回环的原因、被拒绝的独立桌面管理器与自动轮转方案，以及精确验证层级。

- [ ] **步骤 5：重新记录文档配对**

对每个修改的 README 和 Agent Note 执行定向 `verify-translation-pairing --write`，随后执行定向配对检查。

- [ ] **步骤 6：运行相关检查并提交**

运行：`pnpm vitest run apps/web/tests/models-settings.e2e.ts apps/web/tests/default-model.e2e.ts`

运行：`pnpm run typecheck`

运行：`pnpm run lint`

运行：`pnpm run doc-sync`

运行：`git diff --check`

```powershell
git add apps/web/tests packages/client/ui-settings-models packages/host/apiproxy .agents/notes/implemented/feature
git commit -m "test: verify model and relay management"
```

### 任务 7：Windows 桌面发行验证

**文件：**
- 只有验证发现确切问题时才修改：`apps/desktop/**`
- 生成输出：`apps/desktop/release/**` 继续作为未跟踪发行产物。

**接口：**
- 使用：发行版 Web profile 和自包含桌面运行时。
- 产出：包含该功能的新 Windows 打包和安装版本。

- [ ] **步骤 1：运行定向 pre-push 选择**

使用 `.agents/skills/dsh-pre-push-checks/SKILL.md` 选择覆盖当前改动的最小检查集。除非所选检查覆盖更广的组装路径，否则不重复已通过检查。

- [ ] **步骤 2：构建 Harness 和桌面应用**

执行 `apps/desktop/README.md` 中的仓库构建、桌面运行时准备、Electron 构建和 NSIS 打包命令。

- [ ] **步骤 3：执行解包版 smoke 验证**

启动解包版应用，验证 HTTP 200，打开“模型与中转站”，在不暴露真实密钥的情况下创建测试提供方，并确认内置 `dsh` 和工具链仍可执行。

- [ ] **步骤 4：安装并验证打包应用**

关闭旧安装版进程，安装新的 x64 安装包，启动后验证页面，并在重启后确认默认值仍存在；最后确认关闭窗口时 Harness 子进程退出。

- [ ] **步骤 5：检查最终 Git 与发行状态**

运行：`git status --short --branch`

分别报告提交、实际执行的命令、安装包路径与 SHA-256、安装路径、运行时验证，以及任何与本次无关的既有失败。除非用户要求，否则不推送。
