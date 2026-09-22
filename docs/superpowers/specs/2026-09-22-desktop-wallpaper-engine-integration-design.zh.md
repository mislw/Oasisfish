# Desktop Wallpaper Engine 集成设计

[English](2026-09-22-desktop-wallpaper-engine-integration-design.md) | 中文

## 目标

唯一的官方 Desktop 应用把 Wallpaper Engine 背景作为默认启用且可恢复关闭的 bundle 随发行版提供。新安装先要求用户配置该功能；用户保存任意壁纸配置后，后续启动自动恢复所选背景，不再重复首次引导。

集成复用现有 `dsh-plugin-wallpaper-engine` Host 与 Client 实现。DSH 负责 Desktop 组合、首次引导、恢复、包版本选择和发行验证；上游包继续负责 Wallpaper Engine 发现、媒体服务、场景渲染、自定义上传、外观控件及其设置页。

## 范围

本次交付新增 Desktop 所有的包装 bundle，把上游包的精确版本带入签名运行时，为新旧 Desktop profile 一次性默认启用该 bundle，并提供本地化引导步骤以打开上游 `Wallpaper Engine` 设置分区。

本次交付不把上游渲染器复制进 `packages/`，不重做其设置 UI，不把其配置迁移到 DSH 设置文档，不改变普通 `web` profile 默认值，也不向 Headless、SDK 或 ACP profile 提供 Wallpaper Engine。本次交付也不删除仓库当前内部的客户端构建选择器；无论这些构建期标识如何命名，产品行为都是一个官方 Desktop 功能。

## 包归属

集成新增两个第一方包，并把上游实现保留为精确版本的外部依赖。

| 包 | 责任 |
|---|---|
| `@deepseek-ai/dsh-desktop-wallpaper-engine` | 仅用于 Desktop 的 bundle，插入上游 Host row 与第一方引导 row |
| `@deepseek-ai/dsh-client-ui-wallpaper-engine-onboarding` | 本地化首次判断与设置导航；不拥有壁纸渲染或配置字段 |
| `dsh-plugin-wallpaper-engine@0.7.5` | 上游 Host 路由、浏览器背景层、设置分区、持久化、Wallpaper Engine 发现、媒体处理与场景渲染 |

`apps/desktop-host` 依赖第一方包装 bundle，因此 Desktop 打包会把包装 bundle、它的 Client 包和精确的上游依赖带入签名运行时。包装 bundle 的 patch 插入 `dsh-plugin-wallpaper-engine` Host row，并把引导包作为独立 Client row 插入。上游 bundle 不单独进入 bundle 列表，因此整个功能由一个 Desktop bundle 开关控制。

依赖使用精确版本而非范围。发行版只有在审查上游版本、修改 lockfile、运行针对性兼容测试并完成 Desktop 打包 smoke 后才更新该版本。

## Desktop Profile 组合

Desktop 拥有一份默认 bundle 列表，由普通 Web bundles 加 `@deepseek-ai/dsh-desktop-wallpaper-engine` 组成。新的开发、运行时构建和用户 profile manifest 使用同一列表；普通 `web` profile 保持不变。

包装 bundle 是选中的 Desktop bundle，而不是应用 overlay。现有原生恢复操作因此只恢复普通 Web bundle 列表，并在下次 Host 启动前关闭完整壁纸功能。用户选择“禁用第三方插件”后，故障的上游包不会继续成为强制启动项。

插件管理器把包装 bundle 显示为一个已启用 bundle。关闭它会同时移除上游 Host、Client 行为和引导 row；再次启用会恢复功能，但不会删除 `~/.dsh-wallpaper-engine/config.json`、上传的壁纸文件或已生成缓存。

## 现有 Profile 迁移

`initProfile()` 不会覆盖已有 Desktop manifest，因此 Desktop 在预留的 Desktop profile 目录下新增应用所有的默认 bundle 记录。该记录使用带版本的 JSON 格式，并保存应用已经向该 profile 提供过的每一个默认 bundle。

`DesktopProjectManager.applyRelease()` 在持有现有 profile 事务锁期间读取 profile manifest 与默认 bundle 记录。如果记录从未提供壁纸包装 bundle，Desktop 会在 bundle 缺失时把它追加到 `dsh.profile.bundles`，并记录已经提供。写入采用原子发布，并在 Host 启动前完成。

该记录区分发行迁移与用户后续选择。首次提供后，用户通过插件管理器或原生恢复关闭包装 bundle 时记录保持不变，因此以后启动不会重新启用。记录缺失时按首次状态处理；记录存在但内容无效时，profile 准备以明确诊断失败，不会静默改写用户的启用状态。

## 首次使用体验

引导包通过现有设置外壳注册一个 root scope 的 `settings.onboarding` entry。所有可见文案放在带类型的英文与简体中文 locale 字典中。

引导组件满足显示条件后请求 `GET /wallpaper-engine/settings`。上游路由在第一次成功写入设置前返回 `settings: null`，之后返回对象。组件仅在 `null` 状态显示首次引导。只要已经保存对象就视为完成配置，即使用户后来清空当前壁纸、关闭轮播或保存空选择也不会重新引导。

主操作先调用设置 owner 的 `complete()`，再通过 `openSection('wallpaper-engine')` 打开上游分区。完成状态只在当前进程中保留；上游设置对象仍是持久化的首次使用事实。如果用户没有保存就关闭分区，下次启动会再次显示引导；上游插件一旦写入设置，后续启动不再渲染该引导步骤。

引导请求只用于提示，不能在可用性未知时阻塞应用。路由缺失、非成功响应、返回字段无效或连接失败时，引导不渲染，并只记录一条有界诊断。上游设置分区仍可从普通 Settings 进入，因此临时探测失败不会让配置入口消失。

## 运行时行为

首次引导完成后，上游 Client 先加载持久化选择，再刷新 inventory 并挂载已保存背景层。集成不增加第二套持久化存储，也不把已选壁纸镜像到 Desktop 状态。

上游 Host 继续通过 token 化同源路由提供 inventory、媒体、预览、上传、设置、转码和场景资源。Web 壁纸保留上游不含 `allow-same-origin` 的 sandbox，因此工坊脚本不能冒用已认证的 DSH 应用 origin。上传与设置 body 限制、流清理、ffmpeg 取消和带哈希校验的 ffmpeg 下载仍由固定版本的上游实现拥有并接受验证。

即使未发现 Wallpaper Engine 安装，功能仍可通过上游页面上传自定义 JPG、PNG 和 MP4。在不支持的平台或没有 Wallpaper Engine 的机器上，发现结果不包含安装目录，设置页展示上游空状态；Desktop 不宣称这些系统支持原生 Wallpaper Engine。

## 样式与兼容性

上游 Client 会有意覆盖应用外壳的全局主题变量和选择器。精确依赖版本限制了未经审查的变化，但不会把这些选择器变成稳定 DSH API。任何修改 DSH 主题、设置、侧栏或外壳结构并更新上游版本的 Desktop 发行，都必须包含壁纸兼容 smoke。

固定的上游版本把样式归属标记写为 `dsh-wallpaper-engine`，而 DSH Client 模块 id 是 `dsh-plugin-wallpaper-engine`。打包启动只物化一次 bundle，因此不受影响，但 Client HMR 和实时关闭可能保留旧样式。首次集成包含一项窄范围上游 patch 或包装层规范化，使标记与模块 id 一致，并增加移除与替换回归测试。

新增 DSH 文案使用 locale 字典和 UI primitives。上游包中中英文混合的文案继续由该包拥有，并记录为发行限制；替换全部上游文案属于独立的上游贡献或 vendoring 工作，不暗中扩大本次集成范围。

## 错误与恢复

| 条件 | 行为 |
|---|---|
| 签名运行时无法解析上游包 | Desktop 打包或运行时 smoke 失败，不接受发行产物 |
| 包装 bundle 在正常启动时激活失败 | Desktop 报告 Host 错误，原生恢复可以关闭包装 bundle |
| 首次设置探测失败 | 引导不渲染；普通 Settings 仍可使用 |
| 未安装 Wallpaper Engine | Inventory 为空，自定义上传仍可使用 |
| 已保存壁纸文件消失 | 上游插件报告现有的不可用或被过滤状态；Desktop 不删除配置 |
| 原生恢复关闭插件 | 包装 bundle 离开活动列表，并保持关闭直到用户再次启用 |
| 上游更新改变必需路由或 slot | 针对性兼容测试在打包前失败 |

## 测试

包装 bundle 测试加载真实 patch，验证它恰好插入一个上游 row 和一个引导 row，能够解析固定依赖，并随 bundle fiber 一起释放两个 row。

引导 Client 测试覆盖 `settings: null`、已保存设置、故意保存的空选择、请求失败、无效 JSON 字段、本地化文案、主操作顺序、设置分区导航和释放。主操作顺序测试验证当前进程的步骤先完成，再打开设置面板，避免引导对话框和设置面板同时争夺焦点。

Desktop project 测试覆盖新 profile 默认值、已有 profile 的一次性迁移、用户关闭后的保持、原生恢复、无效迁移状态、开发元数据、运行时构建元数据和 package set 包含关系。

真实 Loader smoke 使用包装 bundle 启动 Desktop profile，验证上游 inventory 与 settings 路由、`settings.section` 注册、引导注册和样式清理。固定版本运行上游自检。Windows 打包 smoke 验证签名运行时无需联网安装即可解析该包，并验证已保存测试配置在 Host 重启后仍然存在。

该用户可见 Desktop 改动在评审前还要从真实 Desktop server 与设置流程录制 GIF。文档更新包含 Desktop README 双语对、包装与引导 README 双语对、包组索引，以及通过 `dsh-pre-push-checks` 选择的实际命令。

## 备选方案

应用 overlay 可以用更少文件插入上游 row，但原生恢复在重置 profile 后仍会应用同一 overlay，无法关闭故障插件。本设计不采用该耦合。

直接选择上游 bundle 无法提供统一的官方功能身份，也没有位置承载 DSH 所有的引导和兼容测试。包装 bundle 让启用与恢复保持原子，同时让运行时行为继续由上游拥有。

把完整上游实现复制进 `packages/` 可以实现完整本地化和 API 重构，但会让 DSH 负责数千行场景渲染、逆向格式、ffmpeg 处理和上游同步。本设计在独立的 vendoring 决策证明该归属值得之前，优先采用精确版本的维护依赖。

## 验收标准

- 新建官方 Desktop profile 无需包管理器或网络操作就默认启用壁纸包装 bundle。
- 已有 Desktop profile 只接收一次包装 bundle，用户之后关闭的状态在每次重启和更新后都保持不变。
- 没有上游 settings 对象的 profile 收到一次本地化首次引导，并能打开 `Wallpaper Engine` 设置分区。
- 上游 settings 只要成功写入过一次，后续就不再引导，包括保存的选择为空时。
- 已保存壁纸选择在 Desktop 与 Host 重启后自动恢复。
- 原生恢复关闭完整功能，并允许 Desktop 在上游包未激活时启动。
- 普通 Web、Headless、SDK、SDK Minimal 和 ACP profile 默认值不改变。
- 打包运行时从签名应用资源解析精确的上游版本。
- 针对性测试能够拒绝路由缺失、slot 注册损坏、样式归属残留、迁移重复和恢复后重新启用 bundle。
