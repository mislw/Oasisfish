# Agent Note: Oasisfish GitHub Release 更新

Status: proposed

[English](2026-09-06-oasisfish-github-release-updates.md) | 中文

## 问题

Oasisfish 可以通过 NSIS 安装包或解压后的便携目录分发，但两种形式都无法发现或安装新版。手动替换应用文件容易出错，而每次更新都必须保留用户设置和凭据。

## 提案

增加由桌面端拥有、基于 `electron-updater` 的更新控制器、受限的沙箱化 preload API，以及仅桌面端可见的设置页面。已发布的 `mislw/Oasisfish` GitHub Releases 提供安装包、block map 和更新元数据；没有匹配 Release 的源码推送不会通知客户端。

安装版使用 NSIS 升级流程。便携版迁移到安装版，并在确认已安装版本后通过独立清理 helper 仅删除清单拥有的便携文件。`%APPDATA%\DeepSeek Harness` 位于应用清理和安装替换范围之外。

完整的组件、状态、Release、清理和验证设计见 [Oasisfish GitHub Release 更新设计](../../../../docs/superpowers/specs/2026-09-06-oasisfish-github-release-updates-design.zh.md)。

## 已考虑的替代方案

**打开 Releases 页面。** 这会把完整性、进度和安装全部交给用户，无法提供所需的应用内更新流程。

**递归删除便携目录。** 应用不能假定可执行文件旁边的所有文件都属于产品，因此不能无条件递归删除。

**从 Git 工作树更新。** 已安装应用是构建产物而不是开发 checkout，Git 更新也无法安全替换正在运行的 Electron 安装。

## 验收标准

- 打包后的 Windows 客户端能够手动检查公开 Release feed，并报告是否存在兼容的新版本。
- 下载和安装均由用户明确触发；应用启动时不检查、不后台下载，也不执行无人值守安装。
- 安装包经过发布更新元数据校验后才允许运行。
- 安装版升级会替换已注册的旧应用，并逐字节保留 `%APPDATA%\DeepSeek Harness`。
- 便携版迁移只在确认已安装目标版本后删除经过验证的产品文件，目录包含未知内容时予以保留。
- 普通浏览器客户端不暴露桌面更新 UI 或 updater 命令。
- 发布工作流只使用 GitHub 工作流 token，不发布模型凭据、`.env`、用户数据、日志或缓存。

## 风险

未签名安装包可能触发 Windows 信誉警告。GitHub 可用性和公开 API 限制可能导致检查或下载失败，但不会影响当前运行的应用。保守的便携目录清理会在无法确认所有权或安装成功时有意保留旧程序文件，供用户手动移除。
