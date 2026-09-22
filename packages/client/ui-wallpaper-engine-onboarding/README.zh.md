---
description: "本地化 Desktop 引导；当上游集成没有已保存配置时打开 Wallpaper Engine 设置。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-wallpaper-engine-onboarding

[English](README.md) | 中文

## 概述

当集成报告没有已保存设置时，本包会提示 Desktop 用户配置 Wallpaper Engine。用户通过一个主操作打开现有的 Wallpaper Engine 设置分区。已经配置的 Desktop 不显示任何界面并直接继续。设置路由不可用时，本包记录一条有界诊断并释放当前引导遍历，使后续步骤仍可到达；之后的应用进程会再次探测。

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

Desktop Wallpaper Engine bundle 会在上游插件旁挂载本包；直接 composition 也可以添加同一个 Client row：

```yaml
- id: ui-wallpaper-engine-onboarding
  name: '@deepseek-ai/dsh-client-ui-wallpaper-engine-onboarding'
```

该插件没有配置字段。它等待 `settings.onboarding` slot，读取 `GET /wallpaper-engine/settings`，并且仅在响应含有自身属性 `settings: null` 时显示提示。任何非数组 settings 对象（包括空对象）都视为已配置。

选择 **打开 Wallpaper Engine 设置** 会先完成当前引导步骤，再打开 `wallpaper-engine` 设置分区。加载时不显示阻塞界面。探测失败时也会在记录一条警告后完成本次进程内步骤；因为本包不存储确认记录，下一个应用进程会再次探测上游路由。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

浏览器插件注册类型化中英文字典，并以 order `100` 贡献一个 root-scoped 引导 row。每次 locale 变化都会用新的分离文案快照替换该 row。挂载的组件启动一个可中止请求，等待期间不渲染内容，并保护警告与完成操作，使两者最多各发生一次。可见模态框拥有 `#root` 的 inert 状态、聚焦标题、拒绝隐式关闭，并在导航到设置前调用完成操作。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/client/probe.ts`](src/client/probe.ts) | 响应校验与有界就绪诊断 |
| [`src/client/WallpaperOnboarding.tsx`](src/client/WallpaperOnboarding.tsx) | 请求生命周期、完成操作、模态框与主操作 |
| [`src/client/index.ts`](src/client/index.ts) | locale 所有权与引导注册 |
| [`src/client/locales.ts`](src/client/locales.ts) | 类型化中英文界面文案 |
| — | 不发布运行时不变量伴生入口，因为本包不拥有跨插件可变关系。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [设置界面](../ui-settings/README.zh.md)——引导协调器与设置分区约定。
- [客户端包映射](../README.zh.md)——相邻的浏览器 UI 包。
- [Desktop 应用](../../../apps/desktop/README.zh.md)——承载该集成的应用 composition。

-----

<a id="model-experience"></a>
## 模型体验

### 浏览器引导

#### 模型看到的内容

看不到来自 `settings.onboarding` 的任何内容；设置响应、警告诊断与本地化提示只留在浏览器中。

#### Token 影响

无；本包不注册 prompt 分区、工具 schema 或 Session 事件。

#### KV Cache 影响

无；本包不改变模型请求或其缓存键。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制把设置所有权留给上游设置页面，并防止一个可选集成阻塞其他引导步骤。

- **需要 Desktop 路由**——如果 composition 不提供 `/wallpaper-engine/settings` 且不注册 `wallpaper-engine` 分区，探测会记录警告并直接完成，不显示提示。
- **不提供内联配置**——提示只负责导航；壁纸选择与播放控件由上游设置分区拥有。
- **进程内失败释放**——路由与 payload 失败不会持久化确认记录，因此新的应用进程会重试探测。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
