# Agent Note: 移除产品内测声明

Status: implemented

[English](2026-09-06-remove-product-internal-testing-notice.md) | 中文

## 问题

强制内测声明会在每个新桌面 profile 或 loopback profile 进入工作区之前阻塞用户。其测试阶段文案不再表达应用要求的操作或选择，而版本化确认机制只为关闭这份文案增加了一次 settings 读取、一次写入、弹窗状态和仅浏览器使用的回退行为。

## 决策

组装后的产品不在 `settings.onboarding` 中注册内测声明。`ui-settings-models` 只持有“模型与中转站”设置页，不持有产品 onboarding 文案、确认状态或弹窗展示。缺少提供方凭据仍不会阻塞启动，用户会经 composer 模型菜单前往“模型与中转站”。

Host 继续在用户设置中接受 `ui-onboarding.welcomeNoticeVersion`，使现有 `settings.yaml` 升级后仍可通过校验。已发布的 client 不会读取、写入或根据该保留字段分支。通用 `settings.onboarding` slot 及其协调器仍供未来步骤使用，但新步骤必须有独立且充分的用户操作理由。

## 曾考虑的替代方案

**隐藏弹窗，但保留其注册和确认实现。** 不予采用，因为被隐藏的产品策略仍会执行私有状态操作，并保留可能意外重新出现的死代码、测试和文案。

**自动确认当前声明版本。** 不予采用，因为自动写入会在没有产品价值的情况下修改用户设置，且启动流程仍会与过时字段耦合。

**立即移除 `ui-onboarding` namespace 和字段。** 不予采用，因为现有用户文档可能包含 `welcomeNoticeVersion`；保留 schema 接受能力可避免升级时校验失败，又不会恢复任何运行时行为。

## 后果

新旧 profile 都会直接进入应用，不显示内测声明，也不写入确认状态。模型配置、已存凭据、用户工作区、自动更新和通用 onboarding 扩展点均不受影响。包测试会固定 `ui-settings-models` 不注册 onboarding 步骤，无 Key 的 Chromium 场景则会验证模型配置之前的启动界面可交互。
