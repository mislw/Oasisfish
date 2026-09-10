# 原生记忆实施计划

[English](2026-09-10-native-memory.md) | 中文

**目标：** 为 Oasisfish 增加持久全局/项目记忆、由模型管理的写入、每轮已记录的上下文注入、持久会话历史搜索和 Web Settings 管理页。

**架构：** `@deepseek-ai/dsh-memory` 定义提供方无关的 Service；`@deepseek-ai/dsh-memory-local` 基于 `ctx.storage.domain` 实现；`@deepseek-ai/dsh-tool-memory` 是 Agent 作用域内的模型 Consumer 并负责可记录的上下文注入；`@deepseek-ai/dsh-client-ui-settings-memory` 提供类型化 Host Remote 和浏览器 Settings 页面。历史搜索继续由已有 session-query 包负责。

**技术栈：** TypeScript、Cordis 插件、storage-domain/JSON、Typert Remote、React、Vitest、Loader 组装 snapshot。

## 任务 1：Service Definition

在 `packages/memory/memory/` 新建清单、构建配置、源码、invariant、测试和双语 README，并新增 `packages/memory/` 双语索引。

1. 先写品牌 id、Provider 注册/卸载、缺失 Provider 和请求委托的失败测试。
2. 运行 `pnpm exec vitest run packages/memory/memory/tests`，确认失败来自尚未实现的 Service。
3. 实现单 Provider 注册服务和公开类型/错误。
4. 增加运行时 invariant，关联 Provider 注册与 Service 解析成功。
5. 重新运行聚焦测试并跑绿。

## 任务 2：本地持久 Provider

**文件：**
- 新建 `packages/memory/memory-local/package.json`
- 在 `packages/memory/memory-local/` 下新建构建配置、源码、测试、invariant 和双语 README

1. 先写用户/项目隔离、缺失 `cwd`、SHA-256 项目标识、重启持久化、并发变更、不可变返回、重复内容、精确条目/字符限制、Unicode 计数、敏感内容类别、单调时间、启用状态和卸载的失败测试。
2. 运行聚焦测试并确认失败。
3. 定义 `native-memory` domain schema，并使用按作用域变更队列实现 Provider。
4. 在 `add` 和 `update` 入口强制执行全部安全与容量规则。
5. 重新运行聚焦测试和包级覆盖率并跑绿。

## 任务 3：模型工具与日志上下文

**文件：**
- 新建 `packages/memory/tool-memory/package.json`
- 在 `packages/memory/tool-memory/` 下新建构建配置、源码、测试、invariant 和双语 README
- 修改 `scripts/gen-tool-catalog.ts`
- 通过仓库生成器修改生成的工具/配置目录

1. 先写四种 `memory_manage` 操作、schema 校验、Provider 错误渲染、关闭行为、引导文本、每轮首 step 注入、来源元数据、拒绝行为、下一轮快照刷新和卸载的失败测试。
2. 新增 Loader 组装的无 Key fixture，让确定性后端调用 `memory_manage` 并报告已提交结果。
3. 运行聚焦测试和 snapshot，确认失败。
4. 实现工具注册、展示、提示，以及先委托再返回带来源 `UserMessage` 的 prepend `agent/pre-step` 监听器。
5. 在目录生成器中登记工具并记录新 snapshot。
6. 重新运行测试与 snapshot 并跑绿。

## 任务 4：Settings Host 与浏览器 UI

**文件：**
- 新建 `packages/client/ui-settings-memory/package.json`
- 在 `packages/client/ui-settings-memory/` 下新建 Host/client 构建配置、Remote 服务、store、组件、样式、locale、测试、invariant 和双语 README
- 修改 `packages/client/modules/README.md`、`packages/client/modules/README.zh.md` 与配对元数据

1. 先写 Host Remote 的 list/add/update/remove/enable 调用和项目上下文校验失败测试。
2. 先写浏览器 section 注册、懒加载、开关、记录分组、新增/编辑/删除、错误时保留草稿和语言切换失败测试。
3. 运行聚焦 Host/client 测试并确认失败。
4. 实现基于 `ctx.memory` 的 Host Remote 服务，以及具有稳定 snapshot 的浏览器 store。
5. 使用现有 Settings primitive 和 icon 实现 `Memory` 设置 section。
6. 重新运行聚焦测试并跑绿。

## 任务 5：产品组装与持久历史搜索

**文件：**
- 修改 `packages/bundle/base/cordis.patch.yml`
- 修改 `packages/bundle/base/package.json`
- 修改 `packages/bundle/web-app/cordis.patch.yml`
- 修改 `packages/bundle/web-app/package.json`
- 修改 `apps/cli/config/agent-presets/standard/agent.cordis.yml`
- 修改 preset 组装测试
- 修改 `apps/desktop-runtime/package.json`
- 仅在生成/工作区约定要求时修改相关 tsconfig 聚合与 `tsconfig.base.json` paths

1. 为 Host memory Provider、standard preset 工具、Web Settings 插件与持久 session-query SQLite 路径增加失败的组装断言。
2. 运行聚焦 bundle/preset/desktop 依赖测试并确认失败。
3. 在 Host 平面挂载 Service Definition 与本地 Provider；在 `standard` 挂载工具；在 Web 挂载 Settings；使用 `dshHomePath('session-search.sqlite')` 和惰性打开路由搜索索引。
4. 将每个包加入 resolver manifest 与桌面依赖闭包。
5. 重新运行聚焦组装测试并跑绿。

## 任务 6：文档与 Agent Note

**文件：**
- 新建 `.agents/notes/implemented/feature/2026-09-10-native-memory.md`
- 新建中文对侧与配对元数据
- 修改受影响的双语 bundle、preset、Settings 与 subsystem 文档
- 重新生成 `docs/tool-catalog*` 与 `docs/config-catalog*`

1. 记录当前交付行为、被否决的替代方案、安全规则、模型/日志影响和验证证据。
2. 运行仓库目录生成器。
3. 运行 `pnpm run doc-sync`；修改所有者文案或配对元数据，不通过手改生成产物解决问题。

## 任务 7：验证与桌面验收

1. 运行所有新源码包的聚焦 Vitest 覆盖率。
2. 运行 Loader 组装的无 Key snapshot 与相关 preset/bundle/client 测试。
3. 聚焦证据通过后，各运行一次 `pnpm run typecheck`、`pnpm run build` 和 `pnpm run doc-sync`。
4. 运行相关桌面 `typecheck`、测试、runtime prepare/stage verify 和不调用外部模型的 unpacked smoke。
5. 重新计算现有用户 `settings.yaml` 和 `.credentials.yaml` 哈希，要求与变更前完全一致，但不输出文件内容。
6. 运行 `git diff --check`，检查 `git status --short` 并报告实际执行的检查。除非用户另行要求，不 commit/push。
