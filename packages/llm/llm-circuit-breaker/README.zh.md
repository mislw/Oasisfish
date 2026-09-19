---
description: "配置进程内提供方路由熔断，包括暂时性失败阈值、打开时长与恢复探测。"
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-circuit-breaker

[English](README.md) | 中文

## 概述

挂载 `@deepseek-ai/dsh-llm-circuit-breaker`，可在某条提供方路由持续失败时停止重复流量。默认连续出现 6 次已配置的暂时性失败后，该路由会打开 30 秒；之后只允许一个请求探测恢复，并发请求会在不执行提供方 I/O 的情况下收到 `CIRCUIT_OPEN`。状态由一个 Host 进程内的所有调用共享，并在插件重载或进程重启时重置。重试和超时仍由独立策略负责。

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

将本插件与 `dsh-llm` 一起挂载；`base` 与 `sdk-minimal` 组合包已默认启用它。

### 何时选择

当一个 Host 内跨会话与 agent 的请求不应继续反复访问不可用的提供方路由时选择它。不需要熔断策略的组合可以移除该配置项。`dsh-llm-retry` 仍负责 agent 步骤重试，提供方流超时设置仍负责停滞请求。

### 最小配置

```yaml
- id: llm-circuit-breaker
  name: '@deepseek-ai/dsh-llm-circuit-breaker'
  config:
    failureThreshold: 6
    openDurationMs: 30000
    failureCodes: [EMPTY_RESPONSE, RATE_LIMIT, SERVER, TIMEOUT, TRANSPORT]
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `failureThreshold` | `6` | 打开一条提供方路由所需的连续已配置失败次数 |
| `openDurationMs` | `30000` | 允许一个请求探测该路由前的等待时长 |
| `failureCodes` | 上述 5 个 code | 计入暂时性路由失败的提供方失败 code |

完整字段以生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-llm-circuit-breaker)为准。`ABORTED` 与 `CIRCUIT_OPEN` 不能计作提供方健康失败。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

插件包装 `llm/stream`，因此直接流调用和 agent loop 请求使用同一份路由状态。关闭状态统计终止性的暂时失败；成功会重置连续失败数。打开状态通过一个错误 finish 分片直接拒绝请求。等待结束后，一个同步预留的请求成为半开探测；成功或确定性错误会关闭路由，暂时性失败会重新打开，未得出结果的探测会立即恢复为可探测状态。generation 与 probe 标识阻止迟到的终止结果修改更新后的状态。

本包记录打开、半开与关闭转换日志。它不导出 `./invariant`，因为同一个插件同时拥有私有状态以及改变该状态的全部观察。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 配置校验、准入、流观察与路由转换 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [dsh-llm 服务](../llm/README.zh.md)——提供方路由与原始流扩展点。
- [LLM 重试](../llm-retry/README.zh.md)——持久 agent 步骤请求恢复。
- [LLM 流式子系统](../../../docs/subsystems/llm-streaming.zh.md)——流协议与适配器行为。
- [提供方路由熔断决策](../../../.agents/notes/implemented/architecture/2026-09-19-provider-route-circuit-breaker.zh.md)——状态归属与恢复理由。

-----

<a id="model-experience"></a>
## 模型体验

### 打开状态拒绝

#### 模型看到什么

被拒绝的尝试不会产生模型输入或输出。现有错误呈现会向用户报告 `CIRCUIT_OPEN`，agent 会话通过正常事件保留终止尝试与轮次错误。

#### Token 影响

打开状态拒绝不会执行提供方 I/O，也不消耗提供方 token。获准的探测与普通重试仍是物理提供方请求。

#### KV Cache 影响

本插件不改变提示词内容或请求前缀。被拒绝的调用不会访问提供方缓存。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

以下约束限定本包的首个版本。

- 状态仅存在于进程内，并在 Host 重启或插件重载时重置。
- 不同进程或机器之间不共享路由状态。
- 所有提供方路由使用同一策略；没有逐提供方覆盖。
- 本包不提供状态服务、设置 UI、命令或手动重置。
- 本包不会故障转移到其他提供方或模型。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
