---
description: "交互式 Web 预览，用于展示拟议的 Codex 委派连接、策略、Workspace 准入与 Session 状态。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-codex-bridge

[English](README.md) | 中文

## 概述

本包让用户在 Host bridge 实现前，先在设置中操作拟议的 Codex 到 Harness 委派流程。它模拟连接、Workspace 准入、执行权限、模型选择、委派任务完成、取消与 Session 展开。它不会创建 MCP 服务、鉴权状态、Session 或 Codex 注册。普通 Web composition 默认禁用该 row；Oasisfish Desktop 开发 profile 与显式 Web 预览 overlay 会启用它。

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

使用预览 overlay 启动 Web profile：

```sh
pnpm dsh web --patch apps/web/tests/codex-bridge-preview.overlay.yml
```

打开设置并选择 **Codex 连接**。页面会明确标为交互预览。连接后可以操作策略控件，再启动演示任务查看运行中、已取消、已完成与展开 Session 等状态。地址是固定的预览文案；复制它不会联系该路由上的服务。

普通 Web profile 包含同一个 `ui-codex-bridge` row，但设置为 `disabled: true`。Web overlay 与应用自带的 Oasisfish Desktop overlay 只把该 row 替换为 `disabled: false`；二者都不会添加 Host 服务或传输配置。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

浏览器插件注册本地化的中英文字典，并贡献一个 root-scoped `settings.section` entry。组件在本地拥有全部预览状态。计时器推进连接与委派任务状态，并在断开连接或卸载时取消；没有状态跨越浏览器进程，也没有状态在重新挂载后保留。Host loader entry 特意保持为空，使 Loader 可以寻址这个可选浏览器包，同时不声称它提供 Host capability。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | 浏览器注册与 locale 所有权 |
| [`src/client/CodexBridgeSection.tsx`](src/client/CodexBridgeSection.tsx) | 预览交互与状态转换 |
| [`src/client/locales.ts`](src/client/locales.ts) | 类型化中英文界面文案 |
| [`apps/web/tests/codex-bridge-preview.overlay.yml`](../../../apps/web/tests/codex-bridge-preview.overlay.yml) | 显式启用 Web 预览 |
| [`apps/desktop-host/oasisfish.cordis.patch.yml`](../../../apps/desktop-host/oasisfish.cordis.patch.yml) | 启用 Oasisfish Desktop 开发预览 |
| — | 不发布运行时不变量伴生入口，因为该预览不拥有跨插件运行时状态。 |

[拟议的可视化 bridge 设计](../../../.agents/notes/proposed/feature/2026-09-20-visual-codex-delegation-bridge.zh.md)负责计划中的 Host 服务、信任、Session 与 Codex 注册设计。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [拟议的可视化 bridge 设计](../../../.agents/notes/proposed/feature/2026-09-20-visual-codex-delegation-bridge.zh.md)——计划中的产品与协议行为。
- [设置界面](../ui-settings/README.zh.md)——该预览填充的 section slot。
- [Web 客户端架构](../../../docs/subsystems/web-client.zh.md)——浏览器插件加载与呈现层。
- [客户端包映射](../README.zh.md)——相邻的浏览器 UI 包。

-----

<a id="model-experience"></a>
## 模型体验

### 交互预览

#### 模型看到的内容

无；该 `settings.section` 预览不发送模型请求，也不创建模型可见的 Session 输入。

#### Token 影响

无；本包不注册 prompt section、tool schema 或模型可见的 Session event。

#### KV Cache 影响

无；本包从不组装或发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制用于区分交互预览与拟议的生产 bridge。

- **没有 MCP Host**——显示的 endpoint 是无效的预览文案；不存在路由、鉴权、健康检查或 Codex 注册。
- **没有持久 Session**——委派任务与展开的 transcript 都是本地样例状态，section 重新挂载后就会消失。
- **没有策略执行**——Workspace、权限、模型与自动委派控件只影响预览显示。
- **桌面宽度的 Settings 外壳**——共享 Settings 导航在手机宽度下仍保持双栏，因此本预览面向上文展示的 Desktop 与普通 Web 布局。
- **仅预览启用**——普通 Web row 保持禁用；Web 预览 overlay 或 Oasisfish Desktop 开发 overlay 可以启用它。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
