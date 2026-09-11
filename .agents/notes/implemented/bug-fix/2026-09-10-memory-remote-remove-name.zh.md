# Agent Note: 记忆 Remote 删除方法名

Status: implemented

[English](2026-09-10-memory-remote-remove-name.md) | 中文

## Problem

Client Remote gateway 会把每个生成的命名空间暴露为 Cordis service。名为 `remove` 的生成方法会与继承的 service 生命周期方法冲突，导致完整浏览器 Remote assembly 挂载失败，并阻止 Web 客户端启动。

## Decision

记忆 Host Remote 将记录删除导出为 `memory/removeRecord`。提供方无关的 `MemoryService.remove()`、provider 操作、Settings controller 方法和用户可见删除操作保留各自的领域名称；只有生成的浏览器传输方法避开 Cordis service 生命周期命名空间。

Client Remote assembly 测试会在真实 gateway 上挂载全部选中的生成 contribution，并断言 `remote.memory.removeRecord` 可用。这样可以在打包桌面端或浏览器构建之前发现方法冲突。

## Alternatives considered

**在所有层统一重命名记忆删除操作。** 冲突只存在于生成的 Client 命名空间 service。重命名 provider 和 Settings API 会把传输层特有的框架限制扩散到领域 API。

**允许生成方法覆盖 service 原型成员。** 覆盖 Cordis 生命周期方法会使命名空间卸载语义不明确，并可能破坏使用同名方法的所有生成 Remote service。

## Consequences

- 浏览器 wire 方法为 `memory/removeRecord`；内部记忆删除仍为 `remove`。
- 如果任何选中的 Remote 方法与其命名空间 service 冲突，真实 Client assembly 会在测试中失败。
- Remote 方法名必须避开继承的 Cordis service 成员。
