# Oasisfish Desktop

[English](README.md) | 中文

本文是 Oasisfish Windows 10/11 x64 自包含发行版的参考文档。安装后的应用内置 DeepSeek Harness Web UI 及本地编码运行时；模型与远程 API 请求仍需联网并使用用户提供的凭据。

## 运行时行为

Electron 会先复用共享桌面用户数据目录中已公布且仍可响应的 Harness；否则由一个桌面进程持有原子启动锁，在操作系统分配的 `127.0.0.1` 端口启动内置 `dsh web --no-open` 入口，并向其他 Oasisfish 发行目录公布就绪状态。这样可以防止安装版和多个解包版并发修改同一份 profile 模块回退目录。HTTP 就绪后，应用只在沙箱化 BrowserWindow 中打开该来源，不会将其交给系统浏览器。应用拒绝外部导航和新窗口。标题栏最小化按钮会将窗口隐藏到 Windows 系统托盘；标题栏关闭按钮会先请求确认，确认后隐藏到托盘，取消则保持窗口打开。用户可以从托盘重新打开窗口；只有托盘菜单中的“退出 Oasisfish”会主动终止该桌面进程自己启动的 Harness。

只有 Harness 子进程会在 `PATH` 前端获得内置工具目录。桌面应用不会修改用户的全局环境。不可变应用文件保留在安装目录中；profile、设置、凭据、会话、缓存和日志保留在 Electron 的用户数据目录中。

## 内置 Skills

安装资源包含作为默认领域 Skill 的 Oasis Wiki `1.260827.1`，以及用于离线优化生图提示词的 `ai-image-prompts` Skill。监督器将 `DSH_BUNDLED_SKILL_DIR` 指向打包后的 `skills` 目录，因此标准 agent（智能体）目录无需单独安装或联网，即可公布并加载两者。项目与用户 Skill 根目录的优先级高于内置根目录，因此显式安装的更新可以覆盖安装包中的兜底版本，而无需修改应用文件。[`oasis-wiki.provenance.json`](bundled-skills/oasis-wiki.provenance.json) 记录 Oasis 快照的源仓库、源路径、版本与精确 revision。[`ai-image-prompts.provenance.json`](bundled-skills/ai-image-prompts.provenance.json) 固定经适配的 YouMind 上游 revision；内置 MIT 许可证保留在该 Skill 目录中。

生图请求优先使用设置中选择的主生图模型；主路由非取消失败后，可以使用单独配置的一条备用路由。当前对话模型会在现有轮次内优化用户描述，按需检索本地视觉配方，并把所得英文 prompt 交给 `image_generate`；生图成功后会把“已生成。”和图片附件写入结果并立即结束本轮，不会在后台额外请求对话模型生成收尾文字。

## 内置本地检索模型

应用内置 revision 为 `75c43b069aac4d136ba6bc1122f995fedcfd2781` 的 `Xenova/bge-small-zh-v1.5`，用于本地 Oasis Skill 检索。监督器将 `DSH_SKILL_SEARCH_MODEL_DIR` 指向不可变模型资源，并将 `DSH_SKILL_SEARCH_CACHE_DIR` 指向桌面应用用户数据缓存下的可变目录。源文本、查询、Embedding 和 SQLite 索引均保留在本地；该检索路径不使用中转站凭据或 Embedding API。

[`model-manifest.json`](bundled-models/bge-small-zh-v1.5/model-manifest.json) 固定模型标识、Transformers.js 版本及每个必需模型文件的 SHA-256 摘要。staging、解包冒烟测试与启动路径验证会在使用模型前拒绝缺失文件、被修改的字节和 reparse point（重解析点）。

## 内置工具

| 工具 | 版本 |
|---|---:|
| Node.js | 24.19.0 |
| pnpm | 11.7.0 |
| Python | 3.14.7 |
| pip | 26.2.1 |
| Git for Windows / Git Bash | 2.55.0.windows.5 / 5.3.15 |
| PowerShell | 7.6.5 |
| OpenSSH | 10.5p1 |
| ripgrep | 15.2.0 |
| fd | 10.4.2 |
| jq | 1.8.2 |
| curl | 8.21.0 |
| 7-Zip | 26.02 |

[`runtime-manifest.json`](runtime-manifest.json) 固定上游 URL、版本、SHA-256 校验和、解压规则及必需文件。打包流程会在 staging（暂存）前校验每个下载文件。

## 构建

在已安装依赖的仓库 checkout 中运行：

```sh
pnpm --filter @deepseek-ai/dsh-desktop run package:dir
pnpm --filter @deepseek-ai/dsh-desktop run package
```

`package:dir` 将解包应用写入 `apps/desktop/release/win-unpacked/`。`package` 将 NSIS 安装包写入 `apps/desktop/release/`。本地缓存缺少上游运行时归档时，构建过程会按固定地址下载；安装后的应用无需联网即可启动 UI 或执行内置本地工具。

## 更新

安装版和打包后的便携目录都会显示“设置 > 应用更新”。打开 Oasisfish 或设置页面不会访问 GitHub；“检查更新”、“下载更新”和“重启并安装”分别需要用户操作。安装程序替换已注册的应用文件，并保留 `%APPDATA%\DeepSeek Harness` 中的设置、凭据、会话、缓存、浏览器状态和日志。

只推送源码不构成应用更新。发布时先修改 `apps/desktop/package.json` 中的版本，再创建匹配的 `v<version>` 标签，并通过 `.github/workflows/oasisfish-release.yml` 发布该标签。公开的 `mislw/Oasisfish` Release 必须包含 NSIS 安装包、对应的 `.blockmap` 和 `latest.yml`。便携版清理只会在安装后的目标版本写入回执后，删除打包清单中未被修改的文件；存在未知文件或修改文件时会保留旧便携目录，供用户手动检查。

## 验证

```sh
pnpm --filter @deepseek-ai/dsh-desktop run stage:verify
pnpm --filter @deepseek-ai/dsh-desktop run smoke:unpacked
```

staging 检查要求 Harness 入口、Web 前端、更新元数据、便携清单与清理 helper、运行时 manifest、产品所需的每个可执行文件，以及已通过 hash 验证的本地检索模型齐全。打包资源验证还要求两个内置 Skill、各自来源记录，以及生图提示词 Skill 的许可证与视觉配方存在。无需密钥的 assembled snapshot（组装快照）会在标准 agent 目录中公布两个 Skill，通过真实 `skill` 工具加载它们，并通过 `skill_search` 检索各自声明的参考资料。解包冒烟测试会拒绝 reparse point（重解析点），执行每个内置工具，启动打包后的应用，要求在不交接给默认浏览器的情况下获得 HTTP 200 响应，确认 Harness 在就绪后及窗口关闭请求后仍存活，再通过仅供测试使用的父进程通道调用托盘退出路径，并要求 Electron 与 Harness 都退出。

## 用户数据与日志

默认数据根目录继续使用 `%APPDATA%\DeepSeek Harness`，因此升级到 Oasisfish 后仍会保留现有 profile、设置、凭据、会话、缓存、浏览器状态和日志。更新下载、安装回执、清理副本和清理诊断都保存在其 `updates` 目录下。`desktop-ready.json` 记录当前回环 URL 与 Harness PID，供诊断和复用。`desktop-harness-startup.lock` 只在某个桌面进程启动共享 Harness 时存在；记录的所有者进程已经退出时，恢复流程会移除该锁。启动过程和 Harness 输出写入 `logs\desktop.log`；日志轮转后，上一份文件保留为 `desktop.log.previous`。

## 许可证与限制

打包资源包含仓库[许可证](../../LICENSE)、[JavaScript 依赖通知](../../THIRD_PARTY_NOTICES.md)、[内置运行时通知](RUNTIME_NOTICES.md)、本地检索模型的 MIT 许可证，以及经适配的生图提示词 Skill 的 MIT 许可证。目前仅支持 Windows x64。安装程序不会配置对话模型凭据；本地 Skill 检索在离线状态下仍可用，对话模型与远程 API 请求则需要相应的网络访问和凭据。
