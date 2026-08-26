# Windows 桌面 App 实施计划

[English](2026-08-26-windows-desktop-app.md) | 中文

> **面向自主执行的工作单元：** 必须使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 子 Skill，逐项实施本计划。步骤使用复选框（`- [ ]`）跟踪。

**目标：** 为 DeepSeek Harness 及其常用脚本工具链构建并验证一个自包含的 Windows 10/11 x64 Electron 安装包。

**架构：** Electron 以外部内置 Node 进程的方式监督现有 `dsh web` 应用。固定版本的运行时清单和准备脚本将经过验证的便携工具装配到 `extraResources`，且不修改系统环境。

**技术栈：** TypeScript、Electron、electron-builder、Vitest、pnpm deploy、兼容 PowerShell 的便携 Windows 运行时。

**规格：** `docs/superpowers/specs/2026-08-26-windows-desktop-app-design.md`

## 全局约束

- 仅支持 Windows 10/11 x64。
- 安装和本地工具启动过程不执行网络下载。
- Harness 保持在外部内置 Node 进程中运行。
- 不修改机器或用户的 `PATH`。
- Harness 服务器仅绑定到 `127.0.0.1`。
- 生成的运行时、缓存、安装包和日志不进入 Git。

---

### 任务 1：桌面生命周期 package

**文件：**
- 创建：`apps/desktop/package.json`
- 创建：`apps/desktop/tsconfig.json`
- 创建：`apps/desktop/tsdown.config.ts`
- 创建：`apps/desktop/src/paths.ts`
- 创建：`apps/desktop/src/environment.ts`
- 创建：`apps/desktop/src/server.ts`
- 创建：`apps/desktop/src/main.ts`
- 创建：`apps/desktop/tests/environment.spec.ts`
- 创建：`apps/desktop/tests/server.spec.ts`

**接口：**
- 产出：供 Electron 监督进程使用的 `resolveDesktopPaths()`、`buildHarnessEnvironment()`、`reserveLoopbackPort()` 和 `waitForServer()`。

- [ ] 编写环境与就绪检查测试，并确认它们因模块尚不存在而失败。
- [ ] 运行 `pnpm exec vitest run apps/desktop/tests`，确认出现缺少模块的失败。
- [ ] 实现纯路径、环境、端口和就绪检查模块。
- [ ] 运行聚焦测试并确认通过。
- [ ] 使用已测试模块实现 Electron 单实例、BrowserWindow、进程启动、日志、超时和关闭生命周期。
- [ ] 运行聚焦测试和 package typecheck，然后提交生命周期 package。

### 任务 2：经过验证的便携运行时装配

**文件：**
- 创建：`apps/desktop/runtime-manifest.json`
- 创建：`apps/desktop/scripts/runtime-manifest.mjs`
- 创建：`apps/desktop/scripts/prepare-runtime.mjs`
- 创建：`apps/desktop/tests/runtime-manifest.spec.ts`
- 修改：`.gitignore`

**接口：**
- 消费：`resolveDesktopPaths()` 预期的运行时目录布局。
- 产出：`apps/desktop/build-resources/runtime/manifest.json`，以及设计中命名的全部可执行文件目录。

- [ ] 为目标路径重复、不安全 URL、缺失哈希、不支持的归档格式和缺少必要工具名称编写清单验证测试。
- [ ] 运行聚焦测试并确认它因验证逻辑尚不存在而失败。
- [ ] 实现清单解析与验证。
- [ ] 运行聚焦测试并确认通过。
- [ ] 实现缓存下载、SHA-256 验证、安全解压、Python pip 引导、pnpm 安装、许可证暂存、可执行文件检查和原子发布。
- [ ] 添加生成运行时、缓存与输出的忽略规则，然后提交运行时装配实现。

### 任务 3：Harness 部署与安装包

**文件：**
- 创建：`apps/desktop/scripts/prepare-harness.mjs`
- 创建：`apps/desktop/scripts/verify-staged-runtime.mjs`
- 创建：`apps/desktop/electron-builder.yml`
- 创建：`apps/desktop/assets/icon.ico`
- 修改：`pnpm-workspace.yaml`
- 修改：`pnpm-lock.yaml`

**接口：**
- 产出：暂存的生产 Harness 闭包、`dist/win-unpacked` 和 x64 NSIS 安装包。

- [ ] 为预期的暂存 Harness 与运行时可执行文件添加测试。
- [ ] 在空暂存目录上运行测试并确认预期失败。
- [ ] 实现 `pnpm deploy` 暂存和库存验证器。
- [ ] 添加固定版本的 Electron/electron-builder 依赖和经过审查的安装脚本允许列表。
- [ ] 配置 `extraResources`、ASAR、x64 NSIS、产物命名、图标和 package scripts。
- [ ] 构建未打包应用，运行库存验证器，并提交打包路径。

### 任务 4：文档与决策记录

**文件：**
- 创建：`apps/desktop/README.md`
- 创建：`apps/desktop/README.zh.md`
- 创建：`apps/desktop/README.i18n.yaml`
- 创建：`.agents/notes/implemented/feature/2026-08-26-self-contained-windows-desktop-app.md`
- 创建：`.agents/notes/implemented/feature/2026-08-26-self-contained-windows-desktop-app.zh.md`
- 创建：`.agents/notes/implemented/feature/2026-08-26-self-contained-windows-desktop-app.i18n.yaml`
- 修改：`README.md`
- 修改：`README.zh.md`

**接口：**
- 记录：发行准备、内置工具范围、本地开发、限制、运行时路径、失败处理和验证。

- [ ] 编写 package README 配对和 implemented Agent Note 配对。
- [ ] 从根 README 配对链接桌面 App。
- [ ] 记录双语一致性元数据。
- [ ] 运行翻译配对和文档 gates，然后提交文档。

### 任务 5：安装包与运行时验证

**文件：**
- 创建：`apps/desktop/scripts/smoke-unpacked.mjs`
- 创建：`apps/desktop/tests/smoke-unpacked.spec.ts`

**接口：**
- 消费：任务 3 生成的未打包桌面产品。
- 产出：证明内置 UI 和工具链可从产品路径启动的机器可读证据。

- [ ] 编写 smoke harness，检查未打包资源库存并报告版本命令结果。
- [ ] 在不完整产品上运行它并确认预期失败。
- [ ] 准备每个固定版本的运行时归档并构建 x64 安装包。
- [ ] 启动未打包应用，等待就绪标记，并验证回环 Web UI。
- [ ] 通过产品环境运行每个内置工具的版本命令。
- [ ] 运行聚焦测试、package typecheck/build、`pnpm run lint`、相关 hygiene/doc gates 和 `git diff --check`。
- [ ] 审查最终 diff 并提交经过验证的安装包实现。
