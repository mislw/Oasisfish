---
description: "仅用于 Desktop 的 Wallpaper Engine bundle，把固定版本的上游集成与 DSH 自有首次引导作为一个 profile 层启用。"
kind: "package-bundle"
---

# `@deepseek-ai/dsh-desktop-wallpaper-engine`

[English](README.md) | 中文

## 概述

本 bundle 把 Wallpaper Engine 背景及其本地化首次引导作为一个 profile 选择启用。它插入固定版本 `dsh-plugin-wallpaper-engine@0.7.5` 的 Host 与 Client 包，以及 `@deepseek-ai/dsh-client-ui-wallpaper-engine-onboarding`；禁用该 bundle 会一起移除这两行。它是基于 Web 的 Desktop profile 的可选层，不会改变普通 `web` profile。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 Desktop 自有 profile 中，把 `@deepseek-ai/dsh-desktop-wallpaper-engine` 添加到普通 Web bundle 之后。该层先插入上游壁纸包，再插入引导包。Profile、home 与逐次调用 patch 可以通过两个稳定行 id 禁用或替换对应行：`desktop-wallpaper-engine` 与 `ui-wallpaper-engine-onboarding`。

上游包负责 Wallpaper Engine 探测、HTTP 路由、背景渲染、settings、持久化、上传与媒体处理。第一方引导包只检测上游 settings 对象是否存在，并把未配置用户引导到上游 settings 分区。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 - 点击展开</summary>

本 bundle 是静态 patch 载体。它的单个 insert 恰好添加两行；除了该组合外，本包不拥有服务、事件、可变状态或运行时不变式。每个插入包负责自己的生命周期与清理。

经审查的 pnpm patch 使 Host 的 `settings: null` 响应在 Client inventory 规范化与刷新期间保持持久状态，直至用户更改 settings，同时保留对已有已保存对象的规范化及其通知。该 patch 还把全局样式表归属到 Client 模块 id，并以可中止的插件 effect 管理异步 settings 与 inventory 启动，因此 Loader 释放会移除全局样式，并阻止延迟响应重新应用这些样式。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | 插入固定版本的上游行与第一方引导行 |
| [`../../../patches/dsh-plugin-wallpaper-engine@0.7.5.patch`](../../../patches/dsh-plugin-wallpaper-engine@0.7.5.patch) | 首次使用持久化、样式表归属与启动取消的审查后兼容性改动 |
| [`src/index.ts`](src/index.ts) | 不含运行时 API 的包入口 |
| - | 不发布运行时不变式伴生入口；本包是静态 patch 列表载体，插入的各包负责自己的运行时关系。 |
| [`tests/desktop-wallpaper-engine.spec.ts`](tests/desktop-wallpaper-engine.spec.ts) | 依赖版本、已应用 patch 的产物、组合、顺序、普通 Web 隔离与 Loader 释放检查 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Bundle 包索引](../README.zh.md) - 仓库交付的 profile 层。
- [Wallpaper 引导](../../client/ui-wallpaper-engine-onboarding/README.zh.md) - DSH 负责的本地化首次引导决策。
- [app-boot profile](../../boot/app-boot/README.zh.md) - bundle 解析与有序 patch 组合。

-----

<a id="model-experience"></a>
## 模型体验

无，因为该静态 bundle 只添加浏览器与 Host 行为，不会向模型请求添加内容。

#### KV Cache 影响

本 bundle 不添加请求内容，也不会使原本可复用的模型请求前缀失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **兼容性跟随固定的上游版本** - 更新 `dsh-plugin-wallpaper-engine` 固定版本前，必须针对当前 Desktop Web 应用重新审查 pnpm patch、Host 路由、Client 持久化、注册、全局样式与清理行为。
- **该层需要基于 Web 的 profile** - 不支持把它加入 Headless、SDK、SDK Minimal 或 ACP 组合；这样做不会创建浏览器表层。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 - 点击展开</summary>

无。

</details>
