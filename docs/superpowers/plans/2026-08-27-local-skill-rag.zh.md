# 本地 Skill RAG 实施计划

[English](2026-08-27-local-skill-rag.md) | 中文

> **供智能体执行者使用：** 必须使用子 Skill：通过 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 逐项执行本计划。步骤使用复选框（`- [ ]`）跟踪。

**目标：** 为显式声明的 Skill 知识语料增加完全本地、可持久化的混合检索能力，并在 Windows 桌面版中为内置 `oasis-wiki` 默认启用。

**架构：** 三个 Cordis 插件角色在不修改 `agent-loop` 的情况下实现能力：`skill-search` 负责分层 Provider 注册表和公共类型，`skill-search-local` 负责目录索引与检索，`tool-skill-search` 暴露可持久记录的模型工具 `skill_search`。Windows 桌面版把固定 revision 的 Transformers.js ONNX 模型放在不可变内置 Skill 旁边，提供显式模型/缓存路径，并通过打包后的真实应用验证检索。

**技术栈：** TypeScript ESM、Cordis、Schemastery、带 FTS5 的 `node:sqlite`、带 GFM 的 `mdast-util-from-markdown`、`@huggingface/transformers@4.2.0`、Vitest、无密钥 snapshot fixture、Electron Builder。

**规格：** [本地 Skill RAG 设计](../specs/2026-08-27-local-skill-rag-design.zh.md)

## 全局约束

- 不修改 `agent-loop`；新行为必须使用 Skill、工具和 Session 扩展点。
- 只索引显式声明且基于目录的语料；桌面版声明 `oasis-wiki`、根目录 `references`、扩展名 `.md` 和 `.txt`。
- 保持 revision `885cbf5` 的内置 `oasis-wiki` 快照逐字节不变；配置、模型文件和检索代码位于快照外。
- 源文本、查询、词法 token、向量和索引全部留在本机；检索包不得调用 HTTP 或复用聊天 Provider 凭据。
- 固定 `Xenova/bge-small-zh-v1.5` revision `75c43b069aac4d136ba6bc1122f995fedcfd2781`，并按批准的 SHA-256 manifest 校验全部 staging 文件。
- 默认分块目标为 800 Unicode 码点、硬上限 1,200、重叠 120；默认结果数为 5，工具接受 1 到 10。
- 语料、候选、融合、MMR、批大小、字节和分块限制都必须是校验后的 `Config`，不得藏在执行方法的常量中。
- 每个公共模块和导出都补齐简洁 JSDoc；源契约变化时同步更新包 README 和 subsystem 文档。
- 每项实施任务都按 RED、GREEN、聚焦验证、提交执行。用户未要求时不得 push。
- 非平凡已实现决策必须包含中英双语 implemented Agent Note 和可运行的无密钥 snapshot。

---

### 任务 1：Skill Search 服务定义

**文件：**
- 新建：`packages/skill/skill-search/package.json`
- 新建：`packages/skill/skill-search/tsconfig.json`
- 新建：`packages/skill/skill-search/src/index.ts`
- 新建：`packages/skill/skill-search/src/invariant.ts`
- 新建：`packages/skill/skill-search/tests/skill-search.spec.ts`
- 新建：`packages/skill/skill-search/README.md`
- 新建：`packages/skill/skill-search/README.zh.md`
- 新建：`packages/skill/skill-search/README.i18n.yaml`
- 修改：`packages/skill/README.md`
- 修改：`packages/skill/README.zh.md`
- 修改：`docs/subsystems/skills.md`
- 修改：`docs/subsystems/skills.zh.md`

**接口：**
- 产出：`SkillCorpusSpec`、`ResolvedSkillCorpus`、`SkillSearchRequest`、`SkillSearchResult`、`SkillSearchHit`、`SkillSearchErrorCode`、`SkillSearchProvider` 和 `SkillSearchProviderControl`。
- 产出：`ctx.skillSearch.registerProvider(create)` 和 `ctx.skillSearch.search(request, options)`。
- 使用：`ctx.skills.get(name, { cwd, scope, signal })`、`SkillDefinition.resourceBase` 和 `isModelInvocable`。

- [ ] **步骤 1：先写失败的注册表与解析测试**

覆盖全局/作用域 Provider 优先级、同层重名、Provider 注销、取消信号传递、未知 Skill、禁止模型调用的 Skill、未声明语料、不支持的资源基址以及成功的目录语料解析。

```ts
const result = await scoped.ctx.skillSearch.search(
  { name: 'fixture-skill', query: '角色复活', limit: 5 },
  { cwd: fixtureRoot, scope, signal: AbortSignal.timeout(1_000) },
)
expect(result.hits[0]).toMatchObject({ skill: 'fixture-skill', path: 'references/respawn.md' })
```

- [ ] **步骤 2：运行聚焦测试并确认缺包失败**

运行：`pnpm vitest run packages/skill/skill-search/tests/skill-search.spec.ts`

预期：失败，因为 `@deepseek-ai/dsh-skill-search` 和 `ctx.skillSearch` 尚不存在。

- [ ] **步骤 3：定义公共请求、语料、结果和错误类型**

使用 branded `SkillCorpusId`；语料包含 `skill`、`roots`、`extensions`、`maxFileBytes`、`maxCorpusBytes` 和 `maxChunks`；结果返回相对 POSIX 路径、标题链、从 1 开始的行号、原始摘录和稳定分数。使用带标签的 `SkillSearchError`，区分 `UNKNOWN_SKILL`、`NOT_MODEL_INVOCABLE`、`CORPUS_UNDECLARED`、`UNSUPPORTED_RESOURCE_BASE`、`CORPUS_LIMIT`、`SOURCE_UNREADABLE`、`MODEL_UNAVAILABLE` 和 `ABORTED`。

- [ ] **步骤 4：实现分层 Provider 注册表和语料解析**

复用 `SkillRegistry` 的所有权模式：注册是 `ctx.effect()` effect，作用域层覆盖全局层，同层 Provider 名唯一，注销会中止 Provider 工作。`search()` 以调用方 cwd/scope/signal 加载胜出的 Skill，加载后再次检查模型调用策略，解析对应 Skill/Provider 的已配置语料，并只分派给 `supports()` 接受该语料的 Provider。

- [ ] **步骤 5：增加包 invariant 和双语契约**

Invariant 检查真实拥有关系：注册搜索 Provider 后，`ctx.skillSearch` 能为匹配的已声明语料解析该 Provider。文档说明作用域行为、支持的资源基址、取消、错误码，以及服务定义本身不执行索引。

- [ ] **步骤 6：聚焦验证并提交**

运行：`pnpm vitest run packages/skill/skill-search/tests/skill-search.spec.ts`

运行：`pnpm run verify-export-jsdoc -- packages/skill/skill-search`

```powershell
git add packages/skill/skill-search packages/skill/README.md packages/skill/README.zh.md docs/subsystems/skills.md docs/subsystems/skills.zh.md
git commit -m "feat(skill): define skill search capability"
```

### 任务 2：受限语料发现和标题感知分块

**文件：**
- 新建：`packages/skill/skill-search-local/package.json`
- 新建：`packages/skill/skill-search-local/tsconfig.json`
- 新建：`packages/skill/skill-search-local/src/corpus.ts`
- 新建：`packages/skill/skill-search-local/src/chunk.ts`
- 新建：`packages/skill/skill-search-local/src/lexical.ts`
- 新建：`packages/skill/skill-search-local/tests/corpus.spec.ts`
- 新建：`packages/skill/skill-search-local/tests/chunk.spec.ts`
- 新建：`packages/skill/skill-search-local/tests/lexical.spec.ts`

**接口：**
- 产出：`discoverCorpus(corpus, signal): Promise<DiscoveredDocument[]>`。
- 产出：`chunkDocument(document, options): SourceChunk[]`。
- 产出：`lexicalTokenStream(text): string`。
- 使用：任务 1 的 `ResolvedSkillCorpus` 以及已配置的分块/文件/语料上限。

- [ ] **步骤 1：先写失败的路径限制与发现测试**

覆盖规范化根目录、扩展名过滤、确定性排序、绝对根路径、`..` 穿越、文件和目录符号链接逃逸、junction/reparse point 逃逸、不可读文件、单文件字节上限、总字节上限和遍历取消。测试必须证明仅声明 `references` 时不会包含 `scripts`、`tests` 和二进制资源。

- [ ] **步骤 2：运行语料测试并确认缺实现**

运行：`pnpm vitest run packages/skill/skill-search-local/tests/corpus.spec.ts`

预期：失败，因为 `discoverCorpus` 尚不存在。

- [ ] **步骤 3：实现 realpath 受限的确定性发现**

只解析一次 Skill 资源目录，解析并 realpath 每个声明根目录和发现文件，要求所有解析路径都留在基址下，并拒绝 reparse point 而不是跟随。返回规范化相对 POSIX 路径、字节数、mtime、SHA-256 和 UTF-8 文本。在目录读取、文件读取和 hash 前调用 `signal.throwIfAborted()`。

- [ ] **步骤 4：先写失败的 Markdown/文本分块测试**

覆盖标题链、段落、列表、GFM 表格、围栏代码块、纯文本段落、从 1 开始的行范围、800 目标、1,200 上限、120 码点文本重叠、完整代码围栏、稳定 chunk ID 和不含 tokenizer 前缀的原文摘录。

- [ ] **步骤 5：解析 Markdown 并实现分块**

使用 `mdast-util-from-markdown`、`mdast-util-gfm` 和 `micromark-extension-gfm` 及其 source position。把块节点转成有序且带行号的片段，携带当前标题层级，允许单个围栏代码块在配置硬上限内保持完整，并从规范化路径、行范围和内容 SHA-256 派生 `chunkId`。

- [ ] **步骤 6：编写并实现 CJK 词法 token 测试**

断言 Unicode 规范化、小写 Latin 单词 token、CJK 单字、重叠双字、移除标点、确定性空格和不修改源摘录。

```ts
expect(lexicalTokenStream('角色 Respawn 复活')).toBe('角 色 角色 respawn 复 活 复活')
```

- [ ] **步骤 7：聚焦验证并提交**

运行：`pnpm vitest run packages/skill/skill-search-local/tests/corpus.spec.ts packages/skill/skill-search-local/tests/chunk.spec.ts packages/skill/skill-search-local/tests/lexical.spec.ts`

```powershell
git add packages/skill/skill-search-local
git commit -m "feat(skill-search): parse local skill corpora"
```

### 任务 3：事务式 SQLite 索引

**文件：**
- 新建：`packages/skill/skill-search-local/src/schema.ts`
- 新建：`packages/skill/skill-search-local/src/store.ts`
- 新建：`packages/skill/skill-search-local/tests/store.spec.ts`

**接口：**
- 产出：`SKILL_SEARCH_SCHEMA_VERSION` 和 `openSkillSearchStore(path)`。
- 产出：`SkillSearchStore.refresh(corpus, documents, embed, signal)`、`lexicalCandidates`、`vectorRows`、`modelIdentity` 和 `close`。
- 使用：`DiscoveredDocument`、`SourceChunk`、词法 token 流、归一化 `Float32Array` 向量以及语料/模型身份值。

- [ ] **步骤 1：先写失败的 schema 与刷新测试**

覆盖新数据库、FTS5 不可用、`PRAGMA user_version` 不兼容、语料身份隔离、首次构建、未变文件复用、变更文件替换、删除文件清理、小端向量往返、嵌入失败后的事务回滚、取消回滚和活动工作结束后的关闭。

- [ ] **步骤 2：运行 store 测试并确认缺 schema/store**

运行：`pnpm vitest run packages/skill/skill-search-local/tests/store.spec.ts`

预期：失败，因为 store 模块尚不存在。

- [ ] **步骤 3：建立单调 schema 和加载时检查**

延迟加载 `node:sqlite`，以用户私有权限创建父目录和数据库文件，启用外键和 WAL，通过临时虚拟表检查 FTS5，拒绝除 `SKILL_SEARCH_SCHEMA_VERSION` 外的所有非零版本，并仅在全部表完成后写版本。建立 corpora、documents、chunks、vectors、model identity 表，以及以 chunk 行为键的 external-content FTS5 表。

- [ ] **步骤 4：实现完整批次事务刷新**

先比较 size 和 mtime，再以 SHA-256 确认文件未变；在开启写事务前准备好全部变更 chunk 和嵌入；之后在一个事务中替换变更文档、删除移除文档、更新 FTS/向量并推进语料 revision。解析、模型、上限或取消失败时，最后一个完整 revision 仍可读取。

- [ ] **步骤 5：串行刷新并让注销等待**

每个 corpus key 维护一条进程内 Promise 链。新查询等待当前刷新；调用方取消不会破坏共享工作，插件注销则中止自身刷新、等待结束、释放 statement 并只关闭数据库一次。

- [ ] **步骤 6：聚焦验证并提交**

运行：`pnpm vitest run packages/skill/skill-search-local/tests/store.spec.ts`

```powershell
git add packages/skill/skill-search-local/src/schema.ts packages/skill/skill-search-local/src/store.ts packages/skill/skill-search-local/tests/store.spec.ts
git commit -m "feat(skill-search): persist local hybrid index"
```

### 任务 4：本地 Embedder 和混合检索

**文件：**
- 新建：`packages/skill/skill-search-local/src/embedder.ts`
- 新建：`packages/skill/skill-search-local/src/retrieval.ts`
- 新建：`packages/skill/skill-search-local/tests/embedder.spec.ts`
- 新建：`packages/skill/skill-search-local/tests/retrieval.spec.ts`

**接口：**
- 产出：带 `identity`、`embedDocuments(texts, signal)`、`embedQuery(text, signal)` 和 `dispose()` 的 `SkillSearchEmbedder`。
- 产出：`TransformersJsEmbedder` 和 `DeterministicFixtureEmbedder`。
- 产出：`retrieve(store, query, options, embedder, signal): Promise<SkillSearchHit[]>`。
- 使用：任务 3 的 FTS BM25 行和归一化向量行。

- [ ] **步骤 1：先写失败的 Embedder 契约测试**

验证文档批处理、查询只嵌入一次、有限维度、L2 归一化、模型身份、调用方取消、Transformers.js 仅本地环境设置、缺失模型文件、manifest 不匹配和幂等注销。只 mock Transformers.js pipeline factory，不进行网络请求。

- [ ] **步骤 2：运行 Embedder 测试并确认缺实现**

运行：`pnpm vitest run packages/skill/skill-search-local/tests/embedder.spec.ts`

预期：失败，因为 Embedder 契约和实现尚不存在。

- [ ] **步骤 3：实现确定性与 Transformers.js Embedder**

创建 pipeline 前设置 `env.allowRemoteModels = false` 和 `env.localModelPath = modelRoot`。以 `local_files_only: true`、`device: 'cpu'`、`dtype: 'q8'` 加载 `feature-extraction`，并以 `{ pooling: 'mean', normalize: true }` 调用 extractor。加载前校验不可变模型 manifest，通过 Config 限制 batch size，诊断不得包含查询或源文本。

- [ ] **步骤 4：先写失败的混合排序测试**

覆盖有界 BM25 候选、精确余弦候选、RRF、精确标题/路径加权、确定性同分排序、MMR 重复消减、相邻 chunk 多样性、1 到 10 的限制、空结果和未变索引/查询的稳定顺序。

- [ ] **步骤 5：实现 BM25、精确余弦、RRF、加权和 MMR**

用规范化 token 流查询 FTS，对全部已存归一化向量做精确点积，以可配置 RRF `k` 融合两个列表，增加有界标题/路径词项加权，再以可配置 MMR lambda 选择最终行。同分依次按融合分数、路径、起始行和 chunk ID 排序。

- [ ] **步骤 6：聚焦验证并提交**

运行：`pnpm vitest run packages/skill/skill-search-local/tests/embedder.spec.ts packages/skill/skill-search-local/tests/retrieval.spec.ts`

```powershell
git add packages/skill/skill-search-local/src/embedder.ts packages/skill/skill-search-local/src/retrieval.ts packages/skill/skill-search-local/tests
git commit -m "feat(skill-search): add local hybrid retrieval"
```

### 任务 5：本地 Provider 插件和模型工具

**文件：**
- 新建：`packages/skill/skill-search-local/src/provider.ts`
- 新建：`packages/skill/skill-search-local/src/index.ts`
- 新建：`packages/skill/skill-search-local/src/invariant.ts`
- 新建：`packages/skill/skill-search-local/tests/provider.spec.ts`
- 新建：`packages/skill/skill-search-local/README.md`
- 新建：`packages/skill/skill-search-local/README.zh.md`
- 新建：`packages/skill/skill-search-local/README.i18n.yaml`
- 新建：`packages/skill/tool-skill-search/package.json`
- 新建：`packages/skill/tool-skill-search/tsconfig.json`
- 新建：`packages/skill/tool-skill-search/src/index.ts`
- 新建：`packages/skill/tool-skill-search/src/invariant.ts`
- 新建：`packages/skill/tool-skill-search/tests/tool-skill-search.spec.ts`
- 新建：`packages/skill/tool-skill-search/README.md`
- 新建：`packages/skill/tool-skill-search/README.zh.md`
- 新建：`packages/skill/tool-skill-search/README.i18n.yaml`

**接口：**
- 产出：带已校验语料/索引/模型/检索 Config 的 Cordis 插件 `skill-search-local`。
- 产出：模型工具 `skill_search({ name, query, limit? })`。
- 使用：任务 1 到 4、`ctx.tools`、调用方 scope/cwd 和 `GenericCallView.locations`/`GenericResultView.locations`。

- [ ] **步骤 1：先写失败的组装 Provider 测试**

挂载真实 Skill 注册表和 filesystem Provider，使用 fixture 目录、确定性 Embedder 和临时 SQLite 路径。验证首次查询索引、第二次查询复用、增量替换、语料上限错误、失败刷新保留旧索引、取消和 Provider 注销。

- [ ] **步骤 2：运行 Provider 测试并确认缺插件**

运行：`pnpm vitest run packages/skill/skill-search-local/tests/provider.spec.ts`

预期：失败，因为 Cordis Provider 插件尚不存在。

- [ ] **步骤 3：实现已校验 Config 和 Provider 编排**

Config 包含语料声明、数据库路径、模型根目录/manifest、分块目标/上限/重叠、文件/语料/chunk 上限、嵌入 batch size、词法/向量候选上限、RRF `k`、标题/路径加权、MMR lambda 和默认/最大结果数。加载时拒绝重复语料、无效扩展名、缺少 SQLite FTS5、缺失模型资源、无效数值关系和不可写缓存父目录。

- [ ] **步骤 4：先写失败的工具 schema、render 和 presentation 测试**

验证精确 JSON schema、默认 limit 5、拒绝 1 到 10 之外的值、模型调用策略、相对引用、行范围、空结果指引、不同结构化错误、不出现绝对路径以及纯可回放 presentation。调用视图使用 `{ card: 'generic', kind: 'search' }`，结果视图为每个 hit 列出 `locations`。

- [ ] **步骤 5：实现 `skill_search` 和 Session 兼容输出**

注册 `defineTool`，输出 schema 包含检索 Skill、规范化结果数和 hits。模型文本使用简洁 Markdown，包含 `path:start-end`、标题链和摘录。`presentCall` 标明 Skill/查询，`presentResult` 返回 generic search 卡片和相对 `FileLocation[]`。依靠现有 tools/agent-loop 路径记录普通 `tool/call` 和 `tool/result` 事件及可回放 presentation metadata，不添加合成消息。

- [ ] **步骤 6：增加 invariant、双语包契约和聚焦测试**

运行：`pnpm vitest run packages/skill/skill-search-local/tests packages/skill/tool-skill-search/tests`

运行：`pnpm run verify-package-invariants -- packages/skill/skill-search-local packages/skill/tool-skill-search`

- [ ] **步骤 7：提交 Provider 和工具**

```powershell
git add packages/skill/skill-search-local packages/skill/tool-skill-search
git commit -m "feat(skill-search): expose local search tool"
```

### 任务 6：Bundle 组合、持久 transcript 和文档

**文件：**
- 修改：`packages/bundle/base/package.json`
- 修改：`packages/bundle/base/cordis.patch.yml`
- 修改：`apps/cli/config/agent-presets/standard/agent.cordis.yml`
- 修改：`packages/bundle/web-app/package.json`
- 修改：`packages/bundle/headless/package.json`
- 修改：`apps/cli/tests/fixtures/desktop-oasis-wiki/cordis.yml`
- 修改：`apps/cli/tests/fixtures/desktop-oasis-wiki/snapshot.ts`
- 修改：`apps/cli/tests/desktop-oasis-wiki.snapshot.ts`
- 新建：`.agents/notes/implemented/feature/2026-08-27-local-skill-rag.md`
- 新建：`.agents/notes/implemented/feature/2026-08-27-local-skill-rag.zh.md`
- 新建：`.agents/notes/implemented/feature/2026-08-27-local-skill-rag.i18n.yaml`
- 修改：`docs/architecture.md`
- 修改：`docs/architecture.zh.md`
- 通过生成器修改：`docs/tool-catalog.md`
- 通过生成器修改：`docs/config-catalog.md`

**接口：**
- 产出：host plane 的 `skill-search` 注册表和标准 preset 中按 agent 注册的 `tool-skill-search`。
- 产出：从环境提供的不可变 Skill/模型路径和可变缓存路径生成的桌面 Oasis 语料声明。
- 使用：任务 5 的完整包。

- [ ] **步骤 1：先写失败的无密钥组装 snapshot**

扩展现有桌面 Oasis fixture，通过 `ctx.tools.execute` 加载 `oasis-wiki` 并用中文查询调用 `skill_search`，序列化持久 `tool/call` 和 `tool/result` transcript。仅由测试 overlay 选择确定性 fixture Embedder；断言所有来源都以 `references/` 开头并带行号。

- [ ] **步骤 2：运行 snapshot 并确认组合缺失**

运行：`pnpm run test:snapshot -- -t "desktop-bundled skill search"`

预期：失败，因为 bundle 和 preset 尚未挂载三个检索角色。

- [ ] **步骤 3：增加包依赖和 Cordis 行**

让 `skill-search` 服务定义和 `skill-search-local` Provider 留在 host plane。标准 agent preset 将 `tool-skill-search` 与 `tool-skill` 一起挂载，使工具注册受调用 agent scope 限制。部署配置中显式声明 Oasis 语料，不读取或修改 Skill frontmatter 来推断。

- [ ] **步骤 4：录制并回放无密钥 snapshot**

运行：`pnpm run test:snapshot:record -- -t "desktop-bundled skill search"`

运行：`pnpm run test:snapshot -- -t "desktop-bundled skill search"`

预期：以稳定中文查询、相对引用、普通持久工具事件通过，且不需要模型/网络凭据。

- [ ] **步骤 5：编写 implemented Agent Note 和当前状态文档**

记录为何检索必须显式且本地、为何分离服务定义/Provider/工具、为何语料必须 opt-in、为何有界 Skill 语料可使用精确余弦，以及为何拒绝自动注入、中转站嵌入、隐式全 Skill 扫描和学习式 reranker。更新 architecture 和 Skill subsystem 文档，不重复包级 Config 表。

- [ ] **步骤 6：重新生成目录和双语配对记录**

运行：`pnpm run gen-tool-catalog`

运行：`pnpm run gen-config-catalog`

对每个变更的双语文件运行定向 `verify-translation-pairing --write`。

- [ ] **步骤 7：运行相关检查并提交**

运行：`pnpm vitest run packages/bundle/base packages/bundle/web-app packages/bundle/headless apps/cli/tests/desktop-oasis-wiki.snapshot.ts`

运行：`pnpm run typecheck`

运行：`pnpm run lint`

运行：`pnpm run doc-sync`

```powershell
git add packages/bundle apps/cli/config/agent-presets apps/cli/tests .agents/notes/implemented/feature docs
git commit -m "feat(bundle): enable local skill rag"
```

### 任务 7：桌面模型资源和 staging 校验

**文件：**
- 新建：`apps/desktop/bundled-models/bge-small-zh-v1.5/model-manifest.json`
- 新建：`apps/desktop/bundled-models/bge-small-zh-v1.5/LICENSE`
- 增加二进制资源：`apps/desktop/bundled-models/bge-small-zh-v1.5/config.json`
- 增加二进制资源：`apps/desktop/bundled-models/bge-small-zh-v1.5/onnx/model_quantized.onnx`
- 增加二进制资源：`apps/desktop/bundled-models/bge-small-zh-v1.5/special_tokens_map.json`
- 增加二进制资源：`apps/desktop/bundled-models/bge-small-zh-v1.5/tokenizer_config.json`
- 增加二进制资源：`apps/desktop/bundled-models/bge-small-zh-v1.5/tokenizer.json`
- 增加二进制资源：`apps/desktop/bundled-models/bge-small-zh-v1.5/vocab.txt`
- 修改：`apps/desktop/electron-builder.yml`
- 修改：`apps/desktop/src/environment.ts`
- 修改：`apps/desktop/tests/environment.spec.ts`
- 修改：`apps/desktop/scripts/staged-inventory.mjs`
- 修改：`apps/desktop/tests/staged-inventory.spec.ts`
- 新建：`apps/desktop/scripts/verify-model-resources.mjs`
- 新建：`apps/desktop/tests/model-resources.spec.ts`
- 修改：`apps/desktop/README.md`
- 修改：`apps/desktop/README.zh.md`
- 修改：`apps/desktop/RUNTIME_NOTICES.md`

**接口：**
- 产出：不可变打包模型根目录 `resources/models/bge-small-zh-v1.5`。
- 产出：子进程环境变量 `DSH_SKILL_SEARCH_MODEL_DIR` 和 `DSH_SKILL_SEARCH_CACHE_DIR`。
- 使用：任务 4 的模型 manifest 契约和桌面路径/环境构造。

- [ ] **步骤 1：先写失败的环境和模型 manifest 测试**

断言精确模型/缓存路径、继承环境不变、必需文件清单、固定仓库/revision/license、六个批准的 SHA-256、缺失/篡改文件拒绝以及模型资源下存在任何 reparse point 时拒绝。

- [ ] **步骤 2：运行桌面测试并确认资源缺失**

运行：`pnpm vitest run apps/desktop/tests/environment.spec.ts apps/desktop/tests/model-resources.spec.ts apps/desktop/tests/staged-inventory.spec.ts`

预期：失败，因为模型资源、环境变量和校验器尚不存在。

- [ ] **步骤 3：staging 批准的仅本地模型快照**

加入 revision `75c43b069aac4d136ba6bc1122f995fedcfd2781` 的精确 `Xenova/bge-small-zh-v1.5` 文件。Manifest 记录上游 `BAAI/bge-small-zh-v1.5`、MIT、Transformers.js `4.2.0` 和以下 hash：`config.json` `d4193ead3a810fd694fa8a31d7fc72fbaebc0668b603e398734bf2f6538ff42f`；`onnx/model_quantized.onnx` `15b717c382bcb518ba457b93ea6850ede7f4f1cd8937454aa06972366cd19bcc`；`special_tokens_map.json` `b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3`；`tokenizer_config.json` `e6f3b96db926a37d4039995fbf5ad17de158dfb8f6343d607e4dbaad18d75f5a`；`tokenizer.json` `48cea5d44424912a6fd1ea647bf4fe50b55ab8b1e5879c3275f80e339e8fae26`；`vocab.txt` `45bbac6b341c319adc98a532532882e91a9cefc0329aa57bac9ae761c27b291c`。

- [ ] **步骤 4：增加 Electron 资源、子进程路径和 staging 校验**

把 `bundled-models` 复制到 `resources/models`，模型目录指向不可变资源路径，缓存目录位于桌面用户数据下，扩展 staging inventory，打包前校验 hash，并让两条路径都不进入全局 `PATH` 和用户 Skill 目录。

- [ ] **步骤 5：运行桌面验证并提交**

运行：`pnpm vitest run apps/desktop/tests`

运行：`pnpm --dir apps/desktop run stage:verify`

```powershell
git add apps/desktop
git commit -m "build(desktop): bundle local embedding model"
```

### 任务 8：打包检索冒烟、安装和运行验收

**文件：**
- 修改：`apps/desktop/scripts/smoke-unpacked.mjs`
- 修改：`apps/desktop/tests/smoke-unpacked.spec.ts`
- 生成输出：`apps/desktop/release/**` 保持为未跟踪发布产物。

**接口：**
- 使用：组装应用、真实 ONNX 模型、内置 `oasis-wiki`、持久缓存和桌面 supervisor。
- 产出：首次构建与重启复用的解包/已安装运行证据。

- [ ] **步骤 1：先写失败的打包检索冒烟测试**

抽取 helper，通过正常 Web profile 和全新桌面用户数据目录调用打包 Harness，经 loopback API 创建 Session、加载 `oasis-wiki`、执行一次中文 `skill_search` 并检查相对 `references/` 结果。使用同一用户数据目录重启，断言语料身份相同且持久索引可继续使用。

- [ ] **步骤 2：运行聚焦冒烟测试并确认缺少检索阶段**

运行：`pnpm vitest run apps/desktop/tests/smoke-unpacked.spec.ts`

预期：失败，因为当前冒烟只验证启动，未执行 `skill_search`。

- [ ] **步骤 3：扩展解包冒烟验证**

保留现有工具/运行时、reparse point、HTTP 200、不打开默认浏览器、存活和关闭检查。启动前增加模型 manifest 校验，执行真实中文检索，证明全部引用位于已声明 Oasis 语料中，以同一缓存重启一次，并在桌面/Harness 进程未完整退出时失败。

- [ ] **步骤 4：运行 `dsh-pre-push-checks` 选择的仓库检查**

使用 `.agents/skills/dsh-pre-push-checks/SKILL.md`；只运行最终 diff 所需的聚焦包、snapshot、文档、build、hygiene 和 packed path 检查。打包前运行 `git diff --check`。

- [ ] **步骤 5：构建并验证解包应用**

运行：`pnpm --dir apps/desktop run package:dir`

运行：`pnpm --dir apps/desktop run smoke:unpacked`

预期：真实本地模型加载、中文 Oasis 结果、重启复用、HTTP 200、零 reparse point 和完整进程退出。

- [ ] **步骤 6：构建、安装、启动并手工验证 Windows 安装包**

运行：`pnpm --dir apps/desktop run package`

计算安装包 SHA-256，关闭旧安装应用，安装新的 x64 包，启动后打开一个 Session、加载 `oasis-wiki`、提出一个需要 `skill_search` 的 Oasis API 问题并检查返回引用；重启应用后重复检索，再关闭窗口。确认已安装 Electron 和 Harness 子进程均退出。

- [ ] **步骤 7：检查最终源码和发布状态**

运行：`git status --short --branch`

分别报告：源码已实现状态、提交、打包产物、安装包路径/hash、已安装版本/路径、自动解包验证、手工安装版验证和任何既有无关检查失败。不得宣称已 push 或已发布。
