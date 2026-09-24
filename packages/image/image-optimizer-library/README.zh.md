---
description: "供确定性提示词准备使用的离线、完整性校验图像模板与案例元数据。"
kind: "package-reference"
---

# @deepseek-ai/dsh-image-optimizer-library

[English](README.md) | 中文

## 概述

图像优化可以在不访问网络或调用辅助模型的情况下选择随包指导。此 Provider（提供方）在激活时校验固定 commit 的规范化快照，解析显式 ID，并对类别、风格、场景、意图和双语元数据执行确定性匹配。随包 bootstrap（引导）快照只包含 DSH 自有的全局回退；经审查的同步可以增加获准再分发的模板和仅含元数据的上游案例，绝不包含未获授权的案例提示词或图片。

## 目录

- [使用本包](#use-this-package)
- [同步经审查的 checkout](#synchronize-a-reviewed-checkout)
- [了解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

将此提供方与 `@deepseek-ai/dsh-image-optimizer` 一同挂载。显式 `templateId` 和 `caseIds` 按精确 ID 解析。自动匹配使用规范化的类别、风格、场景、意图、英文和中文元数据；匹配成功时会保留请求的类别别名，使优化器能够选择该类别模板。没有导入记录匹配时，DSH 自有的 `general-image` 模板始终以零分提供。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-image-optimizer-library'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `assetRoot` | 包内的 `assets/` | 包含六个规范化资源的绝对目录。 |

相对路径、额外或缺失资源、schema（模式）或引用失败、计数差异、哈希或字节数差异、缺少许可证来源、未获许可的提示词再分发，以及不一致的 bootstrap 或已审查 checkout 声明都会导致激活失败。卸载插件会移除其提供方贡献。

-----

<a id="synchronize-a-reviewed-checkout"></a>
## 同步经审查的 checkout

离线同步器接受一个绝对路径的完整干净 checkout、一个绝对路径且不重叠的输出目录，以及该 checkout 的小写 40 位十六进制 `HEAD`。checkout 的 origin 必须是 `freestylefly/awesome-gpt-image-2`，并且一个 `origin/*` 远端跟踪引用必须包含所提供的 commit。commit 参数记录操作员的审查决定；这些离线检查不建立上游密码学真实性。同步器读取 `LICENSE`、`data/style-library.json` 和 `data/cases.json`，忽略无关的已跟踪站点、文档和图片内容，并拒绝无效 UTF-8、未知字段、重复 ID、断裂引用、路径穿越、可执行文件引用、固定 Git 对象缺失和非常规引用文件。

```powershell
$sourceRoot = (Resolve-Path $env:DSH_IMAGE_LIBRARY_SOURCE).Path
$commit = (git -C $sourceRoot rev-parse HEAD).Trim()
pnpm --filter @deepseek-ai/dsh-image-optimizer-library run sync --source $sourceRoot --output packages/image/image-optimizer-library/assets --commit $commit
```

同步器在同级临时目录中暂存全部六个资源，校验完整暂存快照，并仅在校验成功后替换目标目录。替换期间，它会在目标目录旁保留 `.<output-name>.backup`。如果进程在移走先前快照后停止，下次调用会先恢复该备份，再校验源 checkout；如果新快照已经安装，下次调用会删除保留的备份。它输出稳定 JSON、SHA-256 哈希、字节数、资源计数、固定 commit 的记录 URL、准确的上游许可证文件和 DSH 自有回退模板。上游案例的来源记录使用 `NOASSERTION` 时只保留元数据：除非记录了明确再分发授权并为此审查 adapter，否则绝不输出案例提示词、提示词预览或图片。提交替换快照前，必须审查所提供的 commit 和每个输出来源。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现细节——点击展开</summary>

激活过程会在注册前同步读取全部资源、校验清单，并构建私有不可变候选项映射和规范化 token（词元）索引。匹配会去重规范化查询词，并使用有界整数层级，保证类别匹配高于风格、风格高于场景、场景高于关键词或意图匹配。提供方与候选项的同分排序使用与区域设置无关的序数顺序。运行时代码不读取上游路径、网络资源、凭据或模型服务。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 资源校验、提供方注册、解析和匹配。 |
| [`src/sync-upstream.ts`](src/sync-upstream.ts) | 经审查 checkout 的校验与确定性规范化。 |
| [`scripts/sync-upstream.ts`](scripts/sync-upstream.ts) | 同步器的命令行入口。 |
| [`assets/`](assets/) | 可替换的规范化快照与上游许可证来源记录。 |
| — | 不发布运行时不变量伴随入口：激活过程从同一组已校验的不可变资源派生全部索引，优化器注册表负责贡献生命周期。 |

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [图像优化器](../image-optimizer/README.zh.md)——请求校验、提供方排序和规范编译。
- [图像优化子系统](../../../docs/subsystems/image-optimization.zh.md)——共享类型和能力所有权。

-----

<a id="model-experience"></a>
## 模型体验

### 选中的模板和案例

#### 模型看到的内容

选中的记录会向优化器的规范提示词贡献由数据决定的构图、视觉风格、场景、保留和规避行。包内 `general-image` 回退模板贡献 `Use a clear focal hierarchy around the requested subject.`、`requested subject identity`、`unrequested text` 和 `watermarks`。来源证据和必需能力保留在已准备结果中。

#### Token 影响

此影响以优化器选择为条件，并受优化器完整已准备结果的字节限制约束。此提供方不添加独立提示词分区，也不调用模型。

#### KV 缓存影响

选中的片段占用优化器已有的请求位置。请求、选中记录 ID 和快照内容保持不变时，缓存复用保持稳定；其中任何一项变化都可能使受影响的请求后缀失效。仅挂载此提供方不会增加模型可见文本。

## 已知限制与暂缓事项

<a id="known-limitations-and-deferred-work"></a>

- 由于没有可用的完整经审查 checkout，已提交的 bootstrap 快照包含零个导入的上游模板和零个导入的上游案例；在同步替换它之前，匹配保持通用。
- 同步过程会省略全部上游案例提示词和提示词预览，因为当前案例记录不含明确的再分发授权，并且绝不导入图片。
- 严格适配器面向上游 `data/style-library.json` 和 `data/cases.json`；schema 或引用路径变化需要操作员审查同步器更新。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
