# Agent Note: 自包含 Windows 桌面发行版

Status: implemented

[English](2026-08-26-self-contained-windows-desktop-distribution.md) | 中文

## Problem

在全新 Windows 机器上运行 DeepSeek Harness，原本需要用户先安装并协调 Node.js、pnpm、Python、Git、shell 和配套命令行工具，产品才能执行普通编码任务。依赖宿主工具链的桌面包装层只会把 Web UI 移入窗口，无法消除安装要求；直接复制 workspace 树则会保留 pnpm 链接和隐式对等依赖，这些关系无法在搬移后继续成立。

## Decision

**Windows x64 产品采用 Electron 监督器承载现有 Web 应用。** Electron 保留一个由操作系统分配的回环端口，使用内置 Node.js 可执行文件启动打包后的 `dsh web --no-open` 入口，等待 HTTP 就绪，并只在沙箱化 BrowserWindow 中加载该来源，不会交接给系统浏览器。应用拒绝外部导航和新窗口，强制单实例运行，将启动诊断写入用户数据目录，并在退出前终止 Harness 进程树。

**发行版携带经过校验的私有编码运行时。** [`apps/desktop/runtime-manifest.json`](../../../../apps/desktop/runtime-manifest.json) 固定 Node.js、pnpm、Python、pip、Git for Windows、PowerShell、ripgrep、fd、jq 和 7-Zip 的上游 URL 与 SHA-256 校验和。Git for Windows 同时提供 Git Bash、curl 和 OpenSSH。运行时准备过程校验归档哈希、解压结果、必需文件和可执行文件版本。Python 入口启动器使用 distlib 的 `<launcher_dir>` 形式，使 pip 在搬移后仍能解析相邻的打包解释器。

**内置工具只对 Harness 进程树可见。** 监督器将安装后的工具目录前置到子进程 `PATH`，设置私有 Python 与 Harness 数据位置，并保持用户全局环境不变。产品资源是不可变安装文件；设置、凭据、profile、会话、缓存和日志保留在 Electron 的用户数据根目录中。

**Harness 部署使用显式 workspace 依赖闭包。** `apps/desktop-runtime/package.json` 是仅含依赖的部署根目录。仓库闭包校验器会跟踪应用 workspace 依赖，并要求该根目录显式声明每个 workspace 对等依赖。pnpm 部署 hoisted（提升式）生产树，staging 会将包链接实体化为独立文件；electron-builder 的普通 `extraResources` 遍历会过滤 `node_modules`，因此 `afterPack` 钩子负责复制并清点完整 Harness 目录。

**发布验证直接作用于打包目录。** staging 清单要求产品入口和工具可执行文件齐全。`smoke:unpacked` 会拒绝 reparse point（重解析点），执行每个内置工具，启动打包后的应用，要求 HTTP 就绪、未交接给默认浏览器且 Harness 持续存活，请求应用关闭，并要求 Electron 与 Harness 进程退出。模型与远程 API 请求仍是在线操作，并需要用户提供凭据。

## Alternatives considered

**首次启动时安装缺失工具。** 不采用，因为这会让全新机器启动依赖包管理器、提权、外部镜像和可变全局状态，也无法提供确定性的离线本地运行时。

**只包装托管或本地已安装的 Web UI。** 不采用，因为缺少 Harness 运行时的窗口无法在全新机器上执行编码任务，也不满足产品自包含要求。

**原样打包开发 workspace 或 pnpm 链接。** 不采用，因为 junction（目录联接）和 workspace 相对对等依赖解析依赖构建 checkout。发布树必须包含独立包文件和显式闭合的生产依赖图。

**把内置工具加入用户全局 `PATH`。** 不采用，因为应用负责这些精确版本，不应在 Harness 进程树之外替换或遮蔽用户的开发环境。

## Consequences

NSIS 安装包和解包目录无需预装开发运行时，即可在 Windows x64 上启动 Harness UI 并执行内置本地编码工具。安装包体积明显增大，发布流程需要负责上游版本、校验和、许可证及 Windows 兼容性更新。回环服务器仍作为本地子进程运行，而不是成为 Electron renderer 代码，从而保留现有插件装配和 Web 行为。全新虚拟机安装仍是发布验收活动，不由打包目录冒烟测试替代。
