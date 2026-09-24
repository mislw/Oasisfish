---
description: "Offline, integrity-checked image template and case metadata for deterministic prompt preparation."
kind: "package-reference"
---

# @deepseek-ai/dsh-image-optimizer-library

English | [中文](README.zh.md)

## Summary

Image optimization can select packaged guidance without network access or auxiliary model calls. This Provider validates a commit-pinned normalized snapshot at activation, resolves explicit IDs, and matches category, style, scene, intent, and bilingual metadata deterministically. The shipped bootstrap contains only the DSH-owned global fallback; reviewed synchronization may add redistributable templates and metadata-only upstream cases, never unlicensed case prompts or images.

## Table of Contents

- [Use this package](#use-this-package)
- [Synchronize a reviewed checkout](#synchronize-a-reviewed-checkout)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this Provider beside `@deepseek-ai/dsh-image-optimizer`. Explicit `templateId` and `caseIds` resolve by exact ID. Automatic matching uses normalized category, style, scene, intent, English, and Chinese metadata; it preserves a matching request category alias so the optimizer can select the category template. The DSH-owned `general-image` template remains available at score zero when no imported record matches.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-image-optimizer-library'
```

| Field | Default | Meaning |
|---|---|---|
| `assetRoot` | Packaged `assets/` | Absolute directory containing the six normalized resources. |

Activation rejects relative paths, extra or missing resources, schema or reference failures, count differences, hash or byte-count differences, missing license source records, unsafe prompt redistribution, and inconsistent bootstrap or reviewed-checkout declarations. Disposing the plugin removes its Provider contribution.

-----

<a id="synchronize-a-reviewed-checkout"></a>
## Synchronize a reviewed checkout

The offline synchronizer accepts an absolute complete clean checkout, an absolute non-overlapping output directory, and the checkout's lowercase 40-hex `HEAD`. The checkout origin must be `freestylefly/awesome-gpt-image-2`, and an `origin/*` remote-tracking ref must contain the supplied commit. The commit argument records the operator's review decision; these offline checks do not establish cryptographic upstream authenticity. The synchronizer reads `LICENSE`, `data/style-library.json`, and `data/cases.json`, ignores unrelated tracked site, documentation, and image content, and rejects invalid UTF-8, unknown fields, duplicate IDs, broken references, traversal, executable references, missing pinned Git objects, and non-regular referenced files.

```powershell
$sourceRoot = (Resolve-Path $env:DSH_IMAGE_LIBRARY_SOURCE).Path
$commit = (git -C $sourceRoot rev-parse HEAD).Trim()
pnpm --filter @deepseek-ai/dsh-image-optimizer-library run sync --source $sourceRoot --output packages/image/image-optimizer-library/assets --commit $commit
```

The synchronizer stages all six resources in a sibling temporary directory, validates the complete staged snapshot, and replaces the destination only after validation succeeds. It reserves `.<output-name>.backup` beside the destination during replacement. If a process stops after moving the prior snapshot, the next invocation restores that backup before validating the source checkout; if the new snapshot was already installed, the next invocation removes the retained backup. It emits stable JSON, SHA-256 hashes, byte counts, resource counts, commit-pinned record URLs, the exact upstream license file, and the DSH-owned fallback. Upstream cases are metadata-only while their source records use `NOASSERTION`: case prompts, prompt previews, and images are never emitted unless an explicit redistribution grant is recorded and the adapter is reviewed for it. Review the supplied commit and every emitted source before committing the replacement snapshot.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Activation reads all resources synchronously before registration, verifies their manifest, and builds private immutable candidate maps and normalized token indexes. Matching deduplicates normalized query terms and uses bounded integer tiers that guarantee category matches rank above style, style above scene, and scene above keyword or intent matches. Provider and candidate ties use locale-independent ordinal ordering. Runtime code reads no upstream path, network resource, credential, or model service.

| File | Responsibility |
|---|---|
| [`src/index.ts`](src/index.ts) | Asset validation, Provider registration, resolution, and matching. |
| [`src/sync-upstream.ts`](src/sync-upstream.ts) | Reviewed-checkout validation and deterministic normalization. |
| [`scripts/sync-upstream.ts`](scripts/sync-upstream.ts) | Command-line entry for the synchronizer. |
| [`assets/`](assets/) | Replaceable normalized snapshot and upstream license source record. |
| — | No runtime invariant companion is published: activation derives every index from the same validated immutable resources, and the optimizer registry owns contribution lifecycle. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Image optimizer](../image-optimizer/README.md) — request validation, Provider ordering, and specification compilation.
- [Image optimization subsystem](../../../docs/subsystems/image-optimization.md) — shared types and capability ownership.

-----

<a id="model-experience"></a>
## Model Experience

### Selected template and cases

#### What the model sees

Selected records contribute data-dependent composition, visual-style, scene, preservation, and avoidance lines to the optimizer's canonical prompt. The packaged `general-image` fallback contributes `Use a clear focal hierarchy around the requested subject.`, `requested subject identity`, `unrequested text`, and `watermarks`. Source evidence and required capabilities remain in the prepared result.

#### Token effect

The effect is conditional on optimizer selection and is bounded by the optimizer's complete prepared-result byte limit. The Provider adds no separate prompt section and performs no model call.

#### KV Cache effect

Selected fragments occupy the optimizer's existing request position. Reuse remains stable while the request, selected record IDs, and snapshot content remain unchanged; any of those changes can invalidate the affected request suffix. Mounting the Provider alone adds no model-visible text.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The committed bootstrap contains zero imported upstream templates and zero imported upstream cases because no complete reviewed checkout was available; matching remains generic until synchronization replaces it.
- Synchronization omits all upstream case prompts and prompt previews because the current case records contain no explicit redistribution grant, and it never imports images.
- The strict adapter targets upstream `data/style-library.json` and `data/cases.json`; schema or referenced-path changes require an operator-reviewed synchronizer update.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
