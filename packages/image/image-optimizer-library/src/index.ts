/** Packaged offline image optimization template and case Provider. */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type {
  ImageOptimizationCandidate,
  ImageOptimizationProvider,
  ImageOptimizationQuery,
  ImageOptimizationSelection,
} from '@deepseek-ai/dsh-image-optimizer'
import schema from '@deepseek-ai/schemastery'
import { z } from 'zod'

const PROVIDER_NAME = 'image-optimizer-library'
const PROVIDER_RANK = 100
const UPSTREAM_REPOSITORY = 'https://github.com/freestylefly/awesome-gpt-image-2'
const REQUIRED_RESOURCES = [
  'LICENSE.upstream',
  'cases.json',
  'manifest.json',
  'sources.json',
  'tags.json',
  'templates.json',
] as const
const HASHED_RESOURCES = REQUIRED_RESOURCES.filter(name => name !== 'manifest.json')

/** Packaged case-library resource location. */
export interface Config {
  /** Absolute normalized-assets directory; defaults to this package's assets. */
  assetRoot?: string
}

/** Validated Provider configuration. */
export const Config: schema<Config> = schema.object({ assetRoot: schema.string().min(1) })

/** Cordis plugin identity. */
export const name = 'image-optimizer-library'
/** Image optimization registry used by this Provider. */
export const inject = ['imageOptimizer']

const localizedSchema = z.object({ en: z.string().min(1), zh: z.string().min(1) }).strict()
const sourceSchema = z.object({
  id: z.string().min(1),
  origin: z.enum(['dsh', 'upstream']),
  title: z.string().min(1),
  url: z.url(),
  upstreamPath: z.string().optional(),
  upstreamRecordUrl: z.url().optional(),
  license: z.string().min(1),
  redistributablePrompt: z.boolean(),
  rightsNote: z.string().min(1),
}).strict().superRefine((source, context) => {
  if (source.origin === 'upstream' && (source.upstreamPath === undefined || source.upstreamPath.length === 0)) {
    context.addIssue({ code: 'custom', message: 'upstream source requires upstreamPath' })
  }
  if (source.origin === 'upstream' && source.upstreamRecordUrl === undefined) {
    context.addIssue({ code: 'custom', message: 'upstream source requires upstreamRecordUrl' })
  }
  if (source.origin === 'dsh' && (source.upstreamPath !== undefined || source.upstreamRecordUrl !== undefined)) {
    context.addIssue({ code: 'custom', message: 'DSH source must not include upstream record fields' })
  }
})
const tagSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['category', 'style', 'scene']),
  value: z.string().min(1),
  labels: localizedSchema,
  descriptions: localizedSchema,
  keywords: z.array(z.string().min(1)),
}).strict()
const commonRecordSchema = z.object({
  id: z.string().min(1),
  titles: localizedSchema,
  category: z.string().min(1).optional(),
  visualStyleTags: z.array(z.string().min(1)),
  sceneTags: z.array(z.string().min(1)),
  sourceId: z.string().min(1),
  composition: z.array(z.string().min(1)),
  visualStyle: z.array(z.string().min(1)),
  scene: z.array(z.string().min(1)),
  preserve: z.array(z.string().min(1)),
  avoid: z.array(z.string().min(1)),
  requiredCapabilities: z.array(z.string().min(1)),
  matchTerms: z.array(z.string().min(1)),
})
const templateSchema = commonRecordSchema.extend({
  guidance: localizedSchema,
  exampleCaseIds: z.array(z.string().min(1)),
}).strict()
const caseSchema = commonRecordSchema.extend({
  summaries: localizedSchema,
  templateId: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
}).strict()
const digestSchema = z.object({
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
}).strict()
const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  provider: z.object({ name: z.literal(PROVIDER_NAME), rank: z.literal(PROVIDER_RANK) }).strict(),
  snapshot: z.object({
    kind: z.enum(['bootstrap', 'reviewed-upstream']),
    importedUpstreamTemplates: z.number().int().nonnegative(),
    importedUpstreamCases: z.number().int().nonnegative(),
    note: z.string().min(1),
  }).strict(),
  upstream: z.object({
    repository: z.literal(UPSTREAM_REPOSITORY),
    commit: z.string().regex(/^[0-9a-f]{40}$/u).nullable(),
    reviewedCheckout: z.boolean(),
    licenseFile: z.literal('LICENSE.upstream'),
  }).strict(),
  counts: z.object({
    templates: z.number().int().nonnegative(),
    cases: z.number().int().nonnegative(),
    tags: z.number().int().nonnegative(),
    sources: z.number().int().nonnegative(),
  }).strict(),
  resources: z.object({
    'LICENSE.upstream': digestSchema,
    'cases.json': digestSchema,
    'sources.json': digestSchema,
    'tags.json': digestSchema,
    'templates.json': digestSchema,
  }).strict(),
}).strict()

type SourceRecord = z.infer<typeof sourceSchema>
type TagRecord = z.infer<typeof tagSchema>
type TemplateRecord = z.infer<typeof templateSchema>
type CaseRecord = z.infer<typeof caseSchema>

interface IndexedRecord {
  readonly candidate: ImageOptimizationCandidate
  readonly categoryTerms: ReadonlySet<string>
  readonly styleTerms: ReadonlySet<string>
  readonly sceneTerms: ReadonlySet<string>
  readonly metadataTokens: ReadonlySet<string>
  readonly globalFallback: boolean
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function parseJson<T>(content: string, parser: z.ZodType<T>, path: string): T {
  try {
    return parser.parse(JSON.parse(content) as unknown)
  } catch (error) {
    throw new Error(`image-optimizer-library: invalid ${path}`, { cause: error })
  }
}

function assertUnique(values: readonly { id: string }[], subject: string): void {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value.id)) throw new Error(`image-optimizer-library: duplicate ${subject} id ${JSON.stringify(value.id)}`)
    seen.add(value.id)
  }
}

function assertSafeUpstreamPath(path: string, subject: string): void {
  const normalized = path.replaceAll('\\', '/')
  if (isAbsolute(path) || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`image-optimizer-library: ${subject} contains path traversal`)
  }
}

function normalizedText(value: string): string {
  return value.normalize('NFKC').toLowerCase()
    .replaceAll(/[^\p{Letter}\p{Number}]+/gu, ' ').trim().replaceAll(/\s+/gu, ' ')
}

function tokens(value: string): string[] {
  const normalized = normalizedText(value)
  return normalized.length === 0 ? [] : normalized.split(' ')
}

function termSet(values: readonly string[]): ReadonlySet<string> {
  return new Set(values.map(normalizedText).filter(Boolean))
}

function tokenSet(values: readonly string[]): ReadonlySet<string> {
  return new Set(values.flatMap(tokens))
}

function tagTerms(tag: TagRecord): string[] {
  return [tag.value, tag.labels.en, tag.labels.zh, tag.descriptions.en, tag.descriptions.zh, ...tag.keywords]
}

function termsForTag(kind: TagRecord['kind'], value: string, tags: ReadonlyMap<string, TagRecord>): string[] {
  const tag = tags.get(`${kind}\0${value}`)
  return tag === undefined ? [value] : tagTerms(tag)
}

function freezeCandidate(candidate: ImageOptimizationCandidate): ImageOptimizationCandidate {
  const freeze = (values: readonly string[]): readonly string[] => Object.freeze([...values])
  return Object.freeze({
    ...candidate,
    composition: freeze(candidate.composition),
    visualStyle: freeze(candidate.visualStyle),
    scene: freeze(candidate.scene),
    preserve: freeze(candidate.preserve),
    avoid: freeze(candidate.avoid),
    requiredCapabilities: freeze(candidate.requiredCapabilities),
    visualStyleTags: freeze(candidate.visualStyleTags),
    sceneTags: freeze(candidate.sceneTags),
    source: Object.freeze({ ...candidate.source }),
  })
}

function sourceCandidate(source: SourceRecord): ImageOptimizationCandidate['source'] {
  return {
    title: source.title,
    url: source.url,
    license: source.license,
    redistributablePrompt: source.redistributablePrompt,
  }
}

function matchingTerms(
  record: TemplateRecord | CaseRecord,
  tagByValue: ReadonlyMap<string, TagRecord>,
): Omit<IndexedRecord, 'candidate' | 'globalFallback'> {
  const category = record.category === undefined ? [] : [record.category]
  const categoryTags = category.flatMap(value => termsForTag('category', value, tagByValue))
  const styleTags = record.visualStyleTags.flatMap(value => termsForTag('style', value, tagByValue))
  const sceneTags = record.sceneTags.flatMap(value => termsForTag('scene', value, tagByValue))
  const localized = 'guidance' in record
    ? [record.titles.en, record.titles.zh, record.guidance.en, record.guidance.zh]
    : [record.titles.en, record.titles.zh, record.summaries.en, record.summaries.zh]
  return {
    categoryTerms: termSet(categoryTags),
    styleTerms: termSet(styleTags),
    sceneTerms: termSet(sceneTags),
    metadataTokens: tokenSet([...localized, ...record.matchTerms, ...categoryTags, ...styleTags, ...sceneTags]),
  }
}

function intersects(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  for (const value of left) {
    if (right.has(value)) return true
  }
  return false
}

function scoreRecord(record: IndexedRecord, query: ImageOptimizationQuery): number {
  if (record.globalFallback) return 0
  const category = query.category === undefined ? [] : [query.category]
  const categoryTerms = termSet(category)
  const styleTerms = termSet(query.styleHints)
  const sceneTerms = termSet(query.sceneHints)
  const queryTokens = tokenSet([...category, ...query.styleHints, ...query.sceneHints, query.intent])
  return (intersects(categoryTerms, record.categoryTerms) ? 8 : 0)
    + (intersects(styleTerms, record.styleTerms) ? 4 : 0)
    + (intersects(sceneTerms, record.sceneTerms) ? 2 : 0)
    + (intersects(queryTokens, record.metadataTokens) ? 1 : 0)
}

function requiredContent(
  contents: ReadonlyMap<typeof REQUIRED_RESOURCES[number], string>,
  resource: typeof REQUIRED_RESOURCES[number],
): string {
  const content = contents.get(resource)
  if (content === undefined) throw new Error(`image-optimizer-library: missing required resource ${resource}`)
  return content
}

function loadProvider(assetRoot: string): ImageOptimizationProvider {
  const entries = readdirSync(assetRoot, { withFileTypes: true })
  const names = entries.map(entry => entry.name).sort(compareOrdinal)
  if (entries.some(entry => !entry.isFile())
    || names.length !== REQUIRED_RESOURCES.length
    || names.some((entry, index) => entry !== [...REQUIRED_RESOURCES].sort(compareOrdinal)[index])) {
    throw new Error('image-optimizer-library: assets must contain only the six required files')
  }
  const contents = new Map<typeof REQUIRED_RESOURCES[number], string>(REQUIRED_RESOURCES.map(resource => [
    resource,
    readFileSync(join(assetRoot, resource), 'utf8'),
  ]))
  const manifest = parseJson(requiredContent(contents, 'manifest.json'), manifestSchema, 'manifest.json')
  for (const resource of HASHED_RESOURCES) {
    const content = requiredContent(contents, resource)
    const expected = manifest.resources[resource]
    const bytes = Buffer.byteLength(content, 'utf8')
    const hash = createHash('sha256').update(content, 'utf8').digest('hex')
    if (bytes !== expected.bytes || hash !== expected.sha256) {
      throw new Error(`image-optimizer-library: ${resource} hash mismatch`)
    }
  }
  if (requiredContent(contents, 'LICENSE.upstream').trim().length === 0) {
    throw new Error('image-optimizer-library: LICENSE.upstream must not be empty')
  }
  const sources = parseJson(requiredContent(contents, 'sources.json'), z.array(sourceSchema), 'sources.json')
  const tags = parseJson(requiredContent(contents, 'tags.json'), z.array(tagSchema), 'tags.json')
  const templates = parseJson(requiredContent(contents, 'templates.json'), z.array(templateSchema), 'templates.json')
  const cases = parseJson(requiredContent(contents, 'cases.json'), z.array(caseSchema), 'cases.json')
  assertUnique(sources, 'source')
  assertUnique(tags, 'tag')
  assertUnique(templates, 'template')
  assertUnique(cases, 'case')
  if (manifest.counts.sources !== sources.length || manifest.counts.tags !== tags.length
    || manifest.counts.templates !== templates.length || manifest.counts.cases !== cases.length) {
    throw new Error('image-optimizer-library: manifest counts do not match resources')
  }
  if (manifest.snapshot.kind === 'bootstrap') {
    if (manifest.upstream.reviewedCheckout || manifest.upstream.commit !== null
      || manifest.snapshot.importedUpstreamTemplates !== 0 || manifest.snapshot.importedUpstreamCases !== 0) {
      throw new Error('image-optimizer-library: bootstrap snapshot must declare zero reviewed upstream imports')
    }
    if (sources.length !== 1 || tags.length !== 0 || templates.length !== 1 || cases.length !== 0
      || sources[0]?.id !== 'dsh-general-image' || templates[0]?.id !== 'general-image') {
      throw new Error('image-optimizer-library: bootstrap snapshot may contain only the DSH global fallback')
    }
  } else if (!manifest.upstream.reviewedCheckout || manifest.upstream.commit === null
    || manifest.snapshot.importedUpstreamTemplates !== templates.filter(item => item.id !== 'general-image').length
    || manifest.snapshot.importedUpstreamCases !== cases.length) {
    throw new Error('image-optimizer-library: reviewed snapshot declarations do not match imported resources')
  }

  const sourceById = new Map(sources.map(source => [source.id, source]))
  const tagByValue = new Map(tags.map(tag => [`${tag.kind}\0${tag.value}`, tag]))
  if (tagByValue.size !== tags.length) throw new Error('image-optimizer-library: duplicate tag kind and value')
  const templateIds = new Set(templates.map(template => template.id))
  const caseIds = new Set(cases.map(item => item.id))
  const requireSource = (id: string): SourceRecord => {
    const source = sourceById.get(id)
    if (source === undefined) throw new Error(`image-optimizer-library: missing source ${JSON.stringify(id)}`)
    return source
  }
  const requireTag = (kind: TagRecord['kind'], value: string): void => {
    if (!tagByValue.has(`${kind}\0${value}`)) {
      throw new Error(`image-optimizer-library: missing ${kind} tag ${JSON.stringify(value)}`)
    }
  }
  const reviewedCommit = manifest.upstream.commit
  for (const source of sources) {
    if (source.origin === 'dsh') {
      if (source.id !== 'dsh-general-image') {
        throw new Error(`image-optimizer-library: unexpected DSH source ${JSON.stringify(source.id)}`)
      }
      continue
    }
    if (reviewedCommit === null || source.upstreamPath === undefined || source.upstreamRecordUrl === undefined) {
      throw new Error(`image-optimizer-library: upstream source ${source.id} requires reviewed commit fields`)
    }
    assertSafeUpstreamPath(source.upstreamPath, `source ${source.id}`)
    const expectedUrl = `${UPSTREAM_REPOSITORY}/blob/${reviewedCommit}/${source.upstreamPath.replaceAll('\\', '/')}`
    if (source.upstreamRecordUrl !== expectedUrl) {
      throw new Error(`image-optimizer-library: source ${source.id} has an inconsistent commit-pinned URL`)
    }
  }
  for (const template of templates) {
    const source = requireSource(template.sourceId)
    if (template.id === 'general-image') {
      if (template.category !== undefined || source.id !== 'dsh-general-image') {
        throw new Error('image-optimizer-library: general-image must remain the DSH global fallback')
      }
    } else if (source.origin !== 'upstream') {
      throw new Error(`image-optimizer-library: imported template ${template.id} requires an upstream source`)
    }
    if (template.category !== undefined) requireTag('category', template.category)
    for (const value of template.visualStyleTags) requireTag('style', value)
    for (const value of template.sceneTags) requireTag('scene', value)
    for (const id of template.exampleCaseIds) {
      if (!caseIds.has(id)) throw new Error(`image-optimizer-library: template ${template.id} references missing case ${id}`)
    }
  }
  for (const item of cases) {
    const source = requireSource(item.sourceId)
    if (source.origin !== 'upstream') {
      throw new Error(`image-optimizer-library: imported case ${item.id} requires an upstream source`)
    }
    if (item.templateId !== undefined && !templateIds.has(item.templateId)) {
      throw new Error(`image-optimizer-library: case ${item.id} references missing template ${item.templateId}`)
    }
    if (item.prompt !== undefined && !source.redistributablePrompt) {
      throw new Error(`image-optimizer-library: case ${item.id} includes a prompt without redistribution permission`)
    }
    if (item.category !== undefined) requireTag('category', item.category)
    for (const value of item.visualStyleTags) requireTag('style', value)
    for (const value of item.sceneTags) requireTag('scene', value)
  }
  if (!templates.some(template => template.id === 'general-image' && template.category === undefined)) {
    throw new Error('image-optimizer-library: assets must contain the global general-image template')
  }

  const indexed: IndexedRecord[] = [
    ...templates.map((template): IndexedRecord => ({
      candidate: freezeCandidate({
        kind: 'template',
        id: template.id,
        ...(template.category === undefined ? {} : { category: template.category }),
        score: 0,
        composition: template.composition,
        visualStyle: template.visualStyle,
        scene: template.scene,
        preserve: template.preserve,
        avoid: template.avoid,
        requiredCapabilities: template.requiredCapabilities,
        visualStyleTags: template.visualStyleTags,
        sceneTags: template.sceneTags,
        source: sourceCandidate(requireSource(template.sourceId)),
      }),
      ...matchingTerms(template, tagByValue),
      globalFallback: template.id === 'general-image' && template.category === undefined,
    })),
    ...cases.map((item): IndexedRecord => ({
      candidate: freezeCandidate({
        kind: 'case',
        id: item.id,
        ...(item.category === undefined ? {} : { category: item.category }),
        score: 0,
        composition: item.prompt === undefined ? item.composition : [item.prompt, ...item.composition],
        visualStyle: item.visualStyle,
        scene: item.scene,
        preserve: item.preserve,
        avoid: item.avoid,
        requiredCapabilities: item.requiredCapabilities,
        visualStyleTags: item.visualStyleTags,
        sceneTags: item.sceneTags,
        source: sourceCandidate(requireSource(item.sourceId)),
      }),
      ...matchingTerms(item, tagByValue),
      globalFallback: false,
    })),
  ].sort((left, right) => compareOrdinal(left.candidate.id, right.candidate.id))
  const templatesById = new Map(indexed.filter(item => item.candidate.kind === 'template')
    .map(item => [item.candidate.id, item.candidate]))
  const casesById = new Map(indexed.filter(item => item.candidate.kind === 'case')
    .map(item => [item.candidate.id, item.candidate]))

  return {
    name: PROVIDER_NAME,
    rank: PROVIDER_RANK,
    resolve(selection: ImageOptimizationSelection, signal?: AbortSignal) {
      signal?.throwIfAborted()
      const resolved: ImageOptimizationCandidate[] = []
      if (selection.templateId !== undefined) {
        const template = templatesById.get(selection.templateId)
        if (template !== undefined) resolved.push(template)
      }
      for (const id of selection.caseIds) {
        signal?.throwIfAborted()
        const item = casesById.get(id)
        if (item !== undefined) resolved.push(item)
      }
      return Promise.resolve(Object.freeze(resolved))
    },
    match(query: ImageOptimizationQuery, signal?: AbortSignal) {
      signal?.throwIfAborted()
      const matches = indexed.flatMap((item) => {
        signal?.throwIfAborted()
        const score = scoreRecord(item, query)
        if (score === 0 && !item.globalFallback) return []
        const category = item.candidate.kind === 'template' && !item.globalFallback && query.category !== undefined
          ? query.category : item.candidate.category
        return [{
          ...item.candidate,
          ...(category === undefined ? {} : { category }),
          score,
        }]
      }).sort((left, right) => right.score - left.score || compareOrdinal(left.id, right.id))
      return Promise.resolve(Object.freeze(matches))
    },
  }
}

/**
 * Validate packaged resources and register the deterministic offline Provider.
 * @param ctx - Context carrying the image optimization registry.
 * @param config - optional external normalized-assets directory.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const assetRoot = config.assetRoot ?? fileURLToPath(new URL('../assets/', import.meta.url))
  if (!isAbsolute(assetRoot)) throw new Error('image-optimizer-library: assetRoot must be an absolute directory')
  ctx.imageOptimizer.registerProvider(loadProvider(assetRoot))
}
