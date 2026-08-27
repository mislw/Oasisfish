# @deepseek-ai/dsh-skill-search-local

[English](README.md) | 中文

`ctx.skillSearch` 的目录型本地 Provider。它把发现限制在已声明的 Skill 资源根目录内，按源位置切分 Markdown 和文本，持久化事务式 SQLite FTS/向量索引，使用经过清单校验的本地 Transformers.js 模型生成向量，并返回确定性的混合检索结果。

## Plugin

插件要求显式配置 `databasePath` 和 `modelRoot`。注册前会校验模型清单、禁止远程模型下载并检查 SQLite FTS5；这些资源不可用时插件加载失败。Provider 只接受目录型 Skill 资源。

索引刷新会比较文档元数据和 SHA-256，只为变化的 chunk 生成向量，并在一个事务中发布源记录、词法记录、向量、删除项和模型身份。发现、分块、向量生成、取消或写入失败时，最后一个完整 revision 保持不变。

## Config

chunk 目标长度、硬上限、重叠、向量批量大小、词法/向量候选上限、RRF `k`、标题/路径加权、MMR lambda、默认结果数和最大结果数都是经过校验的配置字段。`maxResultCount` 不能超过模型工具上限 10。语料根目录、扩展名、文件字节、语料字节和 chunk 上限由 `@deepseek-ai/dsh-skill-search` 声明拥有。

## 隐私

源文本、词法 token、向量、查询和 SQLite 记录均保留在本机。Provider 不发起 HTTP 请求，也不读取聊天模型 Provider 的凭据。诊断不会输出查询或源文本。

## 模型体验

通过 `@deepseek-ai/dsh-tool-skill-search` 等 Consumer 间接产生。

#### KV Cache 影响

Provider 自身不添加模型上下文，因此会保留已有的可复用前缀。Consumer 决定检索段落是否追加新后缀。

## 已知限制与后续工作

- 仅支持目录型 Markdown 和文本语料。
- 对有上限的语料执行精确余弦检索，不包含近似向量索引或学习式 reranker。
- 索引状态通过搜索和诊断观察，不提供后台重建或状态 API。
