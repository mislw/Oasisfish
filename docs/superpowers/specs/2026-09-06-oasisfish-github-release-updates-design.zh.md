# Oasisfish GitHub Release 更新设计

[English](2026-09-06-oasisfish-github-release-updates-design.md) | 中文

## 目标

让已安装的 Oasisfish 或解压运行的便携版能够检查公开的 `mislw/Oasisfish` GitHub Releases，按照用户的明确操作下载新版 Windows 安装包，替换旧的已安装程序，并保留所有用户设置、凭据、会话、缓存和日志。

## Release 约定

`apps/desktop/package.json` 继续作为应用版本的唯一来源。Release 标签使用 `v<version>`，并且必须与该 package 版本一致。发布工作流上传 NSIS 安装包、对应的 block map 和 `latest.yml`；除非当前应用本身处于相同 prerelease 渠道，否则更新器拒绝 prerelease。

只有已发布的 GitHub Release 才是应用更新。把源码推送到 `main` 不会改变已安装客户端，必须由匹配版本标签生成 Release 资源。

## 桌面更新服务

Electron 主进程通过 `DesktopUpdateController` 封装 `electron-updater`。它固定使用公开 GitHub provider，关闭自动下载和自动安装，并公开有限状态机：`idle`、`checking`、`up-to-date`、`available`、`downloading`、`downloaded`、`installing`、`unsupported` 或 `error`。

控制器串行处理用户命令，防止重复点击启动并行检查或下载。它把 updater 事件转换为不可变的 renderer 数据，其中只包含应用版本、进度、状态和适合展示给用户的错误信息。Release URL、文件系统路径、请求头、token 和原始异常都不会进入 renderer。

更新检查仅由用户手动触发。打开 Oasisfish 或设置面板不会发起 GitHub 请求、下载或安装。

## Renderer 桥接

Electron 加载一个沙箱化 preload 入口，并通过 `contextBridge` 只暴露一个 `window.oasisfishUpdate` 对象。该对象支持 `getState`、`check`、`download`、`install` 和 `subscribe`，不暴露通用 IPC、shell 执行、任意 URL、任意路径或 updater 配置。

主进程为每个命令注册独立 handler，并通过专用通道广播状态变化。每个 handler 都会在执行前校验当前控制器状态。只有经过校验的安装包进入 `downloaded` 状态后，`install` 才会被接受。

## 设置界面

新增 `@deepseek-ai/dsh-client-ui-desktop-update` 浏览器插件，仅在 preload bridge 存在时向 `settings.section` 贡献“应用更新”页面。普通系统浏览器会话和远程 Web 客户端不注册该页面，也不会发起更新请求。

页面显示当前版本，并根据状态提供一个主要命令：“检查更新”、“下载更新”或“重启并安装”。provider 能提供总大小时显示确定进度，否则显示不确定进度状态。错误持续显示并提供重试操作。按钮使用已有图标控件，在不兼容的命令执行期间保持禁用。

## 安装版与便携版行为

已安装的 NSIS 版本通过 `electron-updater` 下载并启动新版 NSIS 安装程序。安装程序保持相同的应用标识和每用户安装模式，替换已注册的旧程序，并在安装完成后启动新版本。

从 `win-unpacked` 解压得到的便携版使用相同的检查和下载流程，然后启动 NSIS 安装程序，把用户迁移到安装版。只有便携目录包含产品打包标记且当前文件符合打包清单时，才允许清理该目录。独立清理 helper 等待旧进程和安装程序退出，确认已安装可执行文件报告目标版本，仅删除清单拥有的文件，并且只在目录为空时删除目录。出现任何未知文件、路径变化、安装失败、版本不匹配、reparse point 或不安全目标时，都保留便携目录并记录诊断。

安装版升级不执行便携目录清理。它依赖 NSIS 升级流程，应用代码不会递归删除安装目录。

## 用户数据保留

更新流程永不删除、移动或重写 `%APPDATA%\DeepSeek Harness`。Electron 继续把该目录设为 `userData`，因此 profile、设置、凭据引用与已保存 secret、会话、缓存、浏览器状态和日志在便携版迁移及安装版升级后都会保留。

下载的更新资源和更新诊断存放在同一每用户数据根目录下的 `updates` 目录中。安装程序和清理 helper 不接收模型凭据值。Release 创建过程排除 `.env`、每用户数据、运行日志和本地缓存。

## 发布工作流

`.github/workflows/oasisfish-release.yml` 在 `v*` 标签或手动触发时运行。它确认标签与 `apps/desktop/package.json` 一致，使用 frozen workspace 安装依赖，执行选定的发行检查，构建 Windows x64 NSIS 目标，并由 `electron-builder` 使用具有 `contents: write` 权限的工作流内置 `GITHUB_TOKEN` 完成发布。

工作流不接收或引用任何模型 provider secret。`electron-builder.yml` 把更新 provider 固定为公开的 `mislw/Oasisfish` 仓库，因此客户端不会获得凭据或仓库覆盖入口。

## 失败处理

网络、rate limit、Release 缺失、元数据无效、校验和、下载、启动或安装失败都会进入 `error` 状态，并且不会改变当前应用。便携目录清理失败时保留原目录，安装版升级失败时保留 Windows 已注册的安装程序。

未签名构建可能显示 Windows 信誉或发布者警告。更新界面会说明安装需要接受操作系统安装提示，不会绕过该提示或削弱校验和验证。

## 验证

桌面单元测试覆盖状态迁移、命令串行、安全错误投影、仅打包版本行为、preload 通道限制、安装资格和便携目录清理 allowlist。客户端测试覆盖条件式页面注册、本地化状态、进度、重试和命令分发。无 Key 的组装 Web snapshot 证明普通浏览器中不存在桌面专属页面，并且测试 bridge 存在时能够显示该页面。

打包测试要求存在 `app-update.yml`、产品标记、便携清单和清理 helper。发布工作流要求生成 NSIS 安装包、对应的 block map 和 `latest.yml`。安装回执与便携清理测试会验证目标版本、路径所有权、修改文件和未知文件保留、reparse point 拒绝以及应用目录与用户数据目录分离。最终的 Windows 双版本安装升级属于发布时 smoke，因为它需要两个经过明确版本设置的 NSIS fixture。

## 已考虑的替代方案

**打开 GitHub Releases 页面。** 这不需要更新服务，但无法提供应用内进度、由应用负责完整性的下载、安装交接或可靠的已安装版本替换。

**通过 Git 更新源码 checkout。** 已安装用户没有开发 checkout，本地重建还会让产品更新依赖开发工具和仓库历史。

**安装后删除整个便携目录。** 递归删除可能移除用户自行放入的文件或错误解析的路径。仅清理清单拥有的内容可以在安全时自动移除旧程序，并在无法证明所有权时保留目录。
