---
description: "LLM（大语言模型）能力包组：一个提供方无关的模型调用服务、提供方适配器、提供方路由熔断、请求重试执行，以及具备回放感知的 token 计量。"
kind: "package-group"
---

# llm/ — LLM 能力家族

[English](README.md) | 中文

## 概述

llm 组把提供方无关的流式服务与适配器、请求元数据、路由健康、恢复和计量组合在一起。`llm` 定义共享的消息、内容块与 `StreamChunk` 词汇。提供方适配器翻译协议格式；DeepSeek 扩展增加具有生命周期归属的请求元数据；`llm-circuit-breaker` 在执行提供方 I/O 前拒绝暂时不健康的路由；`llm-retry` 在持久 agent（智能体）步骤边界重跑失败请求；`token-meter` 从持久日志测量请求与上下文压力。本页列出包组组成；每个包 README 负责自己的包级约定。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 职责 | ctx key |
|---|---|---|
| [`llm/`](llm/README.zh.md) | 通过已注册的提供方适配器流式发起一次模型调用，并共享 harness 的消息、块与分片词汇 | `ctx.llm` |
| [`llm-deepseek/`](llm-deepseek/README.zh.md) | 以 DeepSeek chat-completions 直连、thinking 与图片输入服务 `deepseek-official` 路由 | 注册到 `ctx.llm` |
| [`llm-pi-ai/`](llm-pi-ai/README.zh.md) | 通过 pi-ai 目录与协议格式服务配置的提供方路由，包括手工声明的网关 | 注册到 `ctx.llm` |
| [`deepseek-llm-api-extensions/`](deepseek-llm-api-extensions/README.zh.md) | 在官方 DeepSeek 请求上注册具有生命周期归属的顶层字段 | `ctx.deepseekLlmApiExtensions` |
| [`plugin-package-inventory-deepseek/`](plugin-package-inventory-deepseek/README.zh.md) | 为官方 DeepSeek 请求贡献当前启用的 Loader 包清单 | 贡献 `dsh_plugin_packages` |
| [`llm-circuit-breaker/`](llm-circuit-breaker/README.zh.md) | 在执行提供方 I/O 前拒绝不健康提供方路由的调用，并允许一个恢复探测 | 监听 `llm/stream` |
| [`llm-retry/`](llm-retry/README.zh.md) | 在持久 agent 步骤边界上按各提供方策略重试失败的模型请求 | 监听 `agent/request-error` |
| [`token-meter/`](token-meter/README.zh.md) | 用固定启发式规则从持久会话日志测量请求与上下文压力 | `ctx.tokenMeter` |

-----

<a id="related-documentation"></a>
## 相关文档

- [LLM 流式子系统](../../docs/subsystems/llm-streaming.zh.md)——消息与块类型、组装后的模型请求、`StreamChunk` 协议与适配器约定（adapter contract）。
- [Token 计量子系统](../../docs/subsystems/token-meter.zh.md)——`ctx.tokenMeter` 背后的测量语义。
- [孪生 LLM 适配器](../../.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.zh.md)——为什么 DeepSeek 路由交付两个结构不同的适配器。
- [按路由的模型上下文](../../.agents/notes/implemented/architecture/2026-07-20-routed-model-context-and-compaction-policy.zh.md)——loop 如何路由模型请求并压缩上下文。

<a id="dev-note"></a>
## 开发备注

无。
