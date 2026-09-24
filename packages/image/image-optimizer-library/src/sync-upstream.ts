/** Offline normalizer for one operator-reviewed awesome-gpt-image-2 checkout. */

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'

const execFileAsync = promisify(execFile)
const UPSTREAM_REPOSITORY = 'https://github.com/freestylefly/awesome-gpt-image-2'
const DSH_REPOSITORY = 'https://github.com/deepseek-ai/deepseek-harness'
const STYLE_LIBRARY_PATH = 'data/style-library.json'
const CASES_PATH = 'data/cases.json'
const LICENSE_PATH = 'LICENSE'
const EXPECTED_ORIGINS = new Set([
  `${UPSTREAM_REPOSITORY}.git`,
  'git@github.com:freestylefly/awesome-gpt-image-2.git',
])
const EXECUTABLE_EXTENSIONS = new Set([
  '.bat', '.cmd', '.com', '.exe', '.js', '.mjs', '.cjs', '.ps1', '.sh', '.ts', '.tsx', '.vbs',
])

/** Files that one synchronization may create. */
export const ALLOWED_OUTPUTS = new Set([
  'manifest.json',
  'templates.json',
  'cases.json',
  'tags.json',
  'sources.json',
  'LICENSE.upstream',
])

/** Inputs for one pinned local-checkout synchronization. */
export interface SyncOptions {
  /** Absolute complete clean checkout root. */
  sourceRoot: string
  /** Absolute non-overlapping normalized-resource output directory. */
  outputRoot: string
  /** Lowercase 40-hex commit that must equal the checkout HEAD. */
  upstreamCommit: string
}

const localizedSchema = z.object({ en: z.string().min(1), zh: z.string().min(1) }).strict()
const localizedArraysSchema = z.object({
  en: z.array(z.string().min(1)),
  zh: z.array(z.string().min(1)),
}).strict()
const stringArraySchema = z.array(z.string().min(1))
const categorySchema = z.object({
  id: z.string().min(1),
  value: z.string().min(1),
  anchor: z.string().min(1),
  templateAnchor: z.string().min(1),
  cover: z.string().min(1),
  title: localizedSchema,
  description: localizedSchema,
}).strict()
const upstreamTagSchema = z.object({
  id: z.string().min(1),
  value: z.string().min(1),
  title: localizedSchema,
  keywords: stringArraySchema,
}).strict()
const upstreamTemplateSchema = z.object({
  id: z.string().min(1),
  anchor: z.string().min(1),
  cover: z.string().min(1),
  title: localizedSchema,
  description: localizedSchema,
  category: z.string().min(1),
  styles: stringArraySchema,
  scenes: stringArraySchema,
  tags: stringArraySchema,
  useWhen: localizedSchema,
  guidance: localizedArraysSchema,
  pitfalls: localizedArraysSchema,
  exampleCases: z.array(z.number().int().positive()),
}).strict()
const styleLibrarySchema = z.object({
  version: z.literal(1),
  repository: z.literal(UPSTREAM_REPOSITORY),
  templateDocument: z.string().min(1),
  tagLabels: z.record(z.string().min(1), localizedSchema),
  categories: z.array(categorySchema),
  styles: z.array(upstreamTagSchema),
  scenes: z.array(upstreamTagSchema),
  templates: z.array(upstreamTemplateSchema),
}).strict()
const upstreamCaseSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  image: z.string().min(1),
  imageAlt: z.string(),
  sourceLabel: z.string(),
  sourceUrl: z.string(),
  prompt: z.string().min(1),
  promptPreview: z.string().min(1),
  category: z.string().min(1),
  styles: stringArraySchema,
  scenes: stringArraySchema,
  featured: z.boolean(),
  githubUrl: z.url(),
}).strict()
const casesFileSchema = z.object({
  repository: z.literal(UPSTREAM_REPOSITORY),
  totalCases: z.number().int().nonnegative(),
  categories: stringArraySchema,
  styles: stringArraySchema,
  scenes: stringArraySchema,
  cases: z.array(upstreamCaseSchema),
}).strict()

type CategoryInput = z.infer<typeof categorySchema>
type UpstreamTagInput = z.infer<typeof upstreamTagSchema>
type UpstreamTemplateInput = z.infer<typeof upstreamTemplateSchema>
type UpstreamCaseInput = z.infer<typeof upstreamCaseSchema>
type TagKind = 'category' | 'style' | 'scene'
interface GitTreeEntry {
  mode: string
  type: string
}
interface NormalizedSource {
  id: string
  origin: 'dsh' | 'upstream'
  title: string
  url: string
  upstreamPath?: string
  upstreamRecordUrl?: string
  license: string
  redistributablePrompt: boolean
  rightsNote: string
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function normalizedPath(path: string): string {
  return path.replaceAll('\\', '/')
}

function assertSafeRelativePath(path: string, subject: string): string {
  const normalized = normalizedPath(path)
  if (isAbsolute(path) || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`image library sync: ${subject} contains path traversal: ${JSON.stringify(path)}`)
  }
  if (normalized.startsWith('./') || normalized.includes('/./') || normalized.includes('\0') || normalized.includes(':')) {
    throw new Error(`image library sync: ${subject} must be a normalized relative path: ${JSON.stringify(path)}`)
  }
  return normalized
}

function assertSafeReferencedPath(path: string, subject: string): string {
  const normalized = assertSafeRelativePath(path, subject)
  if (EXECUTABLE_EXTENSIONS.has(extname(normalized).toLowerCase())) {
    throw new Error(`image library sync: ${subject} references executable content: ${normalized}`)
  }
  return normalized
}

function assertUnique<T>(values: readonly T[], key: (value: T) => string | number, subject: string): void {
  const seen = new Set<string | number>()
  for (const value of values) {
    const id = key(value)
    if (seen.has(id)) throw new Error(`image library sync: duplicate ${subject} id ${JSON.stringify(id)}`)
    seen.add(id)
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareOrdinal)
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => compareOrdinal(left, right))
    .map(([key, item]) => [key, stableValue(item)]))
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value), undefined, 2) + '\n'
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path))
}

async function git(sourceRoot: string, ...args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', sourceRoot, ...args], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
    return stdout.trim()
  } catch (error) {
    throw new Error(`image library sync: git ${args.join(' ')} failed`, { cause: error })
  }
}

function validateOptions(options: SyncOptions): void {
  const { sourceRoot, outputRoot, upstreamCommit } = options
  if (!isAbsolute(sourceRoot)) throw new Error('image library sync: --source must be an absolute directory')
  if (!isAbsolute(outputRoot)) throw new Error('image library sync: --output must be an absolute directory')
  if (!/^[0-9a-f]{40}$/u.test(upstreamCommit)) {
    throw new Error('image library sync: --commit must be a lowercase 40-hex commit')
  }
  const source = resolve(sourceRoot)
  const output = resolve(outputRoot)
  if (isInside(source, output) || isInside(output, source)) {
    throw new Error('image library sync: source and output directories must not overlap')
  }
}

async function validateCheckout(options: SyncOptions): Promise<void> {
  const { sourceRoot, upstreamCommit } = options
  const source = resolve(sourceRoot)
  const head = await git(source, 'rev-parse', 'HEAD')
  if (head !== upstreamCommit) throw new Error(`image library sync: checkout HEAD ${head} does not match ${upstreamCommit}`)
  const origin = await git(source, 'config', '--get', 'remote.origin.url')
  if (!EXPECTED_ORIGINS.has(origin)) throw new Error(`image library sync: unexpected origin ${JSON.stringify(origin)}`)
  const shallow = await git(source, 'rev-parse', '--is-shallow-repository')
  if (shallow !== 'false') throw new Error('image library sync: source checkout must contain complete Git history')
  const remoteRefs = (await git(
    source,
    'for-each-ref',
    '--format=%(refname)',
    '--contains',
    upstreamCommit,
    'refs/remotes/origin',
  )).split('\n').filter(ref => ref.length > 0 && ref !== 'refs/remotes/origin/HEAD')
  if (remoteRefs.length === 0) {
    throw new Error('image library sync: supplied commit is not reachable from origin remote-tracking history')
  }
  const status = await git(source, 'status', '--porcelain=v1', '--untracked-files=all')
  if (status.length > 0) throw new Error('image library sync: source checkout must be clean')
}

async function readUtf8(path: string, subject: string): Promise<string> {
  const bytes = await readFile(path)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error) {
    throw new Error(`image library sync: ${subject} is not valid UTF-8`, { cause: error })
  }
}

async function readJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const raw = await readUtf8(path, path)
  try {
    return schema.parse(JSON.parse(raw) as unknown)
  } catch (error) {
    throw new Error(`image library sync: invalid structured input ${path}`, { cause: error })
  }
}

async function pinnedTree(sourceRoot: string, commit: string): Promise<ReadonlyMap<string, GitTreeEntry>> {
  const raw = await git(sourceRoot, 'ls-tree', '-r', '-z', '--full-tree', commit)
  const entries = new Map<string, GitTreeEntry>()
  for (const record of raw.split('\0')) {
    if (record.length === 0) continue
    const separator = record.indexOf('\t')
    const metadata = record.slice(0, separator).split(' ')
    const path = record.slice(separator + 1)
    const mode = metadata[0]
    const type = metadata[1]
    if (separator < 0 || mode === undefined || type === undefined) {
      throw new Error('image library sync: could not parse pinned Git tree')
    }
    entries.set(path, { mode, type })
  }
  return entries
}

function requirePinnedPath(tree: ReadonlyMap<string, GitTreeEntry>, path: string, subject: string): string {
  const normalized = assertSafeReferencedPath(path, subject)
  const entry = tree.get(normalized)
  if (entry === undefined) {
    throw new Error(`image library sync: ${subject} is not present at the pinned commit: ${normalized}`)
  }
  if (entry.type !== 'blob' || entry.mode !== '100644') {
    throw new Error(`image library sync: ${subject} must be a non-executable tracked file: ${normalized}`)
  }
  return normalized
}

function webImagePath(path: string, subject: string): string {
  if (!path.startsWith('/images/')) {
    throw new Error(`image library sync: ${subject} must use an /images/ path`)
  }
  return assertSafeReferencedPath(`data${path}`, subject)
}

function githubDocumentPath(url: string, subject: string): string {
  const parsed = new URL(url)
  const prefix = '/freestylefly/awesome-gpt-image-2/blob/main/'
  if (parsed.origin !== 'https://github.com' || !parsed.pathname.startsWith(prefix)) {
    throw new Error(`image library sync: ${subject} must reference the expected upstream repository`)
  }
  return assertSafeReferencedPath(decodeURIComponent(parsed.pathname.slice(prefix.length)), subject)
}

function sourceRecordUrl(commit: string, path: string): string {
  return `${UPSTREAM_REPOSITORY}/blob/${commit}/${path}`
}

function requireValue<T extends { value: string }>(
  values: ReadonlyMap<string, T>,
  value: string,
  subject: string,
): T {
  const found = values.get(value)
  if (found === undefined) throw new Error(`image library sync: ${subject} references missing value ${JSON.stringify(value)}`)
  return found
}

function normalizedTag(kind: TagKind, tag: CategoryInput | UpstreamTagInput): Record<string, unknown> {
  const category = 'description' in tag
  return {
    id: `${kind}:${tag.id}`,
    kind,
    value: tag.value,
    labels: tag.title,
    descriptions: category ? tag.description : tag.title,
    keywords: uniqueStrings([
      tag.value,
      tag.title.en,
      tag.title.zh,
      ...(category ? [] : tag.keywords),
    ]),
  }
}

function caseId(id: number): string {
  return `case-${id}`
}

function normalizeTemplate(template: UpstreamTemplateInput): Record<string, unknown> {
  return {
    id: template.id,
    titles: template.title,
    guidance: {
      en: [template.useWhen.en, ...template.guidance.en].join(' '),
      zh: [template.useWhen.zh, ...template.guidance.zh].join(' '),
    },
    category: template.category,
    visualStyleTags: template.styles,
    sceneTags: template.scenes,
    sourceId: 'upstream-style-library',
    composition: template.guidance.en,
    visualStyle: template.styles,
    scene: template.scenes,
    preserve: [],
    avoid: template.pitfalls.en,
    requiredCapabilities: [],
    exampleCaseIds: template.exampleCases.map(caseId),
    matchTerms: uniqueStrings([
      template.title.en,
      template.title.zh,
      template.description.en,
      template.description.zh,
      template.useWhen.en,
      template.useWhen.zh,
      ...template.tags,
      ...template.guidance.en,
      ...template.guidance.zh,
    ]),
  }
}

function normalizeCase(item: UpstreamCaseInput, templateId: string | undefined): Record<string, unknown> {
  const summary = item.imageAlt.length === 0 ? item.title : item.imageAlt
  return {
    id: caseId(item.id),
    titles: { en: item.title, zh: item.title },
    summaries: { en: summary, zh: summary },
    category: item.category,
    visualStyleTags: item.styles,
    sceneTags: item.scenes,
    ...(templateId === undefined ? {} : { templateId }),
    sourceId: `upstream-case-${item.id}`,
    composition: [],
    visualStyle: item.styles,
    scene: item.scenes,
    preserve: [],
    avoid: [],
    requiredCapabilities: [],
    matchTerms: uniqueStrings([item.title, item.imageAlt, item.sourceLabel]),
  }
}

async function validateReplaceableOutput(outputRoot: string, subject = 'output'): Promise<boolean> {
  let root
  try {
    root = await lstat(outputRoot)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
  if (!root.isDirectory() || root.isSymbolicLink()) {
    throw new Error(`image library sync: ${subject} must be a real directory`)
  }
  for (const entry of await readdir(outputRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !ALLOWED_OUTPUTS.has(entry.name)) {
      throw new Error(`image library sync: ${subject} contains unexpected entry ${JSON.stringify(entry.name)}`)
    }
  }
  return true
}

function replacementBackupRoot(outputRoot: string): string {
  return resolve(dirname(outputRoot), `.${basename(outputRoot)}.backup`)
}

async function recoverInterruptedReplacement(outputRoot: string): Promise<void> {
  const backupRoot = replacementBackupRoot(outputRoot)
  const backupExists = await validateReplaceableOutput(backupRoot, 'retained backup')
  if (!backupExists) return
  const outputExists = await validateReplaceableOutput(outputRoot)
  if (outputExists) {
    await rm(backupRoot, { recursive: true, force: true })
    return
  }
  await rename(backupRoot, outputRoot)
}

async function validateStagedSnapshot(root: string, expected: ReadonlyMap<string, string>): Promise<void> {
  const entries = (await readdir(root, { withFileTypes: true })).sort((left, right) => compareOrdinal(left.name, right.name))
  const expectedNames = [...expected.keys()].sort(compareOrdinal)
  if (entries.length !== expectedNames.length || entries.some((entry, index) => (
    !entry.isFile() || entry.name !== expectedNames[index]
  ))) {
    throw new Error('image library sync: staged snapshot has unexpected resources')
  }
  for (const [name, content] of expected) {
    const staged = await readUtf8(resolve(root, name), `staged ${name}`)
    if (staged !== content) throw new Error(`image library sync: staged ${name} does not match generated content`)
    if (name.endsWith('.json')) {
      try {
        JSON.parse(staged)
      } catch (error) {
        throw new Error(`image library sync: staged ${name} is not valid JSON`, { cause: error })
      }
    }
  }
}

async function replaceOutput(outputRoot: string, stageRoot: string): Promise<void> {
  const existed = await validateReplaceableOutput(outputRoot)
  if (!existed) {
    await rename(stageRoot, outputRoot)
    return
  }
  const backupRoot = replacementBackupRoot(outputRoot)
  await rename(outputRoot, backupRoot)
  try {
    await rename(stageRoot, outputRoot)
  } catch (error) {
    await rename(backupRoot, outputRoot)
    throw error
  }
  await rm(backupRoot, { recursive: true, force: true })
}

/**
 * Normalize one complete operator-reviewed local checkout into deterministic runtime assets.
 * @param options - absolute source/output directories and the checkout's exact reviewed commit.
 * @returns completion after a validated staged snapshot replaces the output directory.
 */
export async function syncUpstream(options: SyncOptions): Promise<void> {
  validateOptions(options)
  await recoverInterruptedReplacement(resolve(options.outputRoot))
  await validateCheckout(options)
  const sourceRoot = resolve(options.sourceRoot)
  const outputRoot = resolve(options.outputRoot)
  const tree = await pinnedTree(sourceRoot, options.upstreamCommit)
  for (const path of [LICENSE_PATH, STYLE_LIBRARY_PATH, CASES_PATH]) {
    requirePinnedPath(tree, path, `required input ${path}`)
  }

  const library = await readJson(resolve(sourceRoot, STYLE_LIBRARY_PATH), styleLibrarySchema)
  const casesFile = await readJson(resolve(sourceRoot, CASES_PATH), casesFileSchema)
  if (casesFile.totalCases !== casesFile.cases.length) {
    throw new Error('image library sync: cases totalCases does not match cases length')
  }
  assertUnique(library.categories, item => item.id, 'category')
  assertUnique(library.categories, item => item.value, 'category value')
  assertUnique(library.styles, item => item.id, 'style')
  assertUnique(library.styles, item => item.value, 'style value')
  assertUnique(library.scenes, item => item.id, 'scene')
  assertUnique(library.scenes, item => item.value, 'scene value')
  assertUnique(library.templates, item => item.id, 'template')
  assertUnique(casesFile.cases, item => item.id, 'case')

  const categories = new Map(library.categories.map(item => [item.value, item]))
  const styles = new Map(library.styles.map(item => [item.value, item]))
  const scenes = new Map(library.scenes.map(item => [item.value, item]))
  const casesById = new Map(casesFile.cases.map(item => [item.id, item]))
  const templateByCase = new Map<number, string>()

  requirePinnedPath(tree, library.templateDocument, 'templateDocument')
  for (const category of library.categories) {
    requirePinnedPath(tree, webImagePath(category.cover, `category ${category.id} cover`), `category ${category.id} cover`)
  }
  for (const template of library.templates) {
    requireValue(categories, template.category, `template ${template.id}`)
    for (const value of template.styles) requireValue(styles, value, `template ${template.id} style`)
    for (const value of template.scenes) requireValue(scenes, value, `template ${template.id} scene`)
    requirePinnedPath(tree, webImagePath(template.cover, `template ${template.id} cover`), `template ${template.id} cover`)
    for (const id of template.exampleCases) {
      if (!casesById.has(id)) throw new Error(`image library sync: template ${template.id} references missing case ${id}`)
      const existing = templateByCase.get(id)
      if (existing === undefined || compareOrdinal(template.id, existing) < 0) templateByCase.set(id, template.id)
    }
  }
  for (const item of casesFile.cases) {
    requireValue(categories, item.category, `case ${item.id}`)
    for (const value of item.styles) requireValue(styles, value, `case ${item.id} style`)
    for (const value of item.scenes) requireValue(scenes, value, `case ${item.id} scene`)
    requirePinnedPath(tree, webImagePath(item.image, `case ${item.id} image`), `case ${item.id} image`)
    requirePinnedPath(tree, githubDocumentPath(item.githubUrl, `case ${item.id} githubUrl`), `case ${item.id} githubUrl`)
  }

  const normalizedSources: NormalizedSource[] = [
    {
      id: 'dsh-general-image',
      origin: 'dsh',
      title: 'DeepSeek Harness general image fallback',
      url: DSH_REPOSITORY,
      license: 'MIT',
      redistributablePrompt: true,
      rightsNote: 'DSH-owned fallback metadata and prompt fragments.',
    },
    {
      id: 'upstream-style-library',
      origin: 'upstream',
      title: 'awesome-gpt-image-2 style library',
      url: UPSTREAM_REPOSITORY,
      upstreamPath: STYLE_LIBRARY_PATH,
      upstreamRecordUrl: sourceRecordUrl(options.upstreamCommit, STYLE_LIBRARY_PATH),
      license: 'MIT',
      redistributablePrompt: false,
      rightsNote: 'Imported from the operator-reviewed MIT-licensed upstream commit.',
    },
    ...casesFile.cases.map((item): NormalizedSource => ({
      id: `upstream-case-${item.id}`,
      origin: 'upstream',
      title: item.sourceLabel.length === 0 ? `awesome-gpt-image-2 case ${item.id}` : item.sourceLabel,
      url: URL.canParse(item.sourceUrl) ? item.sourceUrl : item.githubUrl,
      upstreamPath: CASES_PATH,
      upstreamRecordUrl: sourceRecordUrl(options.upstreamCommit, CASES_PATH),
      license: 'NOASSERTION',
      redistributablePrompt: false,
      rightsNote: 'Third-party prompt and image redistribution rights are not asserted; only case metadata is imported.',
    })),
  ]
  normalizedSources.sort((left, right) => compareOrdinal(left.id, right.id))
  const normalizedTags = [
    ...library.categories.map(item => normalizedTag('category', item)),
    ...library.styles.map(item => normalizedTag('style', item)),
    ...library.scenes.map(item => normalizedTag('scene', item)),
  ].sort((left, right) => compareOrdinal(String(left.id), String(right.id)))
  const normalizedTemplates = library.templates.map(normalizeTemplate)
  normalizedTemplates.push({
    id: 'general-image',
    titles: { en: 'General image', zh: '通用图像' },
    guidance: {
      en: 'Use a clear focal hierarchy and preserve the requested subject.',
      zh: '使用清晰的视觉层级并保留请求的主体。',
    },
    visualStyleTags: [],
    sceneTags: [],
    sourceId: 'dsh-general-image',
    composition: ['Use a clear focal hierarchy around the requested subject.'],
    visualStyle: [],
    scene: [],
    preserve: ['requested subject identity'],
    avoid: ['unrequested text', 'watermarks'],
    requiredCapabilities: [],
    exampleCaseIds: [],
    matchTerms: [],
  })
  normalizedTemplates.sort((left, right) => compareOrdinal(String(left.id), String(right.id)))
  const normalizedCases = casesFile.cases
    .map(item => normalizeCase(item, templateByCase.get(item.id)))
    .sort((left, right) => compareOrdinal(String(left.id), String(right.id)))

  const resources = new Map<string, string>([
    ['LICENSE.upstream', await readUtf8(resolve(sourceRoot, LICENSE_PATH), LICENSE_PATH)],
    ['cases.json', stableJson(normalizedCases)],
    ['sources.json', stableJson(normalizedSources)],
    ['tags.json', stableJson(normalizedTags)],
    ['templates.json', stableJson(normalizedTemplates)],
  ])
  const manifest = {
    schemaVersion: 1,
    provider: { name: 'image-optimizer-library', rank: 100 },
    snapshot: {
      kind: 'reviewed-upstream',
      importedUpstreamTemplates: library.templates.length,
      importedUpstreamCases: casesFile.cases.length,
      note: 'Generated from the complete clean checkout at the operator-reviewed upstream.commit.',
    },
    upstream: {
      repository: UPSTREAM_REPOSITORY,
      commit: options.upstreamCommit,
      reviewedCheckout: true,
      licenseFile: 'LICENSE.upstream',
    },
    counts: {
      templates: normalizedTemplates.length,
      cases: normalizedCases.length,
      tags: normalizedTags.length,
      sources: normalizedSources.length,
    },
    resources: Object.fromEntries([...resources].map(([name, content]) => [name, {
      bytes: Buffer.byteLength(content, 'utf8'),
      sha256: sha256(content),
    }])),
  }
  resources.set('manifest.json', stableJson(manifest))

  const parent = dirname(outputRoot)
  await mkdir(parent, { recursive: true })
  const stageRoot = await mkdtemp(resolve(parent, `.${basename(outputRoot)}.stage-`))
  let published = false
  try {
    for (const [name, content] of resources) await writeFile(resolve(stageRoot, name), content, 'utf8')
    await validateStagedSnapshot(stageRoot, resources)
    await replaceOutput(outputRoot, stageRoot)
    published = true
  } finally {
    if (!published) await rm(stageRoot, { recursive: true, force: true })
  }
}

/**
 * Parse the strict command-line arguments accepted by the offline synchronizer.
 * @param argv - argument vector after the executable and script path.
 * @returns validated source, output, and commit strings for checkout validation.
 */
export function parseArguments(argv: readonly string[]): SyncOptions {
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (flag === undefined || value === undefined || !['--source', '--output', '--commit'].includes(flag)) {
      throw new Error('usage: sync-upstream --source <absolute> --output <absolute> --commit <40-hex>')
    }
    if (values.has(flag)) throw new Error(`image library sync: duplicate argument ${flag}`)
    values.set(flag, value)
  }
  const sourceRoot = values.get('--source')
  const outputRoot = values.get('--output')
  const upstreamCommit = values.get('--commit')
  if (sourceRoot === undefined || outputRoot === undefined || upstreamCommit === undefined || values.size !== 3) {
    throw new Error('usage: sync-upstream --source <absolute> --output <absolute> --commit <40-hex>')
  }
  return { sourceRoot, outputRoot, upstreamCommit }
}
