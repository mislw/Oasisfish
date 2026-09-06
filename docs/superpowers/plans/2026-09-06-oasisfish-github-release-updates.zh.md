# Oasisfish GitHub Release 更新实施计划

[English](2026-09-06-oasisfish-github-release-updates.md) | 中文

> **供智能体执行者使用：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，逐项执行本计划。步骤使用复选框（`- [ ]`）跟踪。

**目标：** 增加仅桌面端可见、完全由用户手动触发的 GitHub Release 更新流程，下载并安装新版 Oasisfish NSIS 安装包，同时保留全部用户数据，并仅在安全确认后清理旧便携版目录。

**架构：** `electron-updater` 只运行在 Electron 主进程中，由有限状态控制器和固定 IPC 白名单封装。浏览器插件仅在沙盒 preload bridge 存在时展示更新状态；打包文件清单与安装器写入的安装回执共同支持一个独立 Windows helper，在目标版本安装成功后仅删除已验证的便携版文件。

**技术栈：** TypeScript、Electron 44、electron-updater 6.8.9、React 18、Cordis 客户端插件、Vitest、Playwright snapshot、electron-builder NSIS、兼容 PowerShell 5.1 的清理脚本、GitHub Actions。

**规格：** `docs/superpowers/specs/2026-09-06-oasisfish-github-release-updates-design.zh.md`

## 全局约束

- 更新 provider 固定为公开 GitHub 仓库 `mislw/Oasisfish`。
- 检查、下载与安装都只能由用户明确点击触发。
- `apps/desktop/package.json` 是版本真源；Release 标签必须严格等于 `v<version>`。
- Renderer 只能收到版本、状态、进度与安全提示；绝不能收到路径、URL、请求头、token 或原始异常。
- `%APPDATA%\DeepSeek Harness` 永不删除、移动、迁移，也不进入 Release 产物。
- 安装版升级由 NSIS 替换旧程序；应用代码绝不递归删除安装目录。
- 便携版清理仅在安装回执报告目标版本、且便携目录每一项都通过归属清单检查后执行。
- 出现未知文件、文件变化、reparse point、不安全根目录、安装失败或版本不符时，完整保留便携目录。
- GitHub 工作流只使用仓库范围的 `GITHUB_TOKEN`；模型凭据和 `.env` 不进入工作流输入或产物。
- 未签名安装包继续显示 Windows 警告；代码不绕过 SmartScreen、UAC 或 updater 校验和验证。

---

### 任务 1：共享更新协议与主进程控制器

**文件：**
- 新建：`packages/client/ui-desktop-update/package.json`
- 新建：`packages/client/ui-desktop-update/tsconfig.json`
- 新建：`packages/client/ui-desktop-update/tsdown.config.ts`
- 新建：`packages/client/ui-desktop-update/src/index.ts`
- 新建：`packages/client/ui-desktop-update/src/invariant.ts`
- 新建：`packages/client/ui-desktop-update/src/protocol.ts`
- 新建：`apps/desktop/src/update-controller.ts`
- 新建：`apps/desktop/tests/update-controller.spec.ts`
- 修改：`apps/desktop/package.json`
- 修改：`pnpm-lock.yaml`

**接口：**
- 从 `@deepseek-ai/dsh-client-ui-desktop-update/protocol` 导出 `DesktopUpdatePhase`、`DesktopUpdateProgress`、`DesktopUpdateState`、`OasisfishUpdateBridge` 与 `DesktopUpdateCommand`。
- 导出具有 `getState()`、`check()`、`download()`、`install()` 与 `subscribe()` 的 `DesktopUpdateController`。
- 控制器只消费注入的 `UpdaterFacade`、打包运行事实与安装回调；单元测试不连接 GitHub。

- [ ] **步骤 1：先在失败的控制器测试中定义协议**

采用以下只读有限状态数据模型，并验证完整不可变快照：

```ts
export type DesktopUpdatePhase =
  | 'idle' | 'checking' | 'up-to-date' | 'available'
  | 'downloading' | 'downloaded' | 'installing' | 'unsupported' | 'error'

export interface DesktopUpdateState {
  readonly phase: DesktopUpdatePhase
  readonly currentVersion: string
  readonly availableVersion?: string
  readonly progress?: {
    readonly percent?: number
    readonly transferred: number
    readonly total?: number
    readonly bytesPerSecond?: number
  }
  readonly message?: string
}
```

测试覆盖打包版初态、未打包时的 `unsupported`、检查结果、下载进度、下载完成后的安装资格、重复命令拒绝和 listener 释放。

- [ ] **步骤 2：运行控制器测试并确认 RED**

运行：`pnpm exec vitest run apps/desktop/tests/update-controller.spec.ts`

预期：由于 `update-controller.ts` 与共享协议尚不存在而失败。

- [ ] **步骤 3：实现最小控制器**

设置注入 updater 的 `autoDownload = false` 与 `autoInstallOnAppQuit = false`，并从当前语义版本推导 prerelease 资格。把 updater 事件转换为冻结的协议快照，用单个进行中 Promise 串行化命令，并通过有长度限制的 `safeUpdateMessage(error)` 投影错误，确保错误中没有文件路径、URL、请求头或疑似 token。

- [ ] **步骤 4：运行聚焦测试并确认 GREEN**

运行：`pnpm exec vitest run apps/desktop/tests/update-controller.spec.ts --coverage --coverage.include='apps/desktop/src/update-controller.ts'`

预期：通过逐文件覆盖率阈值。

- [ ] **步骤 5：增加锁定依赖并提交**

在桌面运行时依赖中加入精确版本 `electron-updater` `6.8.9`，通过 `pnpm install --lockfile-only` 更新锁文件，运行桌面 typecheck，并以 `feat(desktop): add update controller` 提交。

### 任务 2：沙盒 preload bridge 与固定 IPC handler

**文件：**
- 新建：`apps/desktop/src/update-ipc.ts`
- 新建：`apps/desktop/src/preload.ts`
- 新建：`apps/desktop/tests/update-ipc.spec.ts`
- 新建：`apps/desktop/tests/preload.spec.ts`
- 修改：`apps/desktop/src/main.ts`
- 修改：`apps/desktop/tsdown.config.ts`

**接口：**
- 固定 channel：`oasisfish-update:get-state`、`:check`、`:download`、`:install` 与 `:state`。
- 导出 `registerDesktopUpdateIpc(ipcMain, controller, windows)`，并返回 disposer。
- 只通过 `contextBridge` 暴露 `window.oasisfishUpdate: OasisfishUpdateBridge`。

- [ ] **步骤 1：编写失败的 IPC 与 preload 测试**

验证每个命令只映射一个控制器方法、非法安装状态由控制器拒绝、广播内容只有 `DesktopUpdateState`、取消订阅会移除 listener，且 bridge 不提供通用 `send`、`invoke`、channel 名、URL 或路径 API。

- [ ] **步骤 2：运行测试并确认 RED**

运行：`pnpm exec vitest run apps/desktop/tests/update-ipc.spec.ts apps/desktop/tests/preload.spec.ts`

预期：因模块不存在而失败。

- [ ] **步骤 3：实现 handler 注册与 preload bridge**

命令使用 `ipcMain.handle()`，状态使用 `webContents.send()`，订阅使用 `ipcRenderer.on/removeListener()`。`main.ts` 构建为 ESM，`preload.ts` 构建为 `dist/preload.cjs`；设置 `webPreferences.preload`，并继续保留 `contextIsolation: true`、`nodeIntegration: false` 与 `sandbox: true`。

- [ ] **步骤 4：运行测试、typecheck 并确认 GREEN**

运行 IPC、preload、window lifecycle 三个测试文件和桌面 typecheck，确认 renderer API 没有扩大。

- [ ] **步骤 5：提交 IPC 边界**

以 `feat(desktop): expose sandboxed update bridge` 提交。

### 任务 3：便携版归属清单与安装后清理

**文件：**
- 新建：`apps/desktop/scripts/portable-inventory.mjs`
- 新建：`apps/desktop/resources/portable-cleanup.ps1`
- 新建：`apps/desktop/src/portable-migration.ts`
- 新建：`apps/desktop/tests/portable-inventory.spec.ts`
- 新建：`apps/desktop/tests/portable-migration.spec.ts`
- 新建：`apps/desktop/build/installer.nsh`
- 修改：`apps/desktop/scripts/after-pack.mjs`
- 修改：`apps/desktop/electron-builder.yml`
- 修改：`apps/desktop/src/paths.ts`

**接口：**
- 生成 `resources/oasisfish-portable-inventory.json`，包含版本、根 marker、排序后的相对路径、字节数和 SHA-256。
- `resolveDesktopDistribution()` 仅在发现 NSIS 拥有的安装 marker 时返回 `installed`；解压的 `win-unpacked` 返回 `portable`。
- `preparePortableCleanup()` 把 helper 与不可变清理请求复制到 `<userData>/updates/`，并在 `quitAndInstall()` 前以 detached 方式启动。
- NSIS `customInstall` 宏原子写入 `<userData>/updates/installed-receipt.json`，记录目标版本与安装目录。

- [ ] **步骤 1：编写失败的清单测试**

使用临时目录验证确定性排序、hash 校验、拒绝绝对路径/路径穿越/大小写冲突、拒绝 reparse point，并检测未知文件或已修改文件。

- [ ] **步骤 2：运行清单测试并确认 RED**

运行：`pnpm exec vitest run apps/desktop/tests/portable-inventory.spec.ts`

- [ ] **步骤 3：实现清单生成和 after-pack 发布**

在 Harness 资源复制与验证之后扫描 `context.appOutDir`，不跟随链接。对清单自身之外的全部普通文件计算 hash，通过临时文件加 rename 最后写入清单，并把清单加入打包资源验证。

- [ ] **步骤 4：编写失败的清理测试**

验证清理等待旧进程退出且安装回执版本匹配；先删除文件再删除空目录；发现未知文件、hash 变化、reparse point、不安全根目录、回执缺失、版本不符或安装路径超出预期时保留完整根目录；用户数据目录绝不作为删除根目录枚举。

- [ ] **步骤 5：运行清理测试并确认 RED**

运行：`pnpm exec vitest run apps/desktop/tests/portable-migration.spec.ts`

- [ ] **步骤 6：实现便携版迁移与 detached helper**

TypeScript 侧在安装前验证并快照便携清单，写入只包含旧 PID、目标版本、便携根目录、清单路径、回执路径和诊断路径的请求，然后调用系统 Windows PowerShell。PowerShell helper 在删除 allowlist 文件前重新验证规范路径、reparse point、清单 hash、未知条目和安装回执。

- [ ] **步骤 7：运行聚焦测试并提交**

运行两个便携版测试，以 `feat(desktop): clean verified portable installs` 提交。

### 任务 4：桌面生命周期与 updater 集成

**文件：**
- 修改：`apps/desktop/src/main.ts`
- 修改：`apps/desktop/src/update-controller.ts`
- 修改：`apps/desktop/tests/update-controller.spec.ts`
- 修改：`apps/desktop/tests/window-lifecycle.spec.ts`
- 修改：`apps/desktop/electron-builder.yml`
- 修改：`apps/desktop/package.json`

**接口：**
- 消费 `electron-updater` 的 Electron `autoUpdater` 实现及前述控制器、IPC 与迁移模块。
- 提供唯一 `beginUpdateExit()` 路径：设置现有 quitting guard、终止 Harness、销毁窗口与托盘资源、按需启动便携版清理，然后调用 `quitAndInstall(false, true)`。

- [ ] **步骤 1：扩展更新安装生命周期测试**

验证普通托盘退出保持原行为；安装版下载完成后通过 NSIS 退出且不启动便携清理；便携版只准备一次清理；重复安装点击不重复 teardown；启动时绝不调用 `checkForUpdates()`。

- [ ] **步骤 2：运行生命周期测试并确认 RED**

运行控制器与 window lifecycle 测试，预期因 update-exit 行为缺失而失败。

- [ ] **步骤 3：接入生产 updater**

仅在 `app.whenReady()` 后实例化控制器，在 renderer 加载前注册 IPC，关闭时退订并移除 handler。更新错误只作为 Settings 安全状态展示，不成为启动错误弹窗。保留单实例、托盘、loopback 与 Harness 关闭规则。

- [ ] **步骤 4：配置更新 metadata**

增加公开 GitHub provider、`app-update.yml`、NSIS differential metadata、`build/installer.nsh` 与稳定应用身份。继续使用 `oneClick: false`、`perMachine: false` 和可选安装目录。

- [ ] **步骤 5：验证并提交**

运行桌面完整测试与 typecheck，以 `feat(desktop): integrate GitHub release updates` 提交。

### 任务 5：仅桌面端 Settings 插件

**文件：**
- 新建：`packages/client/ui-desktop-update/src/client/index.ts`
- 新建：`packages/client/ui-desktop-update/src/client/DesktopUpdateSection.tsx`
- 新建：`packages/client/ui-desktop-update/src/client/DesktopUpdateSection.module.css`
- 新建：`packages/client/ui-desktop-update/src/client/locales.ts`
- 新建：`packages/client/ui-desktop-update/src/css-modules.d.ts`
- 新建：`packages/client/ui-desktop-update/tests/apply.client.spec.ts`
- 新建：`packages/client/ui-desktop-update/tests/component.client.spec.tsx`
- 修改：`packages/client/ui-desktop-update/package.json`
- 修改：`packages/client/ui-desktop-update/tsconfig.json`
- 修改：`packages/client/ui-desktop-update/tsdown.config.ts`

**接口：**
- 注册 id 为 `app-updates`、order 为 `30` 的本地化 `settings.section`。
- 提供只连接 `window.oasisfishUpdate` 的 `DesktopUpdateStore`。
- 使用现有 `Button`、刷新/下载图标和可访问的进度、状态控件。

- [ ] **步骤 1：编写失败的注册测试**

验证 bridge 不存在时没有 section；存在时仅注册一个；插件激活或 section 注册时不调用任何 bridge 命令；dispose 完整取消订阅。

- [ ] **步骤 2：编写失败的组件测试**

覆盖中英文文案、当前/可用版本、检查/下载/安装按钮选择、进行中禁用、确定与不确定下载进度、错误重试和操作系统安装器警告。

- [ ] **步骤 3：运行 UI 测试并确认 RED**

运行：`pnpm exec vitest run packages/client/ui-desktop-update/tests`

- [ ] **步骤 4：实现 store、注册、文案与组件**

仅在 section mount 时加载状态，通过 `useSyncExternalStore` 订阅，每个命令都必须由用户触发。根据状态只显示一个主操作，布局遵循现有 Settings，卡片圆角不超过 8px，长版本号与错误必须换行且不改变控件尺寸。

- [ ] **步骤 5：运行聚焦覆盖率并提交**

运行该包测试和源文件覆盖率，以 `feat(client): add desktop update settings` 提交。

### 任务 6：Bundle 注册与 keyless assembled snapshot

**文件：**
- 修改：`packages/bundle/web-app/cordis.patch.yml`
- 修改：`packages/bundle/web-app/package.json`
- 新建：`apps/web/tests/desktop-update.snapshot.ts`
- 新建：`apps/web/tests/snapshots/desktop-update/browser-no-bridge.txt`
- 新建：`apps/web/tests/snapshots/desktop-update/desktop-available.txt`
- 新建：`apps/web/tests/snapshots/desktop-update/desktop-downloading.txt`

**接口：**
- Web bundle 总是加载插件模块，但 `window.oasisfishUpdate` 不存在时插件不贡献任何 UI。
- Snapshot 在启动前注入确定性测试 bridge，只记录命令，不访问网络或安装器。

- [ ] **步骤 1：增加 bundle row 并编写失败的 snapshot 场景**

把 `ui-desktop-update` 放在其他 Settings 插件附近。先证明普通浏览器不存在“应用更新”导航；再注入 `available` 与 `downloading` 状态，打开 Settings、触发用户命令并捕获稳定文本。

- [ ] **步骤 2：运行 assembled 测试并确认 RED**

运行：`pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/desktop-update.snapshot.ts`

- [ ] **步骤 3：录制并审阅 keyless snapshots**

只为该文件运行 snapshot record，检查三个输出没有路径、token、机器文本或普通浏览器误显 UI，然后以 replay 再运行。

- [ ] **步骤 4：验证 bundle 解析并提交**

运行 `pnpm run verify-cordis-config` 与 snapshot replay，以 `feat(bundle): enable desktop update settings` 提交。

### 任务 7：Release 约定与 GitHub 发布工作流

**文件：**
- 新建：`apps/desktop/scripts/validate-release-tag.mjs`
- 新建：`apps/desktop/tests/release-contract.spec.ts`
- 新建：`.github/workflows/oasisfish-release.yml`
- 修改：`apps/desktop/package.json`
- 修改：`apps/desktop/electron-builder.yml`

**接口：**
- `validateReleaseTag(tag, version)` 强制标签严格等于 `v${version}`。
- Windows x64 工作流向匹配的公开 GitHub Release 发布安装包、block map 与 `latest.yml`。

- [ ] **步骤 1：编写失败的 Release 约定测试**

覆盖匹配稳定版、匹配 prerelease、缺少 `v`、版本不符与空标签；并静态验证工作流具有 `contents: write`、frozen pnpm 安装、Windows runner、精确标签校验、选定测试、NSIS publish，且不含 `.env`、模型 secret 名或 `GITHUB_TOKEN`/`GH_TOKEN` 之外的 secret。

- [ ] **步骤 2：运行测试并确认 RED**

运行：`pnpm exec vitest run apps/desktop/tests/release-contract.spec.ts`

- [ ] **步骤 3：实现标签校验与工作流**

由 `v*` 标签和带明确现有标签输入的 `workflow_dispatch` 触发。检出标签，安装 pnpm 与 Node 24，运行 frozen install、版本校验、聚焦桌面/客户端/snapshot/文档检查，再用 `electron-builder --publish always` 构建，只把 `${{ secrets.GITHUB_TOKEN }}` 作为 `GH_TOKEN`。

- [ ] **步骤 4：在不发布时验证 Release 产物**

本地关闭 publish 构建，要求输出安装包、`.blockmap` 与 `latest.yml`，并检查 metadata 中的公开仓库与版本。

- [ ] **步骤 5：运行测试并提交**

以 `ci(desktop): publish Oasisfish releases` 提交。

### 任务 8：文档、安装升级 smoke 与最终证据

**文件：**
- 修改：`apps/desktop/README.md`
- 修改：`apps/desktop/README.zh.md`
- 修改：`apps/desktop/README.i18n.yaml`
- 修改：`docs/superpowers/specs/2026-08-26-windows-desktop-app-design.md`
- 修改：`docs/superpowers/specs/2026-08-26-windows-desktop-app-design.zh.md`
- 修改：`docs/superpowers/specs/2026-08-26-windows-desktop-app-design.i18n.yaml`
- 移动：`.agents/notes/proposed/feature/2026-09-06-oasisfish-github-release-updates.*` 到 `.agents/notes/implemented/feature/`
- 新建：`apps/desktop/scripts/smoke-upgrade.ps1`
- 新建：`apps/desktop/tests/smoke-upgrade.spec.ts`
- 修改：`apps/desktop/tests/smoke-unpacked.spec.ts`
- 修改：`apps/desktop/scripts/smoke-unpacked.mjs`

**接口：**
- 文档覆盖手动更新、Release/tag 流程、便携版迁移、用户数据保留、诊断、未签名安装器警告和失败恢复。
- Windows smoke 安装版本 N，在 `%APPDATA%\DeepSeek Harness` 写入字节 fixture，升级到 N+1，验证旧注册版本被替换且 fixture 不变。

- [ ] **步骤 1：编写失败的打包与升级 smoke 断言**

扩展 unpacked smoke，要求 preload、`app-update.yml`、便携清单、清理 helper 且没有 reparse point。升级 smoke 在缺少双版本 fixture 时拒绝，并验证回执、版本、用户数据 invariant，全程不使用模型凭据。

- [ ] **步骤 2：运行 smoke 测试并确认 RED**

运行两个 smoke 测试，预期在打包 metadata 与 fixture 参数尚不存在时失败。

- [ ] **步骤 3：更新文档与 implemented 决策记录**

把旧设计中“自动更新仍是未来 Release 流水线事项”的表述替换为更新设计链接。说明只 push 源码不会通知客户端，必须发布匹配标签；用户数据继续位于 `%APPDATA%\DeepSeek Harness`；保守清理可能保留便携目录供手动删除。把 Agent Note 移到 `implemented`，将提案/未来时改为当前事实，并仅在验证运行后记录实际证据。

- [ ] **步骤 4：构建并运行打包证据**

先运行一次仓库 build，再运行桌面 stage、`package:dir` 与 `smoke:unpacked`。为避免 `EBUSY`，把两个本地版本构建到不同输出目录，运行 `smoke-upgrade.ps1`，卸载测试安装，但在记录 hash 前不删除保留的用户数据 fixture。

- [ ] **步骤 5：运行最终最小检查集**

运行：

```sh
pnpm exec vitest run apps/desktop/tests
pnpm exec vitest run packages/client/ui-desktop-update/tests
pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/desktop-update.snapshot.ts
pnpm --filter @deepseek-ai/dsh-desktop run typecheck
pnpm run build
pnpm run hygiene
pnpm run doc-sync
git diff --check
```

对比 `oasisfish/main` 审阅完整 diff，确认没有 `vendor/`、`.env`、凭据、生成的用户数据、本地缓存或 Release 二进制进入暂存，并对 tracked additions 做 secret pattern 扫描。

- [ ] **步骤 6：提交、推送并验证远端**

以 `feat(desktop): ship GitHub release updates` 提交并推送 `codex/desktop-auto-update`，验证远端 SHA 与本地 `HEAD` 相同，检查 GitHub checks。在明确选择版本升级与匹配标签之前不创建真实 Release；第一次线上发布属于本实现审阅通过后的独立发行操作。
