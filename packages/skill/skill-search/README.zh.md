# @deepseek-ai/dsh-skill-search

[English](README.md) | 中文

用于搜索显式声明 Skill 语料的 Provider 中立注册表。

本包拥有 `ctx.skillSearch`。它通过 `ctx.skills` 解析胜出的 Skill，执行模型调用策略，匹配显式语料声明，并把检索交给作用域内的 Provider。本包不读取文件、不创建向量、不持久化索引，也不注册模型工具。

## 服务：`SkillSearchRegistry`（ctx key：`skillSearch`）

`ctx.skillSearch.registerProvider(create)` 在调用 Context 的作用域层注册 Provider。同步工厂接收该注册拥有的取消信号。同一层中的 Provider 名必须唯一；返回的 Cordis disposer 会注销 Provider 并中止该信号。

`ctx.skillSearch.search(request, options)` 使用调用方的 `cwd`、`scope` 和 `signal` 解析 Skill，对加载后的定义再次检查 `modelInvocable`，解析匹配的已配置语料，并选择第一个 `supports(corpus)` 返回 true 的可见 Provider。结果包含相对源路径、标题链、从 1 开始的行范围、摘录和分数。

## Config

`corpora` 是显式声明数组。每项声明一个 Skill、可选的胜出 Skill Provider、相对资源根目录、允许的扩展名、单文件/总字节上限和 chunk 上限。部署必须声明每个可搜索语料；本服务不会隐式扫描 Skill。

## 错误

`SkillSearchError.code` 区分未知或禁止模型调用的 Skill、缺少声明、不支持的资源、语料上限、不可读来源、模型不可用和取消。Provider 应保留这些类别，不能把全部失败转成空结果。

## 模型体验

通过 `@deepseek-ai/dsh-tool-skill-search` 等工具 Consumer 间接产生。本服务自身不生成提示词或工具结果。

#### KV Cache 影响

无直接影响。Consumer 决定检索段落如何进入持久 transcript。

## 已知限制与后续工作

- **语料声明由部署拥有** - 本版本中 Skill frontmatter 不能自行选择加入索引。
- **Provider 诊断只属于单次操作** - 注册表不提供 Provider 清单或后台语料状态 API。
- **选择首个支持语料的 Provider** - 一个作用域不能为同一语料聚合多个 Provider 的结果。
