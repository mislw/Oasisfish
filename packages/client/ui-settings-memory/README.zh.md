---
description: "通过类型化 memory Remote 查看和维护持久用户记忆与当前项目记忆的 Web 设置控件。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-memory

[English](README.md) | 中文

## 概述

使用本包可从 Web 设置中查看和维护持久记忆。页面按用户与当前项目分组记录，支持启用、新增、行内编辑和幂等删除，并在变更失败时保留草稿。项目操作跟随 main view 保留的 Session；该 Session 没有 `cwd` 时项目操作不可用。关闭记忆会保留记录与管理控件，但会停止向未来模型请求添加快照。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 Web Loader roster 中，将本包与 Settings shell、renderer、locale service、生成的 Remote aggregate 和 Host memory service 一起挂载。已发布的 Web bundle 提供该 composition 与本地 memory Provider。

### 何时选择

用户需要在不调用模型工具的情况下显式控制持久记忆时，选择本页面。当需要浏览任意路径或跨窗口实时同步时不要选择本页面；页面有意跟随一个所选 Session，并通过类型化 Host Remote 重新加载。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-client-ui-settings-memory'
```

本包没有配置字段。其 Client half 需要 `settings.section` slot、locale 与 renderer service、Session 快照和生成的 `remote.memory` namespace。

### 用户可见行为

页面加载 main-view Session `cwd` 的有效记录，分开显示用户与项目 scope，并在没有当前目录时禁用项目 scope。读取失败时可以重试；新增或编辑失败时保留当前草稿和最后一次成功快照。删除路径为幂等操作，因此删除已经不存在的记录仍会成功。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节 — 点击展开</summary>

Host entry 有意不产生副作用，因为 memory Service 拥有 Remote 方法。Client entry 注册本地化文案和一个 `settings.section` slot，`MemorySettingsStore` 则串行执行 Remote 操作，在失败期间保留最后一次成功的记录集合，并在较新的项目加载开始后抑制陈旧状态写入，同时仍报告 Host 是否已提交该变更。组件读取 renderer 拥有的 Session 快照，并选择 main view 保留的条目，而不维护另一份 Session 订阅。

| 文件 | 作用 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | locale、store 和 Settings-slot 注册 |
| [`src/client/store.ts`](src/client/store.ts) | 类型化 Remote controller 与操作状态 |
| [`src/client/MemorySection.tsx`](src/client/MemorySection.tsx) | scope 选择、记录、草稿与命令 |
| [`tests/remote.client.spec.ts`](tests/remote.client.spec.ts) | 真实 Web composition 和生成的 Remote 行为 |

</details>

-----

<a id="further-exploration"></a>
## 进一步阅读

- [ui-settings](../ui-settings/README.zh.md) — Settings slot 与 section ownership 模型。
- [ui-settings-general](../ui-settings-general/README.zh.md) — 渲染 feature-owned section 的 shell。
- [memory service](../../memory/memory/README.zh.md) — 通过 Remote 暴露的类型化 Host 操作。
- [tool-memory](../../memory/tool-memory/README.zh.md) — 面向模型的工具和已记录的上下文 consumer。
- [Slots reference](../../../docs/subsystems/slots.zh.md) — renderer 拥有的 hook、store 与 injected value。

-----

<a id="model-experience"></a>
## 模型体验

无；本页面只渲染浏览器记忆控件，不注册面向模型的提示词、schema、工具或消息。

#### KV Cache 影响

无；本包既不组装也不发送 Provider 请求。

## 已知限制与暂缓事项

<a id="known-limitations-and-deferred-work"></a>

这些限制说明页面能够选择的范围及其刷新时机。

- **按当前 Session 选择项目** — 页面只能管理 main view 保留的 Session 所派生的项目 scope，不能浏览任意文件系统路径的记录。
- **没有跨窗口推送更新** — 其他窗口的记忆变更会在页面重载或所选 Session 变化后出现；memory service 不为本页面发布 revision 事件。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>

**运行时 invariant：** 本包不发布运行时 invariant companion；页面只读取一个生成的 Remote namespace 和一个由 renderer 维护的 Session 快照，不维护独立的运行时投影。
