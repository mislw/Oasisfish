# Windows 桌面 App 设计

[English](2026-08-26-windows-desktop-app-design.md) | 中文

## 目标

交付一个 Windows 10/11 x64 安装包，使 DeepSeek Harness 能在未预装开发工具的全新机器上运行。模型请求仍需联网，安装和本地编码工具则可离线工作。

## 产品范围

桌面 App 内置现有 `dsh web` 产品，不增加第二套 agent 运行时或 UI。Electron 负责原生窗口和子进程生命周期。Harness 由单独内置的 Node 进程承载，因此 Electron 的 Node ABI 不会影响 Harness 的原生依赖。

首个版本包含 Node.js、pnpm、带 pip 的 Python、包含 Git Bash 的 PortableGit、PowerShell、ripgrep、fd、jq、curl、7-Zip、SSH，以及构建后的 Harness 生产依赖闭包。它仅支持 Windows 10/11 x64，不包含 Visual Studio Build Tools、Rust、Go、Java 或 .NET 等编译型语言 SDK。

## 运行时布局

`electron-builder` 将不可变应用资源安装到其安装目录下：

```text
resources/
  harness/             deployed @deepseek-ai/dsh production package
  runtime/
    node/
    node-global/       pnpm command and package
    python/            Python, pip, and site-packages
    git/               PortableGit, Git Bash, curl, and OpenSSH
    powershell/
    tools/             rg, fd, jq, and 7za
    manifest.json      pinned versions, sources, and SHA-256 values
```

可变设置、会话数据、日志和临时文件保留在 Electron 的每用户应用数据目录中。安装包从不修改机器或用户的 `PATH`。

## 进程生命周期

Electron 主进程预留一个回环端口，构造仅供子进程使用的环境，并使用内置 Node 可执行文件启动已部署的 `dsh` 入口，参数为 `web --host 127.0.0.1 --port <port>`。它把 stdout 和 stderr 写入轮转桌面日志，轮询回环 URL 直至就绪，然后才加载 BrowserWindow。

启动有有限超时时间。子进程提前退出、超时或导航失败时，应用显示包含日志路径的原生错误对话框并干净退出。应用关闭时终止 Harness 进程树。第二次启动通过 Electron 单实例锁聚焦已有窗口。

## 环境

子进程环境只在 `PATH` 前添加经过验证的内置目录。它设置 `DSH_HOME`、`XDG_CONFIG_HOME`、`XDG_DATA_HOME`、`XDG_CACHE_HOME`、`PYTHONHOME`、`PYTHONUTF8=1`、`PIP_DISABLE_PIP_VERSION_CHECK=1`、`GIT_CONFIG_NOSYSTEM=1`，以及应用数据目录下各工具专用的 home 变量。用户提供的模型凭据仍通过继承环境和 Harness 设置提供。

所有运行时归档都在发行构建期间从固定的 HTTPS 来源下载。准备命令在解压前验证 SHA-256，并在缺少归档、可执行文件或预期版本时失败。安装过程不访问网络。

## 安全性

BrowserWindow 启用 context isolation，禁用 Node integration 和 remote module，拒绝非预期窗口创建，并且只允许导航到选定的回环 authority。Harness 继续执行其回环 host 检查。应用不会在 LAN 接口上公开本地服务器。

## 打包与更新

Windows 发行版生成一个 x64 NSIS 安装包和一个用于 smoke 测试的未打包目录。运行时下载和生成的暂存目录不进入 Git。应用内手动更新使用 [Oasisfish GitHub Release 更新设计](2026-09-06-oasisfish-github-release-updates-design.zh.md)中说明的公开 GitHub Release 流程。未签名安装包可能触发 Windows 信誉警告。

## 验证

单元测试覆盖确定性运行时路径、环境构造、端口选择、启动就绪、超时、提前退出和进程清理。打包测试在不下载资源的情况下验证清单和暂存资源库存。发行验证构建 Harness、准备运行时、构建安装包、启动未打包应用、确认 Web UI 返回 HTTP 200，并运行内置 `node`、`pnpm`、`python`、`pip`、`git`、`bash`、`pwsh`、`rg`、`fd`、`jq`、`curl`、`7za` 和 `ssh` 的版本命令。

## 已考虑的替代方案

**带 Node sidecar 的 Tauri。** 原生 shell 更小，但离线产品仍需携带相同工具链，还需要固定版本的 WebView2 发行包。Electron 为全新机器安装包提供一套确定的渲染运行时。

**系统浏览器启动器。** 这可避免分发 Chromium，但无法提供自包含桌面应用或受控浏览器生命周期。

**在 Electron 主进程内运行 Harness。** 这会减少一个进程，但会把 Harness 原生模块耦合到 Electron ABI，并把 UI 监督与 agent 运行时混合在一起。
