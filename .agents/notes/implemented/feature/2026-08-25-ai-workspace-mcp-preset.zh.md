# Agent Note: standard preset 中经过认证的 AI Workspace MCP

Status: implemented

[English](2026-08-25-ai-workspace-mcp-preset.md) | 中文

## 问题

AI Workspace 需要让 Harness 对话读取和修改日历、待办、笔记、文档与私有知识数据，同时不能把 Supabase 凭据或 NAS 路径暴露给智能体。MCP 工具 annotations 只描述意图，属于远端元数据；如果把 `readOnlyHint` 或 `destructiveHint` 当成执行权限，缺失或错误的 annotation 就可能绕过用户审批。

## 决策

当部署配置 `AI_WORKSPACE_MCP_URL` 时，已发布的 `standard` preset 会在稳定的 `workbench` namespace 下有条件地挂载一个经过认证的 `@deepseek-ai/dsh-mcp-client` 实例。它把 `HARNESS_TOOL_SECRET` 作为 bearer 凭据发送，并使用 `failOnStartupError: true`；因此已配置的 Workbench 部署在发现或认证不可用时会拒绝激活，而不是静默启动一个缺少业务工具的会话。

数据归属仍在 Harness 之外。Gateway 暴露私有 MCP endpoint，把经过认证的请求转发给 AI Workspace 工具 API，且绝不向 Harness 提供 Supabase service 凭据或知识存储路径。Web app resolver manifest 持有 MCP client 依赖，因为已发布 preset composition 中的裸插件名通过这一 assembled deployment 解析。

写入权限在本地强制执行。`approvalRequiredTools` 列出 Workbench server 暴露的全部日历、待办、笔记和文档修改工具。MCP client 把这些原始名称映射为带 server 限定的公开名称，并安装 scoped `tools/pre-execute` 策略。下游 deny 或 ask 决定继续具有权威；其余原本允许且匹配的调用会在 `tools/call` 发出任何网络请求之前变成审批请求。MCP annotations 只保留为展示提示。

## 曾考虑的替代方案

**信任 MCP annotations 来决定审批。** 不采用：annotations 来自远端 server，属于可选提示，不是 Harness 的强制执行决定。

**把 Supabase 和 NAS 凭据直接交给 Harness。** 不采用：智能体进程不需要数据库或文件系统权限；按 owner 限定的 Workspace API 已经提供更窄的能力。

**发布一个单独的精简 Workbench preset。** 不采用：嵌入式助手用完整 Harness 界面替换原生助手，既有 standard preset 已经持有部署所需的完整交互、审批和工具栈。

## 后果

同一个嵌入式 Harness 界面可以同时使用完整 coding-agent 体验和按 owner 限定的 Workbench 工具。读取工具正常执行，修改工具会产生既有用户审批交互，并在没有审批通道时 fail closed。未配置 `AI_WORKSPACE_MCP_URL` 的部署继续使用普通 standard preset，不依赖外部服务。Workspace server 每增加一个写工具都必须同步更新显式修改名单；为了换取本地且可审查的执行权限，这项维护成本被接受。
