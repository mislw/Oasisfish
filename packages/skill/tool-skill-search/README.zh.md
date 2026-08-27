# @deepseek-ai/dsh-tool-skill-search

[English](README.md) | 中文

基于 `ctx.skillSearch` 的模型工具 Consumer `skill_search`。

## 工具：`skill_search`

工具接收精确的 Skill `name`、非空自然语言或符号 `query`，以及可选的 1 至 10 `limit`，默认值为 5。它使用调用 Agent 的工作目录和作用域解析 Skill，在诊断中保留 `SkillSearchError` code，并返回 Skill、查询、结果数、排名、分数、相对路径、标题链、从 1 开始的行范围和源摘录。

模型可见文本把每条引用格式化为 `path:start-end`。成功但为空的结果会建议使用更窄或同义查询。等待中的 UI 意图是 generic search call；完成结果使用可回放的 search metadata，按相对文件和行号分组。

## 模型体验

### 工具 schema

#### 模型看到的内容

模型会看到生成的 [`skill_search` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-skill-search)。工具描述要求模型先加载 Skill，再为事实或 API 问题搜索已声明语料，并引用返回的相对路径和行范围。

#### Token 影响

在作用域内工具可见的每次请求中产生固定 schema 成本。

#### KV Cache 影响

工具定义和描述不变时，稳定 schema 会保留复用。作用域可见性变化会改变请求工具列表，并可能从该次请求开始使复用失效。

### 工具结果

#### 模型看到的内容

每次成功调用返回由数据决定的相对引用和摘录，或稳定的空结果提示。结构化失败包含 `SkillSearchError` code 和诊断。

#### Token 影响

追加式结果成本随选择的结果数和摘录长度增长。

#### KV Cache 影响

每个持久 `tool/result` 会追加新后缀，不替换之前可复用的 token。查询、limit、来源 revision 或排序变化会改变该追加后缀。

## 已知限制与后续工作

- 每次调用只搜索一个已声明的 Skill 语料，不聚合多个 Skill。
- 不自动注入搜索结果，也不触发后台索引。
- 相对引用依赖所选 Provider 保留源路径和行范围。
