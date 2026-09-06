# Agent Note: Oasisfish GitHub Release 更新

Status: implemented

[English](2026-09-06-oasisfish-github-release-updates.md) | 中文

## 问题

Oasisfish 可以通过 NSIS 安装包或解压后的便携目录分发，但两种形式都无法发现或安装新版。手动替换应用文件容易出错，而每次更新都必须保留用户设置和凭据。

## 决策

Oasisfish 使用由桌面端拥有、基于 `electron-updater` 的更新控制器、受限的沙箱化 preload API，以及仅桌面端可见的设置页面。已发布的 `mislw/Oasisfish` GitHub Releases 提供安装包、block map 和更新元数据；没有匹配 Release 的源码推送不会通知客户端。

主进程仅在 Electron ready 后通过 `createRequire(import.meta.url)` 加载 `electron-updater`。在 `boot()` 前使用 ESM import 加载它，可能导致打包后的 Electron 进程在应用窗口打开前卡住。

安装版使用 NSIS 升级流程。便携版迁移到安装版，并在确认已安装版本后通过独立清理 helper 仅删除清单拥有的便携文件。`%APPDATA%\DeepSeek Harness` 位于应用清理和安装替换范围之外。

完整的组件、状态、Release、清理和验证设计见 [Oasisfish GitHub Release 更新设计](../../../../docs/superpowers/specs/2026-09-06-oasisfish-github-release-updates-design.zh.md)。

## 已考虑的替代方案

**打开 Releases 页面。** 这会把完整性、进度和安装全部交给用户，无法提供所需的应用内更新流程。

**递归删除便携目录。** 应用不能假定可执行文件旁边的所有文件都属于产品，因此不能无条件递归删除。

**从 Git 工作树更新。** 已安装应用是构建产物而不是开发 checkout，Git 更新也无法安全替换正在运行的 Electron 安装。

## 后果

打包后的 Windows 客户端可以手动检查、下载和安装兼容的公开 Release。控制器关闭启动检查、后台下载以及普通应用退出时的自动安装。普通浏览器客户端不暴露更新页面或 updater 命令。

安装版升级使用 NSIS 替换。便携版迁移只会在安装后的目标版本写入回执后删除清单拥有且未被修改的文件；未知文件、字节变化、reparse point、版本不匹配或安装失败时保留旧目录。`%APPDATA%\DeepSeek Harness` 位于应用替换与清理范围之外，因此设置、已保存凭据、会话、缓存、浏览器状态和日志继续可用。

发布工作流只接受严格等于 `v<apps/desktop package version>` 的标签，并且只使用 GitHub 工作流 token。源码提交不包含模型凭据、`.env`、用户数据、日志、缓存或本地 Release 二进制。

目录打包会验证 `afterPack` 完成时已经存在的文件；NSIS Release 打包还要求存在 `app-update.yml`。拆分这两份清单可让解包 smoke 构建正常完成，同时继续对可分发安装包的更新元数据执行失败即停止的检查。

未签名安装包可能触发 Windows 信誉警告。GitHub 可用性和公开 API 限制可能导致检查或下载失败，但不会影响当前运行的应用。无法证明所有权或安装成功时，保守清理会保留旧便携目录供用户手动删除。最终的 Windows 双版本安装升级仍属于发布时 smoke，因为它需要两个经过明确版本设置的 NSIS fixture。
