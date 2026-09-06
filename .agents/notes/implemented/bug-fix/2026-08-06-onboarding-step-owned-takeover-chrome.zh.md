# Agent Note: 首次使用引导的接管界面框架移入步骤自身

Status: implemented

[English](2026-08-06-onboarding-step-owned-takeover-chrome.md) | 中文

## 问题

设置外壳一旦选中 `settings.onboarding` 条目，就会挂载 onboarding 接管界面框架。注册方可能需要先加载私有事实才能判定是否存在可见内容，并在加载期间渲染 `null`。由外壳持有的界面框架因此可能显示不透明展示层、把 `#root` 置为 `inert` 并阻塞应用，即使当选步骤最终不渲染任何内容。

## 决策

接管界面框架属于注册方，不属于设置外壳。ui-primitives 中的零 Cordis `OnboardingSurface` 原语渲染 portal 到 body 的遮罩和展示层，并在自身挂载生命周期内保持 `#root` 为 `inert`。注册方只把可见分支包进该原语；`null` 分支不绘制也不阻塞任何内容，因为界面框架与内容属于同一次渲染决策。

`SettingsRoot` 投影有序 onboarding 账本，且只渲染当选条目，不增加 portal、展示层或 inert 效果。`settings.onboarding` slot 约定要求注册方持有就绪判定、文案、弹窗行为和可见界面框架。

## 曾考虑的替代方案

**只在私有就绪判定完成后注册条目。** 不予采用，因为每项功能都需要增加响应式注册与 dispose 接线，只为使未判定内容保持不可见。

**让外壳检测空的已渲染 slot。** 不予采用，因为 `renderSlot` 返回 outlet 与注册方最终的 React 输出无关；DOM 探测需要先发生一次可见提交，外壳才能撤回界面框架。

**保留外壳持有的界面框架并增加加载状态。** 不予采用，因为私有读取不能证明步骤一定需要用户操作，加载界面框架仍会为最终无内容的条目阻塞应用。

## 后果

已挂载但尚未判定的步骤会让应用保持可见且可交互。未来注册方如需阻塞式流程，必须用 `OnboardingSurface` 包裹可见内容；未使用该包裹时，其内容不会获得遮罩或 inert 所有权。`packages/client/ui-primitives/tests/onboarding-surface.client.spec.tsx` 固定原语的生命周期，`packages/client/ui-settings-general/tests/settings-root.client.spec.tsx` 固定外壳不渲染接管界面框架的行为。
