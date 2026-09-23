# DSH General Image Optimization Capability Implementation Plan

English | [中文](2026-09-20-dsh-image-optimization.zh.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every shipped DSH Agent and Profile a deterministic, model-independent `image_optimize` capability backed by a controlled offline image-prompt library and reusable by Oasis/Cowart workflows.

**Architecture:** Add a four-package `packages/image/` capability group: one Service Definition owns validation, Provider ordering, merging, and compilation; one Provider owns the packaged library; one Consumer exposes `image_optimize`; and one bundled Skill teaches agents when and how to use the result. Compose the Host-owned service, Provider, and Skill once, mount the Tool where each profile owns model-facing tools, and keep actual image execution outside this delivery.

**Tech Stack:** TypeScript ESM, Cordis services/effects/events, Schemastery configuration, Zod provider-result validation, DSH Tool/Skill/Attachment APIs, Vitest, YAML, JSON fixtures, keyless Session snapshots, Python tests for the existing Oasis skill scripts.

**Spec:** `docs/superpowers/specs/2026-09-20-dsh-image-optimization-design.md`

## Global Constraints

- Public interfaces and generated results must not name GPT Image, Gemini, Flux, or any concrete image model.
- This delivery performs no image generation, model discovery, credential access, paid call, retry, budget control, remote image download, or generated-result storage.
- The shipped optimizer configuration is exactly `maxCases: 3`, `maxPromptBytes: 16384`, and `maxExactTextEntries: 64`.
- Runtime case-library access is local and offline; synchronization consumes a reviewed local upstream checkout and records its exact commit.
- Do not package case images, the upstream website runtime, account or billing code, Provider application code, executable resources, or third-party assets without confirmed redistribution permission.
- Public tool image positions are one-based positions in the current direct user input and resolve only to durable `ImageAttachmentRef` values, never filesystem paths.
- `edit` requires exactly one `edit-target`; `variation` requires at least one `content` reference and forbids `edit-target`; `generate` may omit references.
- Provider ordering is: explicit selections, descending match score, descending Provider rank, ascending Provider name, ascending candidate ID.
- Canonical prompt sections and JSON array ordering are deterministic; identical request, configuration, Provider set, and library snapshot must produce byte-identical output.
- Provider registration and per-Agent image-capture state must dispose through Cordis effects/listeners; registry HMR tests must observe removal.
- `agent/pre-step` is a waterfall: listeners must call `next()`, inspect returned `enter.messages`, append later-step user images within the same turn, reset on a new turn, and clear state on `agent/disposed`.
- New code must not call deprecated Session history APIs `snapshotEvents()` or `eventAt()`.
- Model-visible behavior must be covered by keyless recorded Session snapshots; product-visible plugins also require real Loader composition tests.
- Every package change updates its English and Chinese README pair, JSDoc, Model Experience, Known Limitations, and translation pairing record in the same task.
- Do not change `agent-loop`; implement the capability through existing Skill, Tool, Attachment, Agent event, Profile, and Provider extension points.
- A future native `image_generate` operation must call `ctx.imageOptimizer.optimize()` inside execution and reject every result except `status: 'prepared'`.

---

## File Structure

### New Capability Group

- `packages/image/README.md`, `README.zh.md`, `README.i18n.yaml`: group map and ownership statement.
- `packages/image/image-optimizer/src/types.ts`: public request, result, Provider, candidate, and error types only.
- `packages/image/image-optimizer/src/schema.ts`: Zod validation for Provider candidates and public helper schemas.
- `packages/image/image-optimizer/src/registry.ts`: duplicate-name rejection, Provider effect registration, deterministic candidate collection.
- `packages/image/image-optimizer/src/compiler.ts`: request validation, selection, merge priority, capability derivation, and fixed-order prompt compilation.
- `packages/image/image-optimizer/src/index.ts`: `ImageOptimizer` Cordis service, validated config, Context augmentation, and public exports.
- `packages/image/image-optimizer/tests/*.spec.ts`: focused unit and HMR/disposal coverage.
- `packages/image/image-optimizer-library/assets/`: normalized snapshot, source manifest, hashes, and upstream license record.
- `packages/image/image-optimizer-library/scripts/sync-upstream.ts`: offline local-checkout normalizer and allowlist validator.
- `packages/image/image-optimizer-library/src/index.ts`: packaged Provider activation and asset-root validation.
- `packages/image/image-optimizer-library/tests/`: snapshot, manifest, hash, corruption, and sync fixture tests.
- `packages/image/skill-image-generation/assets/image-generation/SKILL.md`: general image generation/editing workflow.
- `packages/image/skill-image-generation/src/index.ts`: bundled Skill Provider.
- `packages/image/tool-image-optimize/src/input-images.ts`: per-Agent current-input image capture.
- `packages/image/tool-image-optimize/src/schema.ts`: exact model-facing tool parameter schema.
- `packages/image/tool-image-optimize/src/index.ts`: Tool registration, ordinal resolution, optimization call, output rendering, and presentation.

### Existing Composition and Documentation

- `packages/bundle/base/cordis.patch.yml` and `package.json`: Host service, library, Skill, and non-Web Tool rows.
- `packages/preset/agent-presets/presets/{standard,ptc,cordis}/agent.cordis.yml`: Web-owned Tool row.
- `packages/bundle/sdk-minimal/cordis.patch.yml` and `package.json`: standalone Skill, Tool, optimizer, library, and attachment tree.
- `apps/desktop/package.json` and desktop packaging tests: formal runtime dependencies for packaged assets.
- `apps/desktop/build-resources/skills/oasis-wiki/`: Cowart/general-image workflow delegation and regression tests.
- `snapshots/session/image-optimization/`: keyless catalog, Skill load, schema, success, clarification, and stable-error recordings.
- `docs/architecture.md`, profile/package documentation, generated catalogs, and bilingual counterparts: current capability and composition facts.
- `tsconfig.base.json`, `tsconfig.host.json`, `packages/README.md`, and paired documents: new group discovery and compiler aggregation.

### Public Interfaces Fixed by This Plan

```ts ignore-check
export type ImageOperation = 'generate' | 'edit' | 'variation'
export type ImageReferenceRole = 'style' | 'layout' | 'content' | 'edit-target'

export interface ImageReferenceRequest {
  inputIndex: number
  role: ImageReferenceRole
  priority: number
}

export interface ExactTextRequest {
  text: string
  placement?: string
  preserveCase: boolean
}

export interface ImageOutputRequest {
  aspectRatio?: string
  width?: number
  height?: number
  transparentBackground: boolean
  count: number
}

export interface ImageOptimizationRequest {
  operation: ImageOperation
  intent: string
  references: readonly ImageReferenceRequest[]
  exactText: readonly ExactTextRequest[]
  output: ImageOutputRequest
  preserve: readonly string[]
  avoid: readonly string[]
  locale: string
  category?: string
  styleHints: readonly string[]
  sceneHints: readonly string[]
  templateId?: string
  caseIds: readonly string[]
}

export interface ResolvedImageReference {
  inputIndex: number
  attachment: ImageAttachmentRef
}

export interface ImageOptimizerOptions {
  signal?: AbortSignal
  resolvedReferences?: readonly ResolvedImageReference[]
}
```

`resolvedReferences` is the Tool-to-service transport for the exact ordinal fields in `ImageOptimizationRequest`; it does not add fields to the model-visible request and allows the service-owned `ImageGenerationSpec` to contain durable references.

```ts ignore-check
export interface ImageReferencePlan extends ImageReferenceRequest {
  attachment: ImageAttachmentRef
}

export interface ExactTextRequirement extends ExactTextRequest {}

export interface ImageOutputRequirement extends ImageOutputRequest {}

export interface ImageOptimizationEvidence {
  provider: string
  templateId?: string
  caseIds: readonly string[]
  visualStyleTags: readonly string[]
  sceneTags: readonly string[]
}

export interface ImageGenerationSpec {
  schemaVersion: 1
  operation: ImageOperation
  canonicalPrompt: string
  references: readonly ImageReferencePlan[]
  composition: readonly string[]
  visualStyle: readonly string[]
  scene: readonly string[]
  exactText: readonly ExactTextRequirement[]
  output: ImageOutputRequirement
  preserve: readonly string[]
  negativeConstraints: readonly string[]
  requiredCapabilities: readonly string[]
  evidence: readonly ImageOptimizationEvidence[]
  warnings: readonly string[]
}

export type ImageOptimizationErrorCode =
  | 'IMAGE_REFERENCE_NOT_FOUND'
  | 'IMAGE_EDIT_TARGET_REQUIRED'
  | 'IMAGE_EDIT_TARGET_AMBIGUOUS'
  | 'IMAGE_VARIATION_SOURCE_REQUIRED'
  | 'IMAGE_VARIATION_TARGET_UNSUPPORTED'
  | 'IMAGE_OPTIMIZATION_SOURCE_NOT_FOUND'

export interface ImageOptimizationIssue {
  code: 'IMAGE_EXACT_TEXT_CONFLICT'
  path: string
  message: string
}

export type ImageOptimizationResult =
  | { status: 'prepared'; spec: ImageGenerationSpec }
  | { status: 'needs_clarification'; issues: readonly ImageOptimizationIssue[] }
```

Provider candidates use one normalized runtime-validated form:

```ts ignore-check
export interface ImageOptimizationSelection {
  templateId?: string
  caseIds: readonly string[]
}

export interface ImageOptimizationQuery {
  intent: string
  locale: string
  category?: string
  styleHints: readonly string[]
  sceneHints: readonly string[]
}

export interface ImageOptimizationCandidate {
  kind: 'template' | 'case'
  id: string
  category?: string
  score: number
  composition: readonly string[]
  visualStyle: readonly string[]
  scene: readonly string[]
  preserve: readonly string[]
  avoid: readonly string[]
  requiredCapabilities: readonly string[]
  visualStyleTags: readonly string[]
  sceneTags: readonly string[]
  source: { title: string; url: string; license: string; redistributablePrompt: boolean }
}

export interface ImageOptimizationProvider {
  name: string
  rank: number
  resolve(selection: ImageOptimizationSelection, signal?: AbortSignal): Promise<readonly ImageOptimizationCandidate[]>
  match(query: ImageOptimizationQuery, signal?: AbortSignal): Promise<readonly ImageOptimizationCandidate[]>
}
```

### Test Helper Contracts

The snippets below use only these task-owned helpers; implement them in the listed test fixture modules rather than inventing additional public APIs.

```ts ignore-check
// packages/image/image-optimizer/tests/fixtures.ts
export function candidateFixture(overrides?: Partial<ImageOptimizationCandidate>): ImageOptimizationCandidate
export function candidate(kind: 'template' | 'case', id: string, score: number): ImageOptimizationCandidate
export function provider(
  name: string,
  rank: number,
  matches: readonly ImageOptimizationCandidate[],
): ImageOptimizationProvider
export function requestFixture(overrides?: Partial<ImageOptimizationRequest>): ImageOptimizationRequest
export function editRequest(references: readonly ImageReferenceRequest[]): ImageOptimizationRequest
export function variationRequest(references: readonly ImageReferenceRequest[]): ImageOptimizationRequest
export function target(inputIndex: number): ImageReferenceRequest
export function content(inputIndex: number): ImageReferenceRequest
export function resolved(...refs: readonly ResolvedImageReference[]): ImageOptimizerOptions
export function prepared(result: ImageOptimizationResult): ImageGenerationSpec
export function ids(result: ImageOptimizationResult): string[]
export function optimizeBase(ctx: Context): Promise<ImageOptimizationResult>

// packages/image/image-optimizer-library/tests/harness.ts
export function syncFixture(name: string): Promise<Readonly<Record<string, string>>>
export function copiedAssets(): Promise<string>

// packages/image/tool-image-optimize/tests/harness.ts
export function imageRef(id: string): ImageAttachmentRef
export function pluginMessage(): UserMessage
export function userMessage(...refs: readonly ImageAttachmentRef[]): UserMessage
export function emitPreStep(
  ctx: Context,
  agent: Agent,
  turn: number,
  step: number,
  messages: UserMessage[],
  next: () => Promise<PreStepDecision>,
): Promise<PreStepDecision>
export function admit(agent: Agent, turn: number, refs: readonly ImageAttachmentRef[]): Promise<void>
export function executeTool(
  ctx: Context,
  args: ImageOptimizationRequest,
  exec: { agent?: Agent; signal?: AbortSignal },
): Promise<ImageOptimizationResult>
```

The Oasis test module defines `prepared_spec_fixture() -> dict`, `build_generation_package(tmp_path, optimization) -> CompletedProcess`, and `prepare(tmp_path, spec) -> dict` as local wrappers over the existing script entry points.

## Task 1: Scaffold the Image Group and Service Definition

**Files:**
- Create: `packages/image/README.md`
- Create: `packages/image/README.zh.md`
- Create: `packages/image/README.i18n.yaml`
- Create: `packages/image/image-optimizer/package.json`
- Create: `packages/image/image-optimizer/tsconfig.json`
- Create: `packages/image/image-optimizer/src/types.ts`
- Create: `packages/image/image-optimizer/src/schema.ts`
- Create: `packages/image/image-optimizer/src/index.ts`
- Create: `packages/image/image-optimizer/tests/config.spec.ts`
- Create: `packages/image/image-optimizer/tests/fixtures.ts`
- Create: package README pair and pairing record under `packages/image/image-optimizer/`
- Modify: `packages/README.md`, `packages/README.zh.md`, `packages/README.i18n.yaml`
- Modify: `tsconfig.base.json`
- Modify: `tsconfig.host.json`

**Interfaces:**
- Consumes: `ImageAttachmentRef` from `@deepseek-ai/dsh-attachment`, `Context`/`Service` from Cordis, Schemastery for config, Zod for candidate validation.
- Produces: every public type in “Public Interfaces Fixed by This Plan”, `ImageOptimizationError`, `ImageOptimizer`, and `ctx.imageOptimizer`.

- [ ] **Step 1: Write config and public-schema tests**

```ts ignore-check
it('publishes exact defaults and rejects invalid bounds', async () => {
  const ctx = new Context()
  const fiber = await ctx.plugin(ImageOptimizer)
  expect(ctx.imageOptimizer.config).toEqual({
    maxCases: 3,
    maxPromptBytes: 16384,
    maxExactTextEntries: 64,
  })
  await fiber.dispose()
  await expect(ctx.plugin(ImageOptimizer, { maxCases: 0 })).rejects.toThrow('maxCases')
})

it('rejects Provider candidates with unknown fields', () => {
  expect(() => parseCandidate({ ...candidateFixture(), executable: true })).toThrow('unrecognized')
})
```

- [ ] **Step 2: Run the focused test and verify the package is absent**

Run: `pnpm exec vitest run packages/image/image-optimizer/tests/config.spec.ts`

Expected: FAIL because `@deepseek-ai/dsh-image-optimizer` and its files do not exist.

- [ ] **Step 3: Add manifests, compiler references, public types, config, error class, and candidate schema**

```ts ignore-check
export interface Config {
  maxCases?: number
  maxPromptBytes?: number
  maxExactTextEntries?: number
}

export const Config: z<Config> = z.object({
  maxCases: z.number().step(1).min(1).default(3),
  maxPromptBytes: z.number().step(1).min(1).default(16384),
  maxExactTextEntries: z.number().step(1).min(1).default(64),
})

export class ImageOptimizationError extends Error {
  constructor(
    message: string,
    readonly code: ImageOptimizationErrorCode,
    readonly path: string,
  ) {
    super(message)
    this.name = 'ImageOptimizationError'
  }
}
```

Declare `Context.imageOptimizer`, keep `src/types.ts` runtime-free, export the Zod parser only for Provider activation/tests, add `packages/image/*` path aliases, and register the project in `tsconfig.host.json`.

- [ ] **Step 4: Write the group and package README pairs**

Document the Service Definition/Provider/Consumer ownership, no-executor limitation, configuration table, model-visible prompt/result cost, and the reason no `./invariant` export exists: the package has one authoritative registry and no independently observed relation.

- [ ] **Step 5: Run focused type, unit, and documentation checks**

Run: `pnpm exec vitest run packages/image/image-optimizer/tests/config.spec.ts && pnpm exec tsc -p packages/image/image-optimizer/tsconfig.json --noEmit && pnpm run verify-translation-pairing --write packages/image/README.md && pnpm run verify-translation-pairing --write packages/image/image-optimizer/README.md`

Expected: PASS.

- [ ] **Step 6: Commit the Service Definition scaffold**

```bash
git add packages/image packages/README.md packages/README.zh.md packages/README.i18n.yaml tsconfig.base.json tsconfig.host.json
git commit -m "feat(image): add optimizer service definition"
```

## Task 2: Implement Provider Registration, Validation, Selection, and Compilation

**Files:**
- Create: `packages/image/image-optimizer/src/registry.ts`
- Create: `packages/image/image-optimizer/src/compiler.ts`
- Create: `packages/image/image-optimizer/tests/registry.spec.ts`
- Create: `packages/image/image-optimizer/tests/compiler.spec.ts`
- Modify: `packages/image/image-optimizer/src/index.ts`
- Modify: `packages/image/image-optimizer/README.md` and paired files

**Interfaces:**
- Consumes: Task 1 public types and `parseCandidate()`.
- Produces: `registerProvider(provider): () => void`, `optimize(request, options): Promise<ImageOptimizationResult>`, deterministic prompt compiler, and stable error behavior.

- [ ] **Step 1: Write registry order, duplicate-name, disposal, and cancellation tests**

```ts ignore-check
it('sorts explicit candidates before scored candidates and removes a disposed Provider', async () => {
  const alpha = provider('alpha', 10, [candidate('case', 'b', 0.7)])
  const beta = provider('beta', 20, [candidate('case', 'a', 0.7)])
  const disposeAlpha = ctx.imageOptimizer.registerProvider(alpha)
  ctx.imageOptimizer.registerProvider(beta)
  expect(ids(await optimizeBase(ctx))).toEqual(['beta:a', 'alpha:b'])
  disposeAlpha()
  expect(ids(await optimizeBase(ctx))).toEqual(['beta:a'])
})

it('rejects duplicate Provider names in one Context', () => {
  ctx.imageOptimizer.registerProvider(provider('library', 1, []))
  expect(() => ctx.imageOptimizer.registerProvider(provider('library', 2, [])))
    .toThrow('duplicate image optimization Provider: library')
})
```

- [ ] **Step 2: Run registry tests and verify failure**

Run: `pnpm exec vitest run packages/image/image-optimizer/tests/registry.spec.ts`

Expected: FAIL because registry collection and disposal are not implemented.

- [ ] **Step 3: Implement the effect-owned Provider registry**

```ts ignore-check
registerProvider(provider: ImageOptimizationProvider): () => void {
  validateProviderIdentity(provider)
  if (this.providers.has(provider.name)) {
    throw new Error(`duplicate image optimization Provider: ${provider.name}`)
  }
  return this.ctx.effect(() => {
    this.providers.set(provider.name, provider)
    return () => { this.providers.delete(provider.name) }
  })
}
```

Use one registration path: insert only inside `ctx.effect()` and return that disposer.

- [ ] **Step 4: Write compiler tests for every validation and merge rule**

```ts ignore-check
it.each([
  ['edit without target', editRequest([]), 'IMAGE_EDIT_TARGET_REQUIRED'],
  ['edit with two targets', editRequest([target(1), target(2)]), 'IMAGE_EDIT_TARGET_AMBIGUOUS'],
  ['variation without content', variationRequest([]), 'IMAGE_VARIATION_SOURCE_REQUIRED'],
  ['variation with target', variationRequest([target(1), content(2)]), 'IMAGE_VARIATION_TARGET_UNSUPPORTED'],
])('%s', async (_label, request, code) => {
  await expect(ctx.imageOptimizer.optimize(request, resolved())).rejects.toMatchObject({ code })
})

it('keeps user exact text, output, preservation, and prohibitions above Provider defaults', async () => {
  const result = await ctx.imageOptimizer.optimize(requestFixture(), resolved())
  expect(prepared(result).spec).toMatchObject({
    exactText: [{ text: 'PLAY', placement: 'center', preserveCase: true }],
    output: { width: 1024, height: 1024, transparentBackground: false, count: 1 },
    preserve: ['logo geometry'],
    negativeConstraints: ['watermark'],
  })
})
```

Also cover missing explicit IDs, duplicate case IDs, exact-text conflicts returning `needs_clarification`, no automatic case warning, `maxCases`, exact limit edges, one oversized field, aggregate UTF-8 byte overflow, multibyte input, and byte-identical repeated output. Identical exact-text entries deduplicate; two entries with the same trimmed, case-folded non-empty placement but different text, or the same text and placement with different `preserveCase`, produce one `IMAGE_EXACT_TEXT_CONFLICT` issue naming both array paths.

- [ ] **Step 5: Run compiler tests and verify failure**

Run: `pnpm exec vitest run packages/image/image-optimizer/tests/compiler.spec.ts`

Expected: FAIL because `optimize()` is not implemented.

- [ ] **Step 6: Implement request validation and resolved-reference joining**

```ts ignore-check
function resolveReferences(
  request: ImageOptimizationRequest,
  resolved: readonly ResolvedImageReference[],
): ImageReferencePlan[] {
  const byIndex = new Map(resolved.map(item => [item.inputIndex, item.attachment]))
  return request.references.map((reference, position) => {
    const attachment = byIndex.get(reference.inputIndex)
    if (attachment === undefined) {
      throw new ImageOptimizationError(
        `Image ${reference.inputIndex} is not present in the current user input.`,
        'IMAGE_REFERENCE_NOT_FOUND',
        `references[${position}].inputIndex`,
      )
    }
    return { ...reference, attachment }
  })
}
```

Validate positive safe integers, non-empty trimmed strings, unique explicit case IDs, output dimension pairs, count, exact-text count, role rules, and missing explicit sources before compilation. Width and height must be supplied together; when `aspectRatio` is also present it must equal the reduced width-to-height ratio. Structural and configured-limit violations use the Tool runtime's stable `INVALID_ARGUMENTS` failure, while the six domain failures use `ImageOptimizationErrorCode` and exact-text conflicts use `needs_clarification`.

- [ ] **Step 7: Implement candidate collection, stable sorting, merge, capabilities, and fixed prompt sections**

```ts ignore-check
const SECTION_ORDER = [
  'Task', 'References', 'Composition', 'Visual style', 'Scene',
  'Exact text', 'Output', 'Preserve', 'Avoid',
] as const

function compilePrompt(sections: ReadonlyMap<typeof SECTION_ORDER[number], readonly string[]>): string {
  return SECTION_ORDER.flatMap(title => {
    const lines = sections.get(title) ?? []
    return lines.length === 0 ? [] : [`## ${title}`, ...lines.map(line => `- ${line}`)]
  }).join('\n')
}
```

Explicit candidates carry an internal `explicit: true`; automatic candidates sort by score/rank/name/ID. Select explicit cases plus at most `maxCases` automatic cases, ensure a category or global template fallback, deduplicate arrays by first occurrence, derive capability strings from references/output/exact text, produce Provider-grouped evidence, then enforce `Buffer.byteLength(canonicalPrompt, 'utf8') <= maxPromptBytes` on the complete prompt.

- [ ] **Step 8: Run optimizer tests and typecheck**

Run: `pnpm exec vitest run packages/image/image-optimizer/tests && pnpm exec tsc -p packages/image/image-optimizer/tsconfig.json --noEmit`

Expected: PASS.

- [ ] **Step 9: Commit deterministic optimization**

```bash
git add packages/image/image-optimizer
git commit -m "feat(image): compile deterministic generation specs"
```

## Task 3: Add the Controlled Offline Case-Library Provider

**Files:**
- Create: `packages/image/image-optimizer-library/package.json`
- Create: `packages/image/image-optimizer-library/tsconfig.json`
- Create: `packages/image/image-optimizer-library/src/index.ts`
- Create: `packages/image/image-optimizer-library/scripts/sync-upstream.ts`
- Create: `packages/image/image-optimizer-library/assets/manifest.json`
- Create: `packages/image/image-optimizer-library/assets/templates.json`
- Create: `packages/image/image-optimizer-library/assets/cases.json`
- Create: `packages/image/image-optimizer-library/assets/tags.json`
- Create: `packages/image/image-optimizer-library/assets/sources.json`
- Create: `packages/image/image-optimizer-library/assets/LICENSE.upstream`
- Create: tests and fixed upstream fixtures under `packages/image/image-optimizer-library/tests/`
- Create: `packages/image/image-optimizer-library/tests/harness.ts`
- Create: package README pair and pairing record
- Modify: `tsconfig.host.json`

**Interfaces:**
- Consumes: `ImageOptimizationProvider`, candidate schema, and registry from Tasks 1-2.
- Produces: Provider name `awesome-gpt-image-2-library`, rank `100`, configurable absolute `assetRoot`, deterministic `resolve()` and `match()`.

- [ ] **Step 1: Write offline sync rejection and stable-output tests**

```ts ignore-check
it.each([
  ['unknown field', 'unknown-field'],
  ['duplicate id', 'duplicate-id'],
  ['missing source', 'missing-source'],
  ['path traversal', 'path-traversal'],
  ['executable file', 'executable-file'],
  ['forbidden binary', 'forbidden-binary'],
])('rejects %s', async (_label, fixture) => {
  await expect(syncFixture(fixture)).rejects.toThrow()
})

it('writes byte-identical JSON for the same reviewed checkout', async () => {
  expect(await syncFixture('valid')).toEqual(await syncFixture('valid'))
})
```

- [ ] **Step 2: Run sync tests and verify failure**

Run: `pnpm exec vitest run packages/image/image-optimizer-library/tests/sync-upstream.spec.ts`

Expected: FAIL because the sync script is absent.

- [ ] **Step 3: Implement the local-checkout normalizer**

```ts ignore-check
interface SyncOptions {
  sourceRoot: string
  outputRoot: string
  upstreamCommit: string
}

const ALLOWED_OUTPUTS = new Set([
  'manifest.json', 'templates.json', 'cases.json', 'tags.json',
  'sources.json', 'LICENSE.upstream',
])
```

The script accepts only an absolute local `--source`, an absolute `--output`, and a 40-hex `--commit`; parses upstream structured files; emits summaries, tags, template fragments, source metadata, and only prompts whose source record says redistribution is allowed; sorts object keys and arrays by stable IDs; writes SHA-256 hashes and counts into `manifest.json`; and rejects any discovered executable or binary resource rather than copying it.

- [ ] **Step 4: Produce the initial reviewed snapshot**

Run from a separately reviewed local checkout whose absolute path is stored in `DSH_IMAGE_LIBRARY_SOURCE`:

```powershell
$sourceRoot = (Resolve-Path $env:DSH_IMAGE_LIBRARY_SOURCE).Path
$commit = (git -C $sourceRoot rev-parse HEAD).Trim()
pnpm --filter @deepseek-ai/dsh-image-optimizer-library run sync -- --source $sourceRoot --output packages/image/image-optimizer-library/assets --commit $commit
```

Review every emitted source and `redistributablePrompt` flag; the committed manifest contains the concrete commit, so no runtime or test depends on the upstream branch head.

- [ ] **Step 5: Write Provider activation, hash, resolve, match, and disposal tests**

```ts ignore-check
it('fails activation when a packaged hash changes', async () => {
  const assets = await copiedAssets()
  await writeFile(join(assets, 'cases.json'), '[]\n')
  await expect(ctx.plugin(ImageLibrary, { assetRoot: assets })).rejects.toThrow('hash mismatch')
})

it('matches category and tags without network or model calls', async () => {
  await ctx.plugin(ImageLibrary)
  const result = await ctx.imageOptimizer.optimize(requestFixture({
    category: 'game-ui', styleHints: ['flat icon'], sceneHints: ['inventory'],
  }))
  expect(prepared(result).spec.evidence[0]?.provider).toBe('awesome-gpt-image-2-library')
})
```

- [ ] **Step 6: Implement activation-time validation and deterministic matching**

Read and validate every asset synchronously before registration, require absolute `assetRoot`, verify manifest version/counts/hashes/source records/license, build immutable maps and lowercase token indexes, implement exact-ID resolution, and score category/style/scene/intent token matches without auxiliary model calls.

- [ ] **Step 7: Run package tests, typecheck, and pairing**

Run: `pnpm exec vitest run packages/image/image-optimizer-library/tests && pnpm exec tsc -p packages/image/image-optimizer-library/tsconfig.json --noEmit && pnpm run verify-translation-pairing --write packages/image/image-optimizer-library/README.md`

Expected: PASS with no network access.

- [ ] **Step 8: Commit the reviewed library snapshot**

```bash
git add packages/image/image-optimizer-library tsconfig.host.json
git commit -m "feat(image): add offline prompt library provider"
```

## Task 4: Add the Formal `image-generation` Skill Provider

**Files:**
- Create: `packages/image/skill-image-generation/package.json`
- Create: `packages/image/skill-image-generation/tsconfig.json`
- Create: `packages/image/skill-image-generation/src/index.ts`
- Create: `packages/image/skill-image-generation/assets/image-generation/SKILL.md`
- Create: `packages/image/skill-image-generation/tests/skill-image-generation.spec.ts`
- Create: package README pair and pairing record
- Modify: `tsconfig.host.json`

**Interfaces:**
- Consumes: `@deepseek-ai/dsh-skill` Provider registry.
- Produces: bundled, model-invocable and user-invocable Skill candidate `image-generation` from Provider `dsh-image-generation`.

- [ ] **Step 1: Write packaged-resource, real Loader, and disposal tests**

```ts ignore-check
it('loads the formal workflow and removes it on disposal', async () => {
  await ctx.plugin(SkillRegistry)
  const fiber = await ctx.plugin(SkillImageGeneration)
  expect(await ctx.skills.list()).toContainEqual(expect.objectContaining({
    name: 'image-generation', provider: 'dsh-image-generation', source: 'bundled',
  }))
  expect((await ctx.skills.get('image-generation'))?.content).toContain('image_optimize')
  await fiber.dispose()
  expect(await ctx.skills.list()).toEqual([])
})
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm exec vitest run packages/image/skill-image-generation/tests/skill-image-generation.spec.ts`

Expected: FAIL because the Provider is absent.

- [ ] **Step 3: Write the Skill instructions**

The Skill must instruct the agent to: classify `generate`/`edit`/`variation`; derive category/style/scene hints; preserve exact text as structured entries; assign current-input image positions and roles; call `image_optimize` before any available executor; stop and ask about `needs_clarification`; pass only prepared prompt/references/output/capabilities to an executor; and report “prepared” rather than “generated” when none exists. It must state that Oasis/Cowart adds its domain constraints after this generic step.

- [ ] **Step 4: Implement the bundled Provider using the `skill-office` pattern**

```ts ignore-check
const candidate: SkillCandidate = {
  name: 'image-generation',
  description: 'Prepare image generation, editing, and variation requests before using an available image executor.',
  invocation: { modelInvocable: true, userInvocable: true },
  provider: 'dsh-image-generation',
  source: 'bundled',
  rank: BUNDLED_SKILL_RANK,
  resourceBase: { kind: 'directory', path: directory },
  locator: join(directory, 'SKILL.md'),
}
```

Support an optional absolute `assetRoot`, parse YAML frontmatter with `yaml`, validate resources before registration, and use `ctx.skills.registerProvider()` so disposal removes the candidate.

- [ ] **Step 5: Run unit, Loader, type, and pairing checks**

Run: `pnpm exec vitest run packages/image/skill-image-generation/tests && pnpm exec tsc -p packages/image/skill-image-generation/tsconfig.json --noEmit && pnpm run verify-translation-pairing --write packages/image/skill-image-generation/README.md`

Expected: PASS.

- [ ] **Step 6: Commit the formal Skill**

```bash
git add packages/image/skill-image-generation tsconfig.host.json
git commit -m "feat(image): add generation workflow skill"
```

## Task 5: Add `image_optimize` and Current-Input Image Resolution

**Files:**
- Create: `packages/image/tool-image-optimize/package.json`
- Create: `packages/image/tool-image-optimize/tsconfig.json`
- Create: `packages/image/tool-image-optimize/src/input-images.ts`
- Create: `packages/image/tool-image-optimize/src/schema.ts`
- Create: `packages/image/tool-image-optimize/src/index.ts`
- Create: `packages/image/tool-image-optimize/tests/input-images.spec.ts`
- Create: `packages/image/tool-image-optimize/tests/tool-image-optimize.spec.ts`
- Create: `packages/image/tool-image-optimize/tests/loader-composition.spec.ts`
- Create: `packages/image/tool-image-optimize/tests/harness.ts`
- Create: package README pair and pairing record
- Modify: `tsconfig.host.json`

**Interfaces:**
- Consumes: `ctx.tools`, `ctx.imageOptimizer`, `agent/pre-step`, `agent/disposed`, `ToolRunContext.agent`, `ImageAttachmentRef`.
- Produces: model-facing tool `image_optimize` and pure presentation metadata.

- [ ] **Step 1: Write Agent-input capture tests**

```ts ignore-check
it('captures admitted direct-user images after downstream pre-step listeners', async () => {
  const decision = await emitPreStep(ctx, agent, 1, 1, incoming, async () => ({
    kind: 'enter',
    messages: [pluginMessage(), userMessage(imageRef('a')), userMessage(imageRef('b'))],
  }))
  expect(decision.kind).toBe('enter')
  expect(capture.references(agent)).toEqual([imageRef('a'), imageRef('b')])
})

it('appends same-turn later-step images, resets next turn, and clears on disposal', async () => {
  await admit(agent, 3, [imageRef('a')])
  await admit(agent, 3, [imageRef('b')])
  expect(capture.references(agent)).toEqual([imageRef('a'), imageRef('b')])
  await admit(agent, 4, [imageRef('c')])
  expect(capture.references(agent)).toEqual([imageRef('c')])
  ctx.emit('agent/disposed', { agent })
  expect(capture.references(agent)).toEqual([])
})
```

- [ ] **Step 2: Run capture tests and verify failure**

Run: `pnpm exec vitest run packages/image/tool-image-optimize/tests/input-images.spec.ts`

Expected: FAIL because capture state is absent.

- [ ] **Step 3: Implement waterfall-safe capture without Session scans**

```ts ignore-check
ctx.on('agent/pre-step', async ({ agent, turn }, next): Promise<PreStepDecision> => {
  const decision = await next()
  if (decision.kind !== 'enter') return decision
  const refs = decision.messages
    .filter(message => message.source.kind === 'user')
    .flatMap(message => message.content.flatMap(block => block.type === 'image' ? [block.attachment] : []))
  capture.admit(agent, turn, refs)
  return decision
})

ctx.on('agent/disposed', ({ agent }) => { capture.delete(agent) })
```

Back the capture with `WeakMap<Agent, { turn: number; refs: ImageAttachmentRef[] }>` and return defensive readonly copies. Do not read Session history.

- [ ] **Step 4: Write the exact tool-schema and execution tests**

```ts ignore-check
it('resolves one-based positions and forwards the execution signal', async () => {
  const controller = new AbortController()
  const result = await executeTool(ctx, {
    operation: 'edit', intent: 'replace the title',
    references: [{ inputIndex: 2, role: 'edit-target', priority: 100 }],
    exactText: [{ text: 'READY', preserveCase: true }],
    output: { transparentBackground: false, count: 1 },
    preserve: ['layout'], avoid: [], locale: 'en', styleHints: [], sceneHints: [], caseIds: [],
  }, { agent, signal: controller.signal })
  expect(optimize).toHaveBeenCalledWith(expect.anything(), {
    signal: controller.signal,
    resolvedReferences: [{ inputIndex: 2, attachment: secondRef }],
  })
  expect(result.status).toBe('prepared')
})

it('rejects a call without an owning Agent', async () => {
  await expect(executeTool(ctx, request, { agent: undefined })).rejects.toThrow('owning Agent')
})
```

Cover all six stable error codes, duplicate ordinal resolution, cancellation, `needs_clarification`, output JSON losslessness, and `presentCall`/`presentResult` titles.

- [ ] **Step 5: Run tool tests and verify failure**

Run: `pnpm exec vitest run packages/image/tool-image-optimize/tests/tool-image-optimize.spec.ts`

Expected: FAIL because the tool is absent.

- [ ] **Step 6: Implement the strict tool schema and registration**

Use `defineTool()` with `additionalProperties: false` at every object layer; enum operation and roles; safe positive integer positions/priorities/count/dimensions; arrays for exact text, preservation, prohibitions, style hints, scene hints, and case IDs; optional category/template/aspect ratio. Register through `ctx.tools.register()`, pass `exec.signal`, and fail before service invocation when `exec.agent` is absent.

- [ ] **Step 7: Implement canonical output rendering and presentation**

Return the complete `ImageOptimizationResult` as the tool value. Render one JSON text block so the model receives the complete Spec, and emit presentation metadata containing only `status`, `operation`, selected evidence IDs, warnings, and issue codes; do not include local paths or case prompt bodies.

- [ ] **Step 8: Add a real Loader composition test**

Boot `tools`, `agent`, `image-optimizer`, a fixture Provider, and `tool-image-optimize` from a temporary `cordis.yml`; create an Agent, emit `agent/pre-step`, call through `ctx.tools.execute()`, and assert the durable model-facing result and disposal behavior.

- [ ] **Step 9: Run package checks and commit**

Run: `pnpm exec vitest run packages/image/tool-image-optimize/tests && pnpm exec tsc -p packages/image/tool-image-optimize/tsconfig.json --noEmit && pnpm run verify-translation-pairing --write packages/image/tool-image-optimize/README.md`

Expected: PASS.

```bash
git add packages/image/tool-image-optimize tsconfig.host.json
git commit -m "feat(image): add image optimization tool"
```

## Task 6: Compose the Host Capability into `dsh-base`

**Files:**
- Modify: `packages/bundle/base/cordis.patch.yml`
- Modify: `packages/bundle/base/package.json`
- Modify: `packages/bundle/base/tests/base.spec.ts`
- Modify: `packages/bundle/base/README.md`, paired files

**Interfaces:**
- Consumes: all four new packages.
- Produces: Host-owned optimizer/library/Skill and the Base global Tool used by Headless, SDK, ACP, and raw Base-backed profiles.

- [ ] **Step 1: Add a failing bundle-row test**

```ts ignore-check
expect(rows).toEqual(expect.arrayContaining([
  expect.objectContaining({ id: 'image-optimizer', name: '@deepseek-ai/dsh-image-optimizer' }),
  expect.objectContaining({ id: 'image-optimizer-library', name: '@deepseek-ai/dsh-image-optimizer-library' }),
  expect.objectContaining({ id: 'skill-image-generation', name: '@deepseek-ai/dsh-skill-image-generation' }),
  expect.objectContaining({ id: 'tool-image-optimize', name: '@deepseek-ai/dsh-tool-image-optimize' }),
]))
expect(row('image-optimizer').config).toEqual({ maxCases: 3, maxPromptBytes: 16384, maxExactTextEntries: 64 })
```

- [ ] **Step 2: Run the bundle test and verify failure**

Run: `pnpm exec vitest run packages/bundle/base/tests/base.spec.ts`

Expected: FAIL because the rows and dependencies are absent.

- [ ] **Step 3: Insert Host rows and dependencies**

Mount `image-optimizer` before its Provider and Tool, mount `skill-image-generation` after the global Skill registry, and add all bare plugin packages to `dependencies`. Keep the Tool in the normal Base tool group so Web can disable it in the Web bundle before Presets add their scoped Tool.

- [ ] **Step 4: Update Base documentation and run checks**

Run: `pnpm exec vitest run packages/bundle/base/tests/base.spec.ts && pnpm run verify-cordis-config && pnpm run verify-translation-pairing --write packages/bundle/base/README.md`

Expected: PASS.

- [ ] **Step 5: Commit Base composition**

```bash
git add packages/bundle/base
git commit -m "feat(image): enable optimization in base profiles"
```

## Task 7: Mount the Tool in Every Tool-Bearing Web Preset

**Files:**
- Modify: `packages/bundle/web-app/cordis.patch.yml`
- Modify: `packages/preset/agent-presets/presets/standard/agent.cordis.yml`
- Modify: `packages/preset/agent-presets/presets/ptc/agent.cordis.yml`
- Modify: `packages/preset/agent-presets/presets/cordis/agent.cordis.yml`
- Modify: `packages/preset/agent-presets/package.json`
- Modify: `packages/preset/agent-presets/tests/shipped-root.spec.ts`
- Modify: package README pair and pairing record

**Interfaces:**
- Consumes: Base Host service/library/Skill.
- Produces: one `tool-image-optimize` row in `standard`, `ptc`, and `cordis`; no row in `minimal`.

- [ ] **Step 1: Write the shipped-preset assertion**

```ts ignore-check
it('mounts image_optimize in every shipped tool-bearing Web preset', async () => {
  for (const id of ['standard', 'ptc', 'cordis']) {
    expect(findEntry(await shippedEntries(id), 'tool-image-optimize')).toMatchObject({
      name: '@deepseek-ai/dsh-tool-image-optimize',
    })
  }
  expect(findEntry(await shippedEntries('minimal'), 'tool-image-optimize')).toBeUndefined()
})
```

- [ ] **Step 2: Run the preset test and verify failure**

Run: `pnpm exec vitest run packages/preset/agent-presets/tests/shipped-root.spec.ts`

Expected: FAIL because the preset rows are absent.

- [ ] **Step 3: Disable the Base Tool in Web and add preset-owned rows**

Add a Web patch that sets Base `tool-image-optimize.disabled: true`, then add the same Tool row beside `tool-skill` in each tool-bearing preset. Add the Tool package to the preset package dependencies so shipped bare names resolve.

- [ ] **Step 4: Run preset and CLI Web composition checks**

Run: `pnpm exec vitest run packages/preset/agent-presets/tests/shipped-root.spec.ts apps/cli/tests/web-agent-presets.e2e.ts`

Expected: PASS and exactly one `image_optimize` schema per Web Agent.

- [ ] **Step 5: Commit Web composition**

```bash
git add packages/bundle/web-app packages/preset/agent-presets
git commit -m "feat(image): add optimizer to web agent presets"
```

## Task 8: Extend `sdk-minimal` and Desktop Packaging

**Files:**
- Modify: `packages/bundle/sdk-minimal/cordis.patch.yml`
- Modify: `packages/bundle/sdk-minimal/package.json`
- Modify: `packages/bundle/sdk-minimal/tests/sdk-minimal.spec.ts`
- Modify: package README pair and pairing record
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop-host/package.json`
- Modify: desktop package/bundle tests that assert runtime dependency closure
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: new capability packages plus existing `dsh-skill`, `dsh-tool-skill`, `dsh-attachment`, and `dsh-attachment-local`.
- Produces: standalone `sdk-minimal` discovery/call support and packaged Desktop availability without `DSH_BUNDLED_SKILL_DIR`.

- [ ] **Step 1: Expand the exact `sdk-minimal` tree test**

Assert rows for `attachment-local`, `skill`, `skill-image-generation`, `tool-skill`, `image-optimizer`, `image-optimizer-library`, and `tool-image-optimize`, with the optimizer’s exact config and no `skill-filesystem` row.

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm exec vitest run packages/bundle/sdk-minimal/tests/sdk-minimal.spec.ts`

Expected: FAIL because the standalone tree lacks the capability.

- [ ] **Step 3: Add the standalone rows in dependency order**

Mount the local attachment service before Agent input admission, the Skill registry before the bundled Skill and `tool-skill`, the optimizer before the library and Tool, and keep user-directory discovery absent. Add every bare plugin to `dependencies` and keep manifest-dependency equality exact.

- [ ] **Step 4: Add Desktop runtime dependencies and packaging assertions**

Add the four new packages and their packaged assets to the app/host dependency owner used by the Desktop bundle. Extend packaging tests to resolve `SKILL.md`, `manifest.json`, and library JSON from the packaged dependency tree while `DSH_BUNDLED_SKILL_DIR` is unset.

- [ ] **Step 5: Run standalone and Desktop checks**

Run: `pnpm exec vitest run packages/bundle/sdk-minimal/tests/sdk-minimal.spec.ts apps/desktop/tests apps/desktop-host/tests && pnpm run verify-cordis-config`

Expected: PASS.

- [ ] **Step 6: Commit standalone and packaging composition**

```bash
git add packages/bundle/sdk-minimal apps/desktop/package.json apps/desktop-host/package.json pnpm-lock.yaml
git commit -m "feat(image): ship optimization in minimal sdk and desktop"
```

## Task 9: Make Oasis/Cowart Consume the Unified Optimization Result

**Files:**
- Modify: `apps/desktop/build-resources/skills/oasis-wiki/SKILL.md`
- Modify: `apps/desktop/build-resources/skills/oasis-wiki/references/task-router.md`
- Modify: `apps/desktop/build-resources/skills/oasis-wiki/references/cowart-ui-workflow.md`
- Modify: `apps/desktop/build-resources/skills/oasis-wiki/references/game-ui/workflow.md`
- Modify: `apps/desktop/build-resources/skills/oasis-wiki/scripts/game-ui/prepare_image_generation.py`
- Modify: `apps/desktop/build-resources/skills/oasis-wiki/scripts/game-ui/build_generation_prompt.py`
- Modify: relevant Oasis Python tests, especially `tests/test_game_ui_generation.py` and Cowart workflow tests

**Interfaces:**
- Consumes: `image-generation` Skill semantics and `ImageGenerationSpec` JSON returned by `image_optimize`.
- Produces: Oasis domain constraints layered onto the unified Spec; existing Provider authorization and execution remain unchanged.

- [ ] **Step 1: Add regression tests for the new Generation Package input**

```python
def test_generation_package_requires_prepared_optimization_result(tmp_path):
    result = build_generation_package(tmp_path, optimization={"status": "needs_clarification", "issues": []})
    assert result.returncode != 0
    assert "prepared" in result.stderr

def test_oasis_constraints_extend_canonical_spec_without_reselecting_templates(tmp_path):
    package = prepare(tmp_path, prepared_spec_fixture())
    assert package["imageSpec"]["canonicalPrompt"] == prepared_spec_fixture()["canonicalPrompt"]
    assert package["oasisConstraints"]["dynamicText"] is True
    assert "templateSelection" not in package
```

- [ ] **Step 2: Run focused Oasis tests and verify failure**

Run: `python -m unittest apps.desktop.build-resources.skills.oasis-wiki.tests.test_game_ui_generation`

Expected: FAIL because the scripts still own general prompt selection.

- [ ] **Step 3: Change the Generation Package schema and prompt builder**

Require one `imageSpec` with `schemaVersion: 1` and `status: prepared` at the script boundary. Preserve its canonical prompt, references, exact text, output, preservation, prohibitions, evidence, and warnings. Add Oasis-only fields for dynamic text/numbers/progress, hit targets, reusable controls, UI Tree, editor-write restrictions, and Cowart review stages; remove duplicate general template/style/case selection from Python.

- [ ] **Step 4: Update Oasis instructions**

Route generic generation/edit/variation preparation through the formal `image-generation` Skill and `image_optimize`. Keep model discovery, explicit paid-call authorization, Codex Provider execution, Cowart visual review, component extraction, PSD-to-UMG, Native dynamic text, and editor delivery in Oasis.

- [ ] **Step 5: Run all affected Oasis regressions**

Run: `python -m unittest discover -s apps/desktop/build-resources/skills/oasis-wiki/tests -p "test_*generation*.py" && python -m unittest apps.desktop.build-resources.skills.oasis-wiki.tests.test_cowart_ui_usage_guide`

Expected: PASS, including unchanged direct-generation authorization assertions.

- [ ] **Step 6: Commit Oasis reuse**

```bash
git add apps/desktop/build-resources/skills/oasis-wiki
git commit -m "refactor(oasis): consume unified image optimization"
```

## Task 10: Add Real Profile Composition Tests and Keyless Session Snapshots

**Files:**
- Create: `snapshots/session/image-optimization/cordis.yml`
- Create: `snapshots/session/image-optimization/profile.patch.yml`
- Create: `snapshots/session/image-optimization/snapshot.yml`
- Create: expected snapshot files recorded by the harness
- Modify: Base/Profile/SDK real-composition tests at their existing owners
- Modify: snapshot index/manifest files generated by the snapshot harness

**Interfaces:**
- Consumes: completed runtime and profile composition.
- Produces: keyless evidence for Base-backed Headless, Web Preset, and `sdk-minimal` availability plus model-visible transcript output.

- [ ] **Step 1: Add three real composition assertions**

Boot: (1) Base + Headless, (2) Base + Web app with `standard`, and (3) standalone `sdk-minimal`. In each, assert `ctx.imageOptimizer`, catalog entry `image-generation`, load through `skill`, and exactly one `image_optimize` tool schema. Submit an admitted image in the tool-bearing scenarios and assert ordinal `1` resolves to its durable attachment ID.

- [ ] **Step 2: Run composition tests and fix only capability-owned failures**

Run: `pnpm exec vitest run packages/bundle/base/tests packages/preset/agent-presets/tests/shipped-root.spec.ts packages/bundle/sdk-minimal/tests`

Expected: PASS.

- [ ] **Step 3: Define the keyless replay scenario**

The recorded adapter must produce, in order: inspect Skill catalog, load `image-generation`, inspect/call `image_optimize` for a successful generate request, call a conflicting exact-text request yielding `needs_clarification`, and call a missing image position yielding `IMAGE_REFERENCE_NOT_FOUND`. Use fixture attachment metadata only; no real model or image endpoint.

- [ ] **Step 4: Record and review the snapshot**

Run: `pnpm run test:snapshot:record -- -t image-optimization`

Review that the snapshot contains the Skill description/body, exact tool JSON Schema, full prepared Spec, clarification issue, stable error code, and no model name, credential, local path, upstream full case prompt, or generation claim.

- [ ] **Step 5: Replay keylessly**

Run: `pnpm run test:snapshot -- -t image-optimization`

Expected: PASS without `DEEPSEEK_API_KEY`.

- [ ] **Step 6: Commit composition evidence and snapshots**

```bash
git add snapshots/session/image-optimization packages/bundle packages/preset apps/cli/tests
git commit -m "test(image): cover shipped optimization profiles"
```

## Task 11: Complete Bilingual Documentation and Generated Catalogs

**Files:**
- Modify: `docs/architecture.md` and `docs/architecture.zh.md`
- Create or modify: the image subsystem reference pair selected by `packages/image/README.md`
- Modify: shipped Profile documentation pairs for Base/Web/Headless/SDK/ACP/Desktop/`sdk-minimal`
- Modify: package README pairs from earlier tasks after behavior is final
- Modify: Oasis/Cowart workflow guidance and its pairing records where applicable
- Regenerate: `docs/tool-catalog.md`, `docs/tool-catalog.zh.md`, `docs/config-catalog.md`, `docs/config-catalog.zh.md`, `docs/module-graph.md`, and associated records through owning generators

**Interfaces:**
- Consumes: final source, tests, and generated schemas.
- Produces: one current-state documentation home per fact and fresh generated catalogs.

- [ ] **Step 1: Update architecture and subsystem ownership**

Document the four roles, Host vs Agent-plane placement, current-input attachment flow, deterministic/offline selection, Session logging through existing tool events, and the future executor obligation. Do not restate public type catalogs outside the owning subsystem page.

- [ ] **Step 2: Update Profile and Oasis user paths**

State that every shipped tool-bearing Agent can load `image-generation` and call `image_optimize`; `sdk-minimal` includes attachment support but not filesystem Skill discovery; Desktop uses package dependencies; and Oasis adds Cowart/UMG constraints after generic optimization.

- [ ] **Step 3: Regenerate authoritative catalogs**

Run the repository generators selected by `pnpm run doc-sync`; do not hand-edit generated English catalog regions. Review `image_optimize`, optimizer config defaults, the new package group, and module edges in generated output.

- [ ] **Step 4: Re-record every changed bilingual pair**

Collect the changed unsuffixed Markdown paths and re-record them explicitly:

```powershell
$pairs = git diff --name-only -- '*.md' | Where-Object { $_ -notmatch '\.zh\.md$' }
pnpm run verify-translation-pairing --write -- $pairs
```

- [ ] **Step 5: Run focused documentation checks**

Run: `pnpm run test:docs && pnpm run doc-sync && pnpm run website:build`

Expected: the new image documents pass. If the two known pre-existing failures remain, report them separately without changing unrelated files: the unpaired Oasis Wiki `references/wiki/README.md` and the incomplete `packages/client/ui-codex-bridge/README.md` Model Experience.

- [ ] **Step 6: Commit documentation and generated references**

```bash
git add docs packages/image packages/README.md packages/README.zh.md packages/README.i18n.yaml apps/desktop/build-resources/skills/oasis-wiki
git commit -m "docs(image): document unified optimization capability"
```

## Task 12: Run the Focused Pre-Push Verification and Final Review

**Files:**
- Modify only files required to fix failures caused by this plan.

**Interfaces:**
- Consumes: the complete implementation.
- Produces: review-ready evidence without claiming unrun checks.

- [ ] **Step 1: Read the outgoing diff and select checks through `dsh-pre-push-checks`**

Inspect `git diff --stat`, `git diff --name-only`, package dependency changes, generated artifacts, snapshot changes, and any persistence-type detector output. This project adds no Session event or persistence type; if a detector says otherwise, stop and follow the acknowledgement workflow before proceeding.

- [ ] **Step 2: Run all focused image package tests**

Run: `pnpm exec vitest run packages/image/image-optimizer/tests packages/image/image-optimizer-library/tests packages/image/skill-image-generation/tests packages/image/tool-image-optimize/tests`

Expected: PASS.

- [ ] **Step 3: Run affected composition, snapshot, Oasis, and type checks**

Run: `pnpm exec vitest run packages/bundle/base/tests packages/bundle/sdk-minimal/tests packages/preset/agent-presets/tests/shipped-root.spec.ts && pnpm run test:snapshot -- -t image-optimization && python -m unittest discover -s apps/desktop/build-resources/skills/oasis-wiki/tests -p "test_*generation*.py" && pnpm run typecheck`

Expected: PASS.

- [ ] **Step 4: Run repository metadata and documentation checks selected by the diff**

Run: `pnpm run lint && pnpm run hygiene && pnpm run doc-sync && pnpm run test:docs && git diff --check`

Expected: all image-owned checks PASS; separately report unchanged pre-existing failures identified in Task 11.

- [ ] **Step 5: Audit acceptance criteria manually**

Confirm: every shipped tool-bearing profile has exactly one Tool; identical calls produce byte-identical Specs; no Spec contains a concrete model, credential, or local path; no code calls paid/image endpoints; missing executors yield only `prepared`; Oasis contains no second general library/template selector; the packaged upstream snapshot contains only allowlisted normalized resources; and future Provider addition requires no change to the Tool, Skill, or library.

- [ ] **Step 6: Review for accidental scope expansion**

Run: `git diff -- packages/image packages/bundle packages/preset apps/desktop snapshots/session/image-optimization docs`

Remove unrelated refactors, generated build outputs, upstream images, and any change to `agent-loop`.

- [ ] **Step 7: Commit verification-only fixes if needed**

```bash
git add packages/image packages/bundle/base packages/bundle/sdk-minimal packages/bundle/web-app packages/preset/agent-presets apps/desktop apps/desktop-host snapshots/session/image-optimization docs
git commit -m "fix(image): satisfy integration checks"
```

Skip this commit when no verification fix is required.
