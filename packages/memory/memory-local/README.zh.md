# @deepseek-ai/dsh-memory-local

[English](README.md) | 中文

基于 `native_memory` storage domain 的本地 `ctx.memory` Provider。它持久化启用状态和有界用户/项目记录，根据规范化的 Session 绝对 `cwd` 派生项目身份，串行执行变更、拒绝重复内容，并在持久化前阻止疑似凭证、临时路径和原始日志内容。单条和总量限制均按 Unicode code point 计数。

## 配置

| 键 | 默认值 | 含义 |
| --- | ---: | --- |
| `maxUserItems` | `80` | 全局用户记录上限 |
| `maxProjectItems` | `120` | 单个项目身份的记录上限 |
| `maxItemChars` | `1200` | 单条记录的 Unicode code point 上限 |
| `maxUserChars` | `12000` | 用户记录的 Unicode code point 总上限 |
| `maxProjectChars` | `18000` | 单个项目记录的 Unicode code point 总上限 |

## 模型体验

通过 `@deepseek-ai/dsh-tool-memory` 间接影响；本 Provider 不贡献提示词或 schema。

#### KV Cache 影响

无直接影响；只有 Consumer 读取存储变化时才会影响请求。

## 已知限制与暂缓事项

- **基于模式的安全分类** — 对疑似凭证、临时路径和原始日志采用保守拒绝；语义分类会产生额外模型调用，因此暂缓。
- **单 Host 进程持久化** — JSON 存储后端不提供跨进程写锁，因此配置的存储目录必须由一个 Harness Host 独占。
