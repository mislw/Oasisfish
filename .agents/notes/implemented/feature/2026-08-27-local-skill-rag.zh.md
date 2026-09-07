# Agent Note: 已声明 Skill 语料的本地检索

Status: implemented

[English](2026-08-27-local-skill-rag.md) | 中文

## Problem

目录型 Skill 可以携带大量 API 与工作流参考资料，但在一个模型轮次中加载整个知识目录会浪费上下文，也会让原文选择过程不透明。Windows 打包应用还必须能在全新机器上工作，不依赖 Embedding 端点或额外运行环境，也不能把 Skill 内容披露给模型中转站。

## Decision

Skill 知识检索是一项由三个插件角色构成的显式本地能力。`dsh-skill-search` 负责 `ctx.skillSearch`、语料声明、Skill 解析、提供方选择、取消与结构化错误。`dsh-skill-search-local` 负责受限目录发现、携带标题链的分块、持久化 SQLite 索引、本地 Embedding 和混合排序。`dsh-tool-skill-search` 负责作用域化的模型工具 `skill_search` 及其持久工具结果。

语料由部署方声明，而不是从 Skill 内容中推断。每项声明包含一个 Skill、可选提供方、相对根目录、扩展名与资源上限。Windows 桌面版分别声明内置 `oasis-wiki` 和 `ai-image-prompts` 的 `references` 目录及其上限。提供方把每个原文解析在已加载 Skill 的目录资源基址之下，并拒绝路径穿越、reparse point、不支持的资源类型及超出配置上限的内容。启用检索不会修改不可变的 Skill 快照。

本地提供方把原始摘录、支持 CJK 的 FTS5 词项和规范化 Embedding 存入一个事务化 SQLite 索引。刷新会在提交前准备完整的变更批次，因此取消、解析失败或模型失败会保留上一版完整 revision。检索通过 reciprocal-rank fusion 融合有界的 BM25 与精确余弦排序，应用有界的标题和路径加权，并使用 maximal marginal relevance 减少重复结果。语料字节和分块上限限制了受支持数据集，因此精确余弦足以满足需求。

桌面版内置固定 revision 的量化 ONNX 模型，并禁用 Transformers.js 远程模型加载。`modelRoot` 直接指向包含 manifest 及其声明文件的目录；manifest 中的 `modelId` 保持为持久模型身份，不会再次追加到该路径。原文、查询文本、token、Embedding 与索引均留在本地，绝不会复用提供方或中转站凭据。首次查询会在桌面用户数据目录中创建或刷新索引；后续启动复用兼容的已提交数据。

`skill_search` 是显式工具，不会在每次模型请求前自动注入检索内容。它的调用与结果使用普通的 Session `tool/call` 与 `tool/result` 事件，其中包含相对路径和从 1 开始的行区间。模型可以先加载 Skill，在 API 或事实问题需要参考资料时执行检索并引用返回原文，无需新增 agent-loop 路径或合成上下文事件。

## Verification

单元测试覆盖受限发现、Markdown 与文本分块、CJK 词法项、本地模型校验、事务刷新、取消、混合排序、提供方 dispose（资源释放）和结构化工具错误。无密钥的组装 snapshot 加载两个内置 Skill，并分别对 Oasis 参考资料和生图提示词视觉配方记录真实的 `skill_search` 调用与结果。桌面 staging 校验固定模型的 manifest 与哈希；打包 smoke 使用真实 ONNX 模型启动应用、执行中文 Oasis 查询、使用同一个用户数据目录重启，并确认持久索引仍可使用。

## Alternatives considered

**自动扫描每个 Skill 的全部资源目录。** 不采用，因为 Skill 包可能包含脚本、测试、美术资产、凭据或无关文件。显式声明能让部署所有者审查语料并强制执行上限。

**把 Embedding 请求发送到已配置的模型中转站。** 不采用，因为这会增加端点兼容性、凭据、配额、网络可用性和新的内容披露，也会使桌面应用失去自包含能力。

**只使用词法检索。** 不采用，因为 BM25 适合精确 API 名称，而中文近义表达与相关概念需要语义检索。词法检索仍作为混合结果的一项排序输入。

**在每次模型请求前自动注入检索结果。** 不采用，因为查询选择和无关上下文会成为隐藏的模型可见行为，并需要额外的持久事件。显式工具使检索过程可观察、可取消。

**增加学习型 reranker 或 approximate nearest-neighbor 索引。** 不采用，因为有界的 Skill 语料不值得增加另一个模型、索引格式或生命周期。reciprocal-rank fusion、精确余弦与 maximal marginal relevance 能在声明上限内提供确定性的本地排序。

## Consequences

打包后的 agent 无需独立服务、联网下载或向中转站披露内容，即可检索 Oasis 知识库和生图提示词视觉配方，并且每条返回片段都能在持久 transcript 中定位原文。部署方必须声明每项可检索语料，并提供不可变模型资源与可变缓存存储。首次查询需要承担本地建索引开销，安装包会增加固定模型的体积；不受支持或过大的语料会明确失败，不会退化为隐式的全目录扫描。
