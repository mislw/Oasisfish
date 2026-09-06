# Agent Note: 自包含 Windows 桌面发行版

Status: implemented

[English](2026-08-26-self-contained-windows-desktop-distribution.md) | 中文

## Problem

在全新 Windows 机器上运行 DeepSeek Harness，原本需要用户先安装并协调 Node.js、pnpm、Python、Git、shell 和配套命令行工具，产品才能执行普通编码任务。依赖宿主工具链的桌面包装层只会把 Web UI 移入窗口，无法消除安装要求；直接复制 workspace 树则会保留 pnpm 链接和隐式对等依赖，这些关系无法在搬移后继续成立。

## Decision

**Windows x64 产品采用 Electron 监督器承载现有 Web 应用。** Electron 保留一个由操作系统分配的回环端口，使用内置 Node.js 可执行文件启动打包后的 `dsh web --no-open` 入口，等待 HTTP 就绪，并只在沙箱化 BrowserWindow 中加载该来源，不会交接给系统浏览器。应用拒绝外部导航和新窗口，强制单实例运行，并将启动诊断写入用户数据目录。

**窗口控件会让监督器持续驻留，直到用户从托盘明确退出。** 最小化会将 BrowserWindow 隐藏到 Windows 系统托盘。点击标题栏关闭按钮会打开原生确认框；确认后窗口隐藏到托盘，取消则保持打开。托盘可以重新打开现有窗口，并拥有唯一由用户主动触发的退出命令。应用关闭时会销毁托盘和窗口、终止 Harness 进程树，然后退出 Electron。

**安装后的产品标识为 Oasisfish。** electron-builder 将 Oasisfish 名称和位图用于可执行文件、NSIS 安装包、快捷方式、Web 安装 manifest、文档标题和默认侧边栏品牌。应用保留 `ai.deepseek.harness.desktop` 作为 Windows 标识，并把 Electron `userData` 显式固定为 `%APPDATA%\DeepSeek Harness`，因此品牌升级会继续使用已有浏览器状态与 Harness 数据，而不会打开空白 profile。

**发行版携带经过校验的私有编码运行时。** [`apps/desktop/runtime-manifest.json`](../../../../apps/desktop/runtime-manifest.json) 固定 Node.js、pnpm、Python、pip、Git for Windows、PowerShell、ripgrep、fd、jq 和 7-Zip 的上游 URL 与 SHA-256 校验和。Git for Windows 同时提供 Git Bash、curl 和 OpenSSH。运行时准备过程校验归档哈希、解压结果、必需文件和可执行文件版本。Python 入口启动器使用 distlib 的 `<launcher_dir>` 形式，使 pip 在搬移后仍能解析相邻的打包解释器。

**内置工具只对 Harness 进程树可见。** 监督器将安装后的工具目录前置到子进程 `PATH`，设置私有 Python 与 Harness 数据位置，并保持用户全局环境不变。产品资源是不可变安装文件；设置、凭据、profile、会话、缓存和日志保留在 Electron 的用户数据根目录中。

**产品将 Oasis Wiki 作为默认领域 Skill。** [`apps/desktop/bundled-skills/oasis-wiki`](../../../../apps/desktop/bundled-skills/oasis-wiki) 是 Oasis Companion 正式发行版的版本化快照，[`oasis-wiki.provenance.json`](../../../../apps/desktop/bundled-skills/oasis-wiki.provenance.json) 记录其来源。electron-builder 将该根目录复制到不可变安装资源中，监督器只通过 `DSH_BUNDLED_SKILL_DIR` 将它提供给 Harness。文件系统 Skill 提供方将项目与用户根目录排在内置资源之前，因此显式本地更新可以覆盖安装包兜底版本，无需在首次启动时复制文件，也无需修改安装目录。快照路径会关闭 Git 空白诊断，避免为满足本地格式检查而改写导入的发布 blob；发布评审会把每个 staged blob 与固定的来源提交逐一比较。

**Harness 部署使用显式 workspace 依赖闭包。** `apps/desktop-runtime/package.json` 是仅含依赖的部署根目录。仓库闭包校验器会跟踪应用 workspace 依赖，并要求该根目录显式声明每个 workspace 对等依赖。pnpm 部署 hoisted（提升式）生产树，staging 会将包链接实体化为独立文件；electron-builder 的普通 `extraResources` 遍历会过滤 `node_modules`，因此 `afterPack` 钩子负责复制并清点完整 Harness 目录。

**发布验证作用于组装应用与打包应用。** assembled snapshot（组装快照）会启动已发布的插件树，要求标准 agent（智能体）目录公布 `oasis-wiki`，并通过真实 `skill` 工具加载正文。打包清单除产品入口与工具可执行文件外，还要求 Skill 入口、版本和来源记录存在。`smoke:unpacked` 会拒绝 reparse point（重解析点），执行每个内置工具，启动打包后的应用，要求 HTTP 就绪且未交接给默认浏览器，验证窗口关闭请求会让 Electron 与 Harness 保持运行，再发送仅供测试使用的父进程命令来调用托盘退出路径，并要求两个进程都退出。窗口生命周期测试固定确认、取消、托盘重新打开、托盘退出分发和严格的父进程命令校验。模型与远程 API 请求仍是在线操作，并需要用户提供凭据。

## Alternatives considered

**首次启动时安装缺失工具。** 不采用，因为这会让全新机器启动依赖包管理器、提权、外部镜像和可变全局状态，也无法提供确定性的离线本地运行时。

**只包装托管或本地已安装的 Web UI。** 不采用，因为缺少 Harness 运行时的窗口无法在全新机器上执行编码任务，也不满足产品自包含要求。

**原样打包开发 workspace 或 pnpm 链接。** 不采用，因为 junction（目录联接）和 workspace 相对对等依赖解析依赖构建 checkout。发布树必须包含独立包文件和显式闭合的生产依赖图。

**把内置工具加入用户全局 `PATH`。** 不采用，因为应用负责这些精确版本，不应在 Harness 进程树之外替换或遮蔽用户的开发环境。

**首次启动时下载 Oasis Wiki 或将它复制到用户数据目录。** 不采用，因为启动过程要么依赖网络，要么会产生一个可变副本，使其版本与所有权脱离已安装产品。不可变兜底版本加上优先级更高的项目与用户根目录，既保留离线启动，也保留显式本地更新。

**让用户数据目录跟随可见产品一起改名。** 不采用，因为 Electron 会从产品名派生默认目录。迁移到 `%APPDATA%\Oasisfish` 会让现有设置和会话在品牌升级后看起来像是丢失了。

**让标题栏关闭按钮直接终止应用。** 不采用，因为误关窗口会同时终止正在运行的 Harness 工作和后台任务，无法让桌面监督器继续可用。

**标题栏关闭时不经确认直接隐藏。** 不采用，因为静默驻留会让用户难以察觉关闭窗口与退出进程之间的区别。

## Consequences

Oasisfish NSIS 安装包和解包目录无需预装开发运行时或单独安装 Skill，即可在 Windows x64 上启动 Harness UI、执行内置本地编码工具并加载 Oasis Wiki。安装包体积明显增大，发布流程除运行时更新外，还需负责固定的 Skill 快照、来源记录、产品位图和托盘生命周期。回环服务器仍作为本地子进程运行，而不是成为 Electron renderer 代码，从而保留现有插件装配和 Web 行为。关闭或最小化主窗口会让 Harness 工作保持运行，直到用户选择托盘退出命令或操作系统关闭应用。保留的数据目录名与可见产品名有意不同。全新虚拟机安装仍是发布验收活动，不由打包目录冒烟测试替代。
