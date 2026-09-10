# Agent Note: 安装自有 profile 解析

Status: implemented

[English](2026-09-09-installation-owned-profile-resolution.md) | 中文

## Problem

随发行版交付的 `web` 与 `headless` profile 把根配置保存在可写的 Harness home 下，但它们挂载的全部组合包和插件都属于已安装的 dsh 应用。若裸插件只从配置目录解析，就必须生成 `$DSH_HOME/profiles/node_modules` 树。在 Windows 上，如果用户数据目录中的 reparse point 无法到达安装卷，每个生成链接都会失效并阻止 Oasisfish 启动，即使安装目录本身已经包含所有必需包。

## Decision

dsh profile 启动器把自身安装锚点作为已安装宿主模块基准传给 `boot`。根 Loader 与根 include 都会先从该宿主解析每个裸包，包括插件之后通过 `loader.create()` 动态创建的条目。安装态根 Loader 还会暴露 `resolvePackageJson(specifier)`，客户端模块扫描器使用该方法，使浏览器启动图描述的安装自有包与 Loader 实际导入的包一致。仅当 Node 报告宿主中不存在请求的顶层包本身时，这些路径才会从原树的模块基准回退解析；宿主包内部缺少依赖、无法访问包元数据导出以及其他解析失败都会保留为已安装包的错误。

`loadProfile` 会报告 profile 是否需要共享模块 fallback。与发行版完全一致且没有 profile 依赖的 `web` 或 `headless` 模板不会修复或写入 `$DSH_HOME/profiles/node_modules`。具有其他组合包元组或任意 profile 依赖的 profile 仍会修复 fallback，使其安装的插件可以共享应用的 Cordis 实例和其他 peer dependency。

## Alternatives considered

**把桌面用户数据移出 AppData。** 这可以避开受影响的文件系统树，但会改变所有桌面安装中设置、凭据、会话和缓存的归属与迁移位置。

**始终复制包树而不是生成链接。** 把完整应用依赖闭包复制到每个 Harness home 会重复占用大量安装空间、增加升级复杂度，并可能让 profile 插件加载不同的 Cordis 实例。

**宿主导入出现任意错误时都回退。** profile 本地包可能由此掩盖损坏的已安装包或其内部缺失的依赖，用另一份代码替代可操作的安装错误。

## Consequences

- 随发行版交付的 profile 启动依赖可读取的安装包与可写的 profile 配置文件，不依赖用户数据目录中的跨卷链接。
- profile 安装的插件仍保留配置目录解析和共享依赖 fallback。
- 安装目录和 profile 同时含有同名包时，已安装包仍具有权威性。
- 即使安装自有 web profile 位于无法解析应用包的用户数据目录中，浏览器启动图仍会包含客户端包。
- 自定义 profile 仍需要 fallback 修复器及其启动协调机制。
