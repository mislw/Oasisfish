# 桌面端 Wallpaper Engine 集成实现计划

[English](2026-09-22-desktop-wallpaper-engine-integration.md) | 中文

> **面向智能体执行者：** 必须使用子技能：用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐项实现本计划。步骤使用复选框（`- [ ]`）跟踪。

**目标：** 将 `dsh-plugin-wallpaper-engine@0.7.5` 作为单一官方桌面应用中默认启用的功能发布，在上游设置对象存在前提示用户完成设置，并在后续启动时恢复已保存的壁纸状态。

**架构：** 一个第一方桌面 Bundle 在同一个插件管理器开关后插入固定版本的上游 Host/Client 行和第一方引导 Client 行。桌面 Profile 准备过程通过带版本的应用自有记录仅提供该 Bundle 一次，而原生恢复操作恢复普通 Web Bundle，因此恢复后壁纸功能会继续保持禁用。

**技术栈：** TypeScript ESM、Cordis Bundle patch 与 Client slot、React 18、类型化 locale 字典、Vitest 与 Testing Library、桌面 Profile manifest、原子 JSON 写入、pnpm patched dependencies、Loader smoke 测试、Electron 桌面打包、Playwright GIF 录制。

**设计规范：** `docs/superpowers/specs/2026-09-22-desktop-wallpaper-engine-integration-design.zh.md`

## 全局约束

- 产品只有一个官方桌面构建；不得增加第二个产品变体、启动器、Profile 名称或发布产物。
- 外部实现版本必须精确为 `dsh-plugin-wallpaper-engine@0.7.5`；lockfile 和 patch 键必须保持精确版本。
- 新增的第一方包是 `@deepseek-ai/dsh-desktop-wallpaper-engine` 和 `@deepseek-ai/dsh-client-ui-wallpaper-engine-onboarding`。
- 普通 Web、Headless、SDK、SDK Minimal 和 ACP Profile 的默认值必须保持不变。
- 原生恢复必须恢复 `PROFILE_TEMPLATES.web.bundles`，而不是桌面默认列表。
- 缺少上游设置对象（`settings: null`）表示需要设置；任何设置对象（包括空选择）都表示设置已完成。
- 探测失败和无效响应必须只记录一条有界诊断、不显示壁纸提示、完成当前进程内步骤，并让普通设置页面保持可访问。
- 主操作必须先调用 `complete()`，再调用 `openSection('wallpaper-engine')`。
- 上游配置继续位于 `~/.dsh-wallpaper-engine/config.json`；桌面端不得把壁纸选择镜像到另一个存储。
- 上游样式所有者必须是 `data-plugin="dsh-plugin-wallpaper-engine"`，使 Client dispose 和 HMR 能随模块移除样式。
- 新增的 DSH 自有 UI 文案必须位于类型化英文和简体中文字典中。
- 每个包变更必须在同一任务中更新英文和中文 README、JSDoc、Model Experience、Known Limitations 与翻译配对记录。
- 不得编辑或还原工作树中无关的脏改动；每个任务只暂存并提交该任务列出的文件。
- 面向产品用户的变更必须录制真实桌面服务器和设置流程的 GIF。

---

## 文件结构

### 新桌面 Bundle

- `packages/bundle/desktop-wallpaper-engine/package.json`：声明 Bundle patch、精确上游依赖、引导依赖、peer dependency 和发布文件。
- `packages/bundle/desktop-wallpaper-engine/cordis.patch.yml`：插入一条上游行和一条引导行。
- `packages/bundle/desktop-wallpaper-engine/src/index.ts`：供包工具使用、带文档的空操作 Bundle 入口。
- `packages/bundle/desktop-wallpaper-engine/tests/desktop-wallpaper-engine.spec.ts`：验证 patch 组合、真实依赖解析、行释放和修补后的样式所有者。
- `packages/bundle/desktop-wallpaper-engine/{README.md,README.zh.md,README.i18n.yaml}`：package-bundle 用法、所有权、限制与验证说明。

### 新引导 Client

- `packages/client/ui-wallpaper-engine-onboarding/src/client/probe.ts`：校验 `GET /wallpaper-engine/settings` 并返回封闭的 readiness 联合类型。
- `packages/client/ui-wallpaper-engine-onboarding/src/client/WallpaperOnboarding.tsx`：仅在 `settings: null` 时显示设置提示，并保证先完成引导再导航到设置。
- `packages/client/ui-wallpaper-engine-onboarding/src/client/index.ts`：注册 locale 字典和一个 `settings.onboarding` 条目。
- `packages/client/ui-wallpaper-engine-onboarding/src/client/locales.ts`：类型化英文和简体中文文案。
- `packages/client/ui-wallpaper-engine-onboarding/src/client/WallpaperOnboarding.module.css`：使用现有 UI primitive 的紧凑弹窗布局。
- `packages/client/ui-wallpaper-engine-onboarding/src/{index.ts,css-modules.d.ts}` 和构建配置：标准 Client 包导出。
- `packages/client/ui-wallpaper-engine-onboarding/tests/*.client.spec.tsx`：探测、渲染、操作顺序、locale、注册和释放测试。
- `packages/client/ui-wallpaper-engine-onboarding/{README.md,README.zh.md,README.i18n.yaml}`：package-reference 文档。

### 上游版本固定与兼容修补

- `patches/dsh-plugin-wallpaper-engine@0.7.5.patch`：只把已构建 Client 的样式所有权标签从 `dsh-wallpaper-engine` 改为 `dsh-plugin-wallpaper-engine`。
- `pnpm-workspace.yaml`：注册精确版本的 patched dependency。
- `pnpm-lock.yaml`：记录 `0.7.5`、完整性、传递依赖和 patch 哈希。

### 桌面组合与迁移

- `apps/desktop/src/project-manager.ts`：拥有桌面默认 Bundle、解析带版本的提供记录、执行持锁的一次性提供，并让恢复继续使用普通 Web Bundle。
- `apps/desktop/tests/project-manager.spec.ts`：覆盖新 Profile、现有 Profile、一次性提供、用户禁用、恢复、损坏状态和原子写入。
- `apps/desktop/tests/project-metadata.spec.ts`：验证开发和运行时构建 manifest 包含桌面 Bundle，而普通 Profile 模板不变。
- `apps/desktop-host/package.json`：把第一方 wrapper 带入已签名桌面运行时闭包。
- `apps/desktop/scripts/prepare-dsh.ts`、`apps/desktop/tests/prepare-package-set.spec.ts` 和运行时内容测试：把同一个 pnpm patch 带入临时生产安装、选择第一方闭包，并在最终运行时中验证修补后的外部包及其传递依赖。
- `apps/desktop/tests/installed-update-package-content.spec.ts`：验证已安装桌面资源离线包含完整壁纸闭包。

### 集成证据与文档

- `apps/desktop/tests/wallpaper-engine.loader.spec.ts`：启动真实桌面 Profile，验证路由、slot、已保存设置重启行为和样式清理。
- `apps/desktop/tests/wallpaper-engine.overlay.yml`：为 Loader smoke 隔离文件系统路径并提供确定性的 fixture 设置。
- `apps/desktop/tests/gifs/desktop-wallpaper-engine-settings.gif`：真实服务器首次设置和设置导航证据。
- `apps/desktop/{README.md,README.zh.md,README.i18n.yaml}`：官方桌面默认值、首次使用、自动恢复、恢复操作和精确上游限制。
- `packages/bundle/{README.md,README.zh.md,README.i18n.yaml}` 和 `packages/client/{README.md,README.zh.md,README.i18n.yaml}`：把两个新包加入各自所有者索引。

---

### 任务 1：固定并修补上游包

**文件：**
- 新建：`patches/dsh-plugin-wallpaper-engine@0.7.5.patch`
- 修改：`pnpm-workspace.yaml`
- 修改：`pnpm-lock.yaml`
- 测试：`packages/bundle/desktop-wallpaper-engine/tests/desktop-wallpaper-engine.spec.ts`

**接口：**
- 消费：版本 `0.7.5` 上游包的 `.`, `./client`, `./cordis.patch.yml` 和 `./package.json` 导出。
- 产出：样式元素带有 `data-plugin="dsh-plugin-wallpaper-engine"` 的已安装 Client bundle；除 pnpm patch 元数据外，其余字节与已审查版本一致。

- [ ] **步骤 1：编写失败的兼容性测试**

创建 Bundle 测试文件，读取实际解析到的已安装 `lib/client.js` 并要求模块所有权标签：

```ts
const client = readFileSync(require.resolve('dsh-plugin-wallpaper-engine/client'), 'utf8')
expect(client).toContain('tag.dataset.plugin = "dsh-plugin-wallpaper-engine"')
expect(client).not.toContain('tag.dataset.plugin = "dsh-wallpaper-engine"')
```

- [ ] **步骤 2：运行聚焦测试并确认上游不匹配**

运行：`pnpm exec vitest run packages/bundle/desktop-wallpaper-engine/tests/desktop-wallpaper-engine.spec.ts`

预期：FAIL，因为未修补的 `0.7.5` Bundle 写入 `dsh-wallpaper-engine`。

- [ ] **步骤 3：加入精确依赖和窄范围 patch**

加入以下 workspace 条目，并通过 pnpm 生成 patch，使 patch 作用于已发布的构建文件：

```yaml
patchedDependencies:
  'dsh-plugin-wallpaper-engine@0.7.5': patches/dsh-plugin-wallpaper-engine@0.7.5.patch
```

该 patch 只修改 `lib/client.js` 中这一行：

```diff
-  tag.dataset.plugin = "dsh-wallpaper-engine";
+  tag.dataset.plugin = "dsh-plugin-wallpaper-engine";
```

- [ ] **步骤 4：安装并运行上游验证**

运行：`pnpm install`

运行：`pnpm --dir C:/Users/Administrator/AppData/Local/Temp/dsh-wallpaper-engine-review run verify`

运行：`node C:/Users/Administrator/AppData/Local/Temp/dsh-wallpaper-engine-review/scripts/verify-scene.mjs`

预期：安装成功、上游 verify 成功，并且 13 个 scene 测试全部通过。

- [ ] **步骤 5：提交上游版本固定**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml patches/dsh-plugin-wallpaper-engine@0.7.5.patch packages/bundle/desktop-wallpaper-engine/tests/desktop-wallpaper-engine.spec.ts
git commit -m "build(desktop): pin wallpaper engine plugin"
```

### 任务 2：构建本地化引导 Client

**文件：**
- 新建：`packages/client/ui-wallpaper-engine-onboarding/package.json`
- 新建：`packages/client/ui-wallpaper-engine-onboarding/tsconfig.json`
- 新建：`packages/client/ui-wallpaper-engine-onboarding/tsdown.config.ts`
- 新建：`packages/client/ui-wallpaper-engine-onboarding/src/index.ts`
- 新建：`packages/client/ui-wallpaper-engine-onboarding/src/css-modules.d.ts`
- 新建：`packages/client/ui-wallpaper-engine-onboarding/src/client/probe.ts`
- 新建：`packages/client/ui-wallpaper-engine-onboarding/src/client/locales.ts`
- 新建：`packages/client/ui-wallpaper-engine-onboarding/src/client/WallpaperOnboarding.tsx`
- 新建：`packages/client/ui-wallpaper-engine-onboarding/src/client/WallpaperOnboarding.module.css`
- 新建：`packages/client/ui-wallpaper-engine-onboarding/src/client/index.ts`
- 新建：`packages/client/ui-wallpaper-engine-onboarding/tests/probe.client.spec.ts`
- 新建：`packages/client/ui-wallpaper-engine-onboarding/tests/onboarding.client.spec.tsx`
- 新建：`packages/client/ui-wallpaper-engine-onboarding/tests/apply.client.spec.ts`
- 新建：`packages/client/ui-wallpaper-engine-onboarding/{README.md,README.zh.md,README.i18n.yaml}`

**接口：**
- 消费：`PropsRuntime<'settings.onboarding'>`、`InjectFace<T>`、`ctx.locale`、`ctx.slots`、浏览器 `fetch` 实现和上游 `GET /wallpaper-engine/settings` 响应。
- 产出：`probeWallpaperSettings(fetcher): Promise<WallpaperSettingsReadiness>`，其中联合类型为 `{ kind: 'setup-required' } | { kind: 'configured' } | { kind: 'unavailable'; diagnostic: string }`，以及 id 为 `wallpaper-engine-setup`、order 为 `100` 的一个引导行。

- [ ] **步骤 1：编写失败的探测测试**

覆盖以下精确情况：`{ settings: null }`、`{ settings: {} }`、`{ settings: { id: '' } }`、非 2xx 响应、损坏 JSON、缺少 `settings`、数组 settings、fetch 抛错，以及 dispose 期间一次被中止的请求。

```ts
await expect(probeWallpaperSettings(fetcher({ settings: null }))).resolves.toEqual({ kind: 'setup-required' })
await expect(probeWallpaperSettings(fetcher({ settings: {} }))).resolves.toEqual({ kind: 'configured' })
await expect(probeWallpaperSettings(fetcher({ settings: { id: '' } }))).resolves.toEqual({ kind: 'configured' })
```

- [ ] **步骤 2：运行探测测试并验证缺失模块失败**

运行：`pnpm exec vitest run packages/client/ui-wallpaper-engine-onboarding/tests/probe.client.spec.ts`

预期：FAIL，因为 `probe.ts` 不存在。

- [ ] **步骤 3：实现封闭的 readiness 解析器**

使用带 `AbortSignal` 的 `GET /wallpaper-engine/settings`。只接受 JSON 对象，并要求其自有 `settings` 属性值为 `null` 或非数组对象。把每种失败转换为一条有界诊断字符串，该字符串包含路由和失败类别，但不包含响应正文或用户路径。

```ts
export type WallpaperSettingsReadiness =
  | { readonly kind: 'setup-required' }
  | { readonly kind: 'configured' }
  | { readonly kind: 'unavailable'; readonly diagnostic: string }
```

- [ ] **步骤 4：编写失败的组件和注册测试**

断言 loading 不渲染内容；configured 和 unavailable 都只调用一次 `complete()` 且不渲染内容；unavailable 只记录一次日志；setup-required 渲染本地化标题、正文和主按钮；点击按钮记录 `['complete', 'open:wallpaper-engine']`；fiber dispose 后注册消失；locale 变化会以最新文案重新注册。

- [ ] **步骤 5：实现组件和 Client 注册**

使用 `@deepseek-ai/dsh-client-ui-primitives` 的 `Modal`，显示期间保持 `#root` inert，聚焦标题，并且只提供一个主操作。在 `settings.wallpaper-engine-onboarding` 命名空间下注册类型化字典，并注入探测闭包和 `ctx.logger.warn`。

```ts
const openSettings = (): void => {
  complete()
  openSection('wallpaper-engine')
}
```

- [ ] **步骤 6：运行包测试和 Client gate**

运行：`pnpm exec vitest run packages/client/ui-wallpaper-engine-onboarding`

运行：`pnpm run verify-client-ui-i18n`

运行：`pnpm run verify-client-packages`

运行：`pnpm run verify-export-jsdoc`

预期：全部命令通过，探测失败测试观察到恰好一条 warning。

- [ ] **步骤 7：配对文档并提交**

运行：`pnpm run verify-translation-pairing --write packages/client/ui-wallpaper-engine-onboarding/README.md`

```bash
git add packages/client/ui-wallpaper-engine-onboarding packages/client/README.md packages/client/README.zh.md packages/client/README.i18n.yaml
git commit -m "feat(client): add wallpaper setup onboarding"
```

### 任务 3：加入桌面 Wrapper Bundle

**文件：**
- 新建：`packages/bundle/desktop-wallpaper-engine/package.json`
- 新建：`packages/bundle/desktop-wallpaper-engine/tsconfig.json`
- 新建：`packages/bundle/desktop-wallpaper-engine/src/index.ts`
- 新建：`packages/bundle/desktop-wallpaper-engine/cordis.patch.yml`
- 完成：`packages/bundle/desktop-wallpaper-engine/tests/desktop-wallpaper-engine.spec.ts`
- 新建：`packages/bundle/desktop-wallpaper-engine/{README.md,README.zh.md,README.i18n.yaml}`
- 修改：`packages/bundle/{README.md,README.zh.md,README.i18n.yaml}`

**接口：**
- 消费：`dsh-plugin-wallpaper-engine@0.7.5` 和 `@deepseek-ai/dsh-client-ui-wallpaper-engine-onboarding`。
- 产出：Bundle 包 `@deepseek-ai/dsh-desktop-wallpaper-engine`，其 patch 恰好插入一次 id 为 `desktop-wallpaper-engine` 和 `ui-wallpaper-engine-onboarding` 的行。

- [ ] **步骤 1：扩展失败的 Bundle 测试**

通过 `bundleRoster([...WEB_PROFILE_BUNDLES, '@deepseek-ai/dsh-desktop-wallpaper-engine'])` 解析真实 patch，并断言两条新行、包解析、确定性顺序、`WEB_PROFILE_BUNDLES` 未变化，以及 Bundle fiber dispose 后行被移除。

- [ ] **步骤 2：运行 Bundle 测试并验证解析失败**

运行：`pnpm exec vitest run packages/bundle/desktop-wallpaper-engine/tests/desktop-wallpaper-engine.spec.ts`

预期：FAIL，因为 wrapper 包和 patch 不存在。

- [ ] **步骤 3：加入 Bundle manifest 和 patch**

manifest 声明 `dsh.bundle.patch`、精确依赖 `"dsh-plugin-wallpaper-engine": "0.7.5"`、对引导包的 workspace dependency，以及普通 Cordis peer/dev dependency。patch 内容严格为：

```yaml
- insert:
    - id: desktop-wallpaper-engine
      name: 'dsh-plugin-wallpaper-engine'

    - id: ui-wallpaper-engine-onboarding
      name: '@deepseek-ai/dsh-client-ui-wallpaper-engine-onboarding'
```

- [ ] **步骤 4：运行 Bundle 和文档检查**

运行：`pnpm exec vitest run packages/bundle/desktop-wallpaper-engine/tests/desktop-wallpaper-engine.spec.ts`

运行：`pnpm run verify-cordis-config`

运行：`pnpm run verify-runtime-closure`

运行：`pnpm run verify-translation-pairing --write packages/bundle/desktop-wallpaper-engine/README.md`

预期：全部命令通过；普通 Web roster 逐字节保持不变。

- [ ] **步骤 5：提交 Wrapper Bundle**

```bash
git add packages/bundle/desktop-wallpaper-engine packages/bundle/README.md packages/bundle/README.zh.md packages/bundle/README.i18n.yaml
git commit -m "feat(desktop): add wallpaper engine bundle"
```

### 任务 4：仅提供一次桌面 Bundle

**文件：**
- 修改：`apps/desktop/src/project-manager.ts`
- 修改：`apps/desktop/tests/project-manager.spec.ts`
- 新建或修改：`apps/desktop/tests/project-metadata.spec.ts`
- 修改：`apps/desktop/package.json`

**接口：**
- 消费：`PROFILE_TEMPLATES.web.bundles`、`readProfileManifest`，以及在 `DesktopProjectManager.withLock()` 拥有 Profile 事务期间使用的 `@deepseek-ai/dsh-atomic-write` 中 `writeFileAtomic`。
- 产出：`DESKTOP_WALLPAPER_BUNDLE`、`DESKTOP_PROFILE_DEFAULT_BUNDLES`、`DesktopDefaultBundleState`、`parseDesktopDefaultBundleState(value)` 和 `offerDesktopDefaultBundles(projectDir, defaults)`。

- [ ] **步骤 1：编写失败的迁移测试**

加入新 Profile、没有 wrapper 的现有 Profile、重复应用发布、用户禁用 wrapper、原生恢复、缺失状态、损坏 JSON、错误 schema version、重复 offered bundle、非字符串条目，以及原子写入器拒绝时没有部分更新文件的测试。

```ts
expect(manifest.dsh.profile.bundles).toEqual([...PROFILE_TEMPLATES.web.bundles, DESKTOP_WALLPAPER_BUNDLE])
expect(state).toEqual({ schemaVersion: 1, offeredBundles: [DESKTOP_WALLPAPER_BUNDLE] })
```

- [ ] **步骤 2：运行桌面项目测试并验证旧默认值失败**

运行：`pnpm exec vitest run apps/desktop/tests/project-manager.spec.ts apps/desktop/tests/project-metadata.spec.ts`

预期：FAIL，因为 Profile 只包含普通 Web Bundle 且不存在提供记录。

- [ ] **步骤 3：实现带版本的提供记录**

使用内容精确如下的 `desktop-default-bundles.json`：

```ts
export interface DesktopDefaultBundleState {
  readonly schemaVersion: 1
  readonly offeredBundles: readonly string[]
}
```

`createPluginProfile()` 使用 `DESKTOP_PROFILE_DEFAULT_BUNDLES` 初始化新 Profile。随后 `applyRelease()` 在现有锁内提供尚未记录的默认项，只追加不存在的 Bundle，先原子写入 manifest 再写入状态记录，并在现有状态无效时拒绝执行而不重写任一文件。把 `@deepseek-ai/dsh-atomic-write` 加入已打包 Electron 主进程使用的桌面包依赖。

- [ ] **步骤 4：保持恢复语义**

让 `disableAllPlugins()` 继续调用 `sanitizeProfile('dsh', profile, WEB_PROFILE.bundles)`。加入回归测试，确认恢复会移除 wrapper、保留 `desktop-default-bundles.json`，且后续 `applyRelease()` 不会重新启用它。

- [ ] **步骤 5：更新开发和运行时元数据**

把 `createDevelopmentProjectMetadata()` 和 `createRuntimeProjectMetadata()` 改为使用 `DESKTOP_PROFILE_DEFAULT_BUNDLES`。断言普通 `PROFILE_TEMPLATES.web.bundles` 值和 `web` CLI Profile 保持不变。

- [ ] **步骤 6：运行聚焦桌面检查并提交**

运行：`pnpm exec vitest run apps/desktop/tests/project-manager.spec.ts apps/desktop/tests/project-metadata.spec.ts apps/desktop/tests/main-startup.spec.ts`

运行：`pnpm run typecheck`

预期：聚焦测试和 typecheck 通过。

```bash
git add apps/desktop/src/project-manager.ts apps/desktop/tests/project-manager.spec.ts apps/desktop/tests/project-metadata.spec.ts apps/desktop/package.json
git commit -m "feat(desktop): offer wallpaper bundle once"
```

### 任务 5：把完整 Bundle 带入已签名运行时

**文件：**
- 修改：`apps/desktop-host/package.json`
- 修改：`apps/desktop/scripts/prepare-dsh.ts`
- 修改：`apps/desktop/tests/prepare-package-set.spec.ts`
- 修改：`apps/desktop/tests/installed-update-package-content.spec.ts`
- 修改：`apps/desktop/tests/desktop-package-environment.spec.ts`

**接口：**
- 消费：以 `@deepseek-ai/dsh` 和 `@deepseek-ai/dsh-desktop-host` 为根的包闭包。
- 产出：wrapper 和引导包的已签名本地 tarball，以及在复制 `dsh-plugin-wallpaper-engine@0.7.5`、`jpeg-js` 和 `@shaderfrog/glsl-parser` 到签名资源前应用 `patches/dsh-plugin-wallpaper-engine@0.7.5.patch` 的临时生产安装。

- [ ] **步骤 1：编写失败的闭包和产物测试**

断言 Desktop Host 依赖 wrapper，闭包选择包含两个第一方包，临时运行时 workspace 指定精确 patch 文件，其 lockfile 记录 patch 哈希，并且已安装资源无需在应用启动时访问 registry 即可把 `dsh-plugin-wallpaper-engine/package.json` 解析为版本 `0.7.5`。

- [ ] **步骤 2：运行打包测试并验证闭包缺失**

运行：`pnpm exec vitest run apps/desktop/tests/prepare-package-set.spec.ts apps/desktop/tests/installed-update-package-content.spec.ts apps/desktop/tests/desktop-package-environment.spec.ts`

预期：FAIL，因为 Desktop Host 尚未把 wrapper 拉入发布闭包。

- [ ] **步骤 3：加入 Host 依赖和打包断言**

向 `apps/desktop-host/package.json` 加入 `"@deepseek-ai/dsh-desktop-wallpaper-engine": "workspace:^"`。让 `selectDesktopPackageClosure()` 继续只负责 workspace tarball。在 `prepare-dsh.ts` 中，在第一个 pnpm 命令前把已审查 patch 复制进临时构建根目录，并让运行时项目元数据输出精确的 `patchedDependencies` 条目；在生产安装前验证生成的 lockfile 包含 patch 哈希。

- [ ] **步骤 4：构建并 smoke 准备后的运行时**

运行：`pnpm --filter @deepseek-ai/dsh-desktop-host run build`

运行：`pnpm --filter @deepseek-ai/dsh-desktop run prepare:packages`

运行：`pnpm --filter @deepseek-ai/dsh-desktop run smoke:runtime`

预期：准备后的运行时从应用资源解析 wrapper、引导 Client、上游 Host/Client 和两个上游运行时依赖。

- [ ] **步骤 5：提交已签名运行时闭包**

```bash
git add apps/desktop-host/package.json apps/desktop/scripts/prepare-dsh.ts apps/desktop/tests/prepare-package-set.spec.ts apps/desktop/tests/installed-update-package-content.spec.ts apps/desktop/tests/desktop-package-environment.spec.ts
git commit -m "build(desktop): package wallpaper engine runtime"
```

### 任务 6：验证真实启动、重启和恢复

**文件：**
- 新建：`apps/desktop/tests/wallpaper-engine.loader.spec.ts`
- 新建：`apps/desktop/tests/wallpaper-engine.overlay.yml`
- 修改：`apps/desktop/tests/main-startup.spec.ts`

**接口：**
- 消费：真实桌面 Bundle 列表、Loader smoke harness、上游 inventory/settings 路由、Client slot ledger 和临时 `DSH_HOME`。
- 产出：一个无密钥集成场景，证明首次引导注册、保存设置后重启抑制、壁纸恢复、样式清理和恢复启动。

- [ ] **步骤 1：编写失败的 Loader smoke**

在临时 home 上启动桌面 Profile，并断言 `GET /wallpaper-engine/settings` 返回 `{ settings: null }`、`GET /wallpaper-engine/inventory` 成功、`settings.section` 包含 `wallpaper-engine`，且 `settings.onboarding` 包含 `wallpaper-engine-setup`。

- [ ] **步骤 2：把 smoke 扩展到 Host 重启**

通过上游 `PUT /wallpaper-engine/settings` 写入最小有效设置对象，停止 Host，使用同一个临时 home 重启，并断言 GET 响应是已保存对象且引导在不显示弹窗时完成。使用确定性的上传 fixture 或上游支持的空选择，使测试不依赖本地 Steam 安装。

- [ ] **步骤 3：验证 Client 清理和原生恢复**

挂载 Client，断言恰好一个样式标签带有 `data-plugin="dsh-plugin-wallpaper-engine"`，dispose 或禁用 wrapper 后断言该标签和两条 slot 行消失。运行原生恢复，证明下次 Host 启动可以在没有壁纸路由的情况下成功，并且上游配置文件保持不变。

- [ ] **步骤 4：运行真实集成检查**

运行：`pnpm exec vitest run apps/desktop/tests/wallpaper-engine.loader.spec.ts apps/desktop/tests/main-startup.spec.ts`

运行：`pnpm run build`

预期：Loader 场景和官方构建无需安装 Wallpaper Engine 即可通过。

- [ ] **步骤 5：提交启动覆盖**

```bash
git add apps/desktop/tests/wallpaper-engine.loader.spec.ts apps/desktop/tests/wallpaper-engine.overlay.yml apps/desktop/tests/main-startup.spec.ts
git commit -m "test(desktop): cover wallpaper startup and recovery"
```

### 任务 7：记录产品流程并编写文档

**文件：**
- 修改：`apps/desktop/{README.md,README.zh.md,README.i18n.yaml}`
- 修改：`packages/bundle/{README.md,README.zh.md,README.i18n.yaml}`
- 修改：`packages/client/{README.md,README.zh.md,README.i18n.yaml}`
- 新建：`apps/desktop/tests/gifs/desktop-wallpaper-engine-settings.gif`

**接口：**
- 消费：任务 1-6 验证过的行为和命令。
- 产出：描述当前状态的配对文档，以及展示首次提示打开上游设置页面的真实服务器 GUI 产物。

- [ ] **步骤 1：更新配对文档**

记录官方桌面应用默认启用 wrapper、只在任意上游设置对象存在前提示、重启时恢复保存状态、把上游数据存放在 `~/.dsh-wallpaper-engine`，并且原生恢复能让 wrapper 保持禁用。说明上游中英混合文案和平台发现行为仍是上游所有的限制。

- [ ] **步骤 2：重新记录每个变更配对**

为每份变更的英文文档运行 pairing writer，包括两个新包 README 和三个所有者索引。

运行：`pnpm run verify-translation-pairing`

预期：所有变更配对和链接通过。

- [ ] **步骤 3：启动真实桌面服务器**

仅在浏览器预检时运行 `pnpm dsh web --patch apps/web/tests/pin-browse-picker.overlay.yml`，随后使用干净的临时 `DSH_HOME` 和真实壁纸 Bundle 启动官方桌面开发命令。记录实际 URL，并在录制期间保持进程运行。

- [ ] **步骤 4：录制并优化必需 GIF**

针对真实服务器使用 `record-browser-gif` skill。录制：首次提示可见、点击主操作、选中 Wallpaper Engine 页面、保存空配置或 fixture 壁纸配置、重启桌面端，以及提示不再出现。把优化后的 GIF 保存到 `apps/desktop/tests/gifs/desktop-wallpaper-engine-settings.gif`，并验证桌面和移动画面没有重叠或裁切文案。

- [ ] **步骤 5：运行 pre-push 选择**

调用 `dsh-pre-push-checks`，然后只运行它为最终 diff 选择的命令。最低预期集合是聚焦包测试、桌面项目/打包/Loader 测试、`typecheck`、`verify-client-ui-i18n`、`verify-cordis-config`、`verify-runtime-closure`、`test:docs`、`doc-sync` 和 `git diff --check`。

- [ ] **步骤 6：审查完整 diff 并提交**

确认未暂存无关脏文件，没有凭据或本地 Wallpaper Engine 路径，lockfile 选择 `0.7.5`，并且普通非桌面 Profile 默认值不变。

```bash
git add apps/desktop/README.md apps/desktop/README.zh.md apps/desktop/README.i18n.yaml packages/bundle/README.md packages/bundle/README.zh.md packages/bundle/README.i18n.yaml packages/client/README.md packages/client/README.zh.md packages/client/README.i18n.yaml apps/desktop/tests/gifs/desktop-wallpaper-engine-settings.gif
git commit -m "docs(desktop): document wallpaper engine setup"
```

---

## 最终验收

- [ ] 干净的官方桌面 Profile 启动时已启用 `@deepseek-ai/dsh-desktop-wallpaper-engine`，且无需运行时安装包。
- [ ] 现有 Profile 只接收一次 wrapper；之后插件管理器禁用和原生恢复会在每次重启后继续保留。
- [ ] `settings: null` 显示本地化引导，而 `{}`、`{ id: '' }` 和任何其他设置对象都会抑制引导。
- [ ] 主操作先完成引导，再打开 `wallpaper-engine` 设置。
- [ ] 保存的配置在 Host 和桌面端重启后继续存在，并由上游 Client 自动恢复。
- [ ] 恢复操作使用普通 Web Bundle 启动，不包含壁纸路由或 Client 行，并保留上游配置文件。
- [ ] 已签名运行时离线解析精确固定版本的包及其运行时依赖。
- [ ] 普通 Web、Headless、SDK、SDK Minimal 和 ACP 默认值保持不变。
- [ ] 聚焦测试、选定仓库 gate、配对文档和真实服务器 GIF 全部通过审查。
