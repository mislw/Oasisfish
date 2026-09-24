/** Request validation and deterministic generation-spec compilation. @module @deepseek-ai/dsh-image-optimizer/compiler */

import { ImageOptimizationError, ImageOptimizationInputError } from './errors.ts'
import type { CollectedCandidate } from './registry.ts'
import type {
  ExactTextRequirement,
  ImageGenerationSpec,
  ImageOptimizationEvidence,
  ImageOptimizationIssue,
  ImageOptimizationRequest,
  ImageOptimizerOptions,
  ImageReferencePlan,
} from './types.ts'

const SECTION_ORDER = [
  'Task',
  'References',
  'Composition',
  'Visual style',
  'Scene',
  'Exact text',
  'Output',
  'Preserve',
  'Avoid',
] as const

type SectionTitle = typeof SECTION_ORDER[number]

/** Validated request fields needed before Provider collection. */
export type PreparedRequest =
  | { status: 'ready'; references: readonly ImageReferencePlan[]; exactText: readonly ExactTextRequirement[] }
  | { status: 'needs_clarification'; issues: readonly ImageOptimizationIssue[] }

/** Limits materialized by the optimizer configuration. */
export interface CompilationLimits {
  maxCases: number
  maxPromptBytes: number
  maxExactTextEntries: number
}

function inputError(path: string, message: string): never {
  throw new ImageOptimizationInputError(`Invalid image optimization input at ${path}: ${message}`, path)
}

function assertPositiveSafeInteger(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    inputError(path, 'expected a positive safe integer')
  }
}

function assertNonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) inputError(path, 'expected a non-empty string')
}

function validateStrings(values: readonly string[], path: string): void {
  values.forEach((value, index) => {
    assertNonEmpty(value, `${path}[${index}]`)
  })
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left
  let b = right
  while (b !== 0) {
    const remainder = a % b
    a = b
    b = remainder
  }
  return a
}

function reducedRatio(width: number, height: number): string {
  const divisor = greatestCommonDivisor(width, height)
  return `${width / divisor}:${height / divisor}`
}

function validateAspectRatio(value: string, path: string): void {
  const normalized = value.trim()
  const match = /^(\d+):(\d+)$/.exec(normalized)
  if (match === null) inputError(path, 'expected a reduced positive integer ratio such as 16:9')
  const width = Number(match[1])
  const height = Number(match[2])
  assertPositiveSafeInteger(width, path)
  assertPositiveSafeInteger(height, path)
  if (reducedRatio(width, height) !== normalized) inputError(path, 'expected the ratio in reduced form')
}

function validateRequestStructure(request: ImageOptimizationRequest, maxExactTextEntries: number): void {
  assertNonEmpty(request.intent, 'intent')
  assertNonEmpty(request.locale, 'locale')
  if (request.category !== undefined) assertNonEmpty(request.category, 'category')
  if (request.templateId !== undefined) assertNonEmpty(request.templateId, 'templateId')
  validateStrings(request.preserve, 'preserve')
  validateStrings(request.avoid, 'avoid')
  validateStrings(request.styleHints, 'styleHints')
  validateStrings(request.sceneHints, 'sceneHints')
  validateStrings(request.caseIds, 'caseIds')

  const caseIds = new Set<string>()
  request.caseIds.forEach((id, index) => {
    if (caseIds.has(id)) inputError(`caseIds[${index}]`, `duplicate explicit case id ${JSON.stringify(id)}`)
    caseIds.add(id)
  })

  request.references.forEach((reference, index) => {
    assertPositiveSafeInteger(reference.inputIndex, `references[${index}].inputIndex`)
    assertPositiveSafeInteger(reference.priority, `references[${index}].priority`)
  })

  if (request.exactText.length > maxExactTextEntries) {
    inputError('exactText', `maximum ${maxExactTextEntries} entries exceeded`)
  }
  request.exactText.forEach((entry, index) => {
    assertNonEmpty(entry.text, `exactText[${index}].text`)
    if (entry.placement !== undefined) assertNonEmpty(entry.placement, `exactText[${index}].placement`)
  })

  assertPositiveSafeInteger(request.output.count, 'output.count')
  const hasWidth = request.output.width !== undefined
  const hasHeight = request.output.height !== undefined
  if (hasWidth !== hasHeight) inputError('output', 'width and height must be supplied together')
  if (request.output.width !== undefined && request.output.height !== undefined) {
    assertPositiveSafeInteger(request.output.width, 'output.width')
    assertPositiveSafeInteger(request.output.height, 'output.height')
  }
  if (request.output.aspectRatio !== undefined) {
    validateAspectRatio(request.output.aspectRatio, 'output.aspectRatio')
    if (request.output.width !== undefined && request.output.height !== undefined
      && request.output.aspectRatio.trim() !== reducedRatio(request.output.width, request.output.height)) {
      inputError('output.aspectRatio', 'ratio does not match the requested width and height')
    }
  }
}

function validateReferenceRoles(request: ImageOptimizationRequest): void {
  const targets = request.references.filter(reference => reference.role === 'edit-target')
  if (request.operation === 'edit') {
    if (targets.length === 0) {
      throw new ImageOptimizationError(
        'Image editing requires exactly one edit-target reference.',
        'IMAGE_EDIT_TARGET_REQUIRED',
        'references',
      )
    }
    if (targets.length > 1) {
      throw new ImageOptimizationError(
        'Image editing accepts only one edit-target reference.',
        'IMAGE_EDIT_TARGET_AMBIGUOUS',
        'references',
      )
    }
  }
  if (request.operation === 'variation') {
    if (targets.length > 0) {
      throw new ImageOptimizationError(
        'Image variation does not accept an edit-target reference.',
        'IMAGE_VARIATION_TARGET_UNSUPPORTED',
        'references',
      )
    }
    if (!request.references.some(reference => reference.role === 'content')) {
      throw new ImageOptimizationError(
        'Image variation requires at least one content reference.',
        'IMAGE_VARIATION_SOURCE_REQUIRED',
        'references',
      )
    }
  }
}

function resolveReferences(
  request: ImageOptimizationRequest,
  options: ImageOptimizerOptions | undefined,
): ImageReferencePlan[] {
  const resolved = options?.resolvedReferences ?? []
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

function normalizePlacement(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase('en-US') ?? ''
}

function analyzeExactText(
  request: ImageOptimizationRequest,
): { exactText: ExactTextRequirement[]; issues: ImageOptimizationIssue[] } {
  const exactText: ExactTextRequirement[] = []
  const originalIndexes: number[] = []
  for (const [index, entry] of request.exactText.entries()) {
    const duplicate = exactText.some(existing => existing.text === entry.text
      && existing.placement === entry.placement
      && existing.preserveCase === entry.preserveCase)
    if (duplicate) continue
    exactText.push({ ...entry })
    originalIndexes.push(index)
  }

  const issues: ImageOptimizationIssue[] = []
  for (let left = 0; left < exactText.length; left++) {
    for (let right = left + 1; right < exactText.length; right++) {
      const leftEntry = exactText[left]
      const rightEntry = exactText[right]
      if (leftEntry === undefined || rightEntry === undefined) continue
      const placement = normalizePlacement(leftEntry.placement)
      if (placement !== normalizePlacement(rightEntry.placement)) continue
      if (placement.length === 0 && leftEntry.text !== rightEntry.text) continue
      if (leftEntry.text === rightEntry.text && leftEntry.preserveCase === rightEntry.preserveCase) continue
      const leftPath = `exactText[${originalIndexes[left]}]`
      const rightPath = `exactText[${originalIndexes[right]}]`
      issues.push({
        code: 'IMAGE_EXACT_TEXT_CONFLICT',
        path: `${leftPath}, ${rightPath}`,
        message: `${leftPath} conflicts with ${rightPath} at placement ${JSON.stringify(placement)}.`,
      })
    }
  }
  return { exactText, issues }
}

/**
 * Validate request structure, domain role rules, references, and exact-text conflicts.
 * @param request - request supplied by a Consumer.
 * @param options - cancellation and durable reference transport.
 * @param maxExactTextEntries - configured exact-text entry limit.
 * @returns validated fields or caller-actionable clarification issues.
 */
export function prepareRequest(
  request: ImageOptimizationRequest,
  options: ImageOptimizerOptions | undefined,
  maxExactTextEntries: number,
): PreparedRequest {
  options?.signal?.throwIfAborted()
  validateRequestStructure(request, maxExactTextEntries)
  validateReferenceRoles(request)
  const references = resolveReferences(request, options)
  const { exactText, issues } = analyzeExactText(request)
  if (issues.length > 0) return { status: 'needs_clarification', issues }
  return { status: 'ready', references, exactText }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function selectedCandidates(
  request: ImageOptimizationRequest,
  collected: readonly CollectedCandidate[],
  maxCases: number,
): { candidates: CollectedCandidate[]; warnFallbackTemplate: boolean } {
  const explicit = collected.filter(item => item.explicit)
  const selectedExplicit: CollectedCandidate[] = []

  if (request.templateId !== undefined) {
    const template = explicit.find(item => item.candidate.kind === 'template'
      && item.candidate.id === request.templateId)
    if (template === undefined) {
      throw new ImageOptimizationError(
        `Image optimization template ${JSON.stringify(request.templateId)} was not found.`,
        'IMAGE_OPTIMIZATION_SOURCE_NOT_FOUND',
        'templateId',
      )
    }
    selectedExplicit.push(template)
  }
  request.caseIds.forEach((id, index) => {
    const candidate = explicit.find(item => item.candidate.kind === 'case' && item.candidate.id === id)
    if (candidate === undefined) {
      throw new ImageOptimizationError(
        `Image optimization case ${JSON.stringify(id)} was not found.`,
        'IMAGE_OPTIMIZATION_SOURCE_NOT_FOUND',
        `caseIds[${index}]`,
      )
    }
    selectedExplicit.push(candidate)
  })

  const automatic = collected.filter(item => !item.explicit)
  const categoryTemplate = request.category === undefined ? undefined : automatic.find(item =>
    item.candidate.kind === 'template' && item.candidate.category === request.category)
  const globalTemplate = automatic.find(item =>
    item.candidate.kind === 'template' && item.candidate.category === undefined)
  const fallbackTemplate = request.templateId === undefined ? categoryTemplate ?? globalTemplate : undefined
  const automaticCases = automatic.filter(item => item.candidate.kind === 'case').slice(0, maxCases)

  return {
    candidates: [
      ...selectedExplicit,
      ...(fallbackTemplate === undefined ? [] : [fallbackTemplate]),
      ...automaticCases,
    ],
    warnFallbackTemplate: fallbackTemplate !== undefined && automaticCases.length === 0,
  }
}

function buildEvidence(selected: readonly CollectedCandidate[]): ImageOptimizationEvidence[] {
  const evidence = new Map<string, {
    templateId?: string
    caseIds: string[]
    visualStyleTags: string[]
    sceneTags: string[]
  }>()
  for (const { candidate, provider } of selected) {
    let entry = evidence.get(provider)
    if (entry === undefined) {
      entry = { caseIds: [], visualStyleTags: [], sceneTags: [] }
      evidence.set(provider, entry)
    }
    if (candidate.kind === 'template' && entry.templateId === undefined) entry.templateId = candidate.id
    if (candidate.kind === 'case') entry.caseIds.push(candidate.id)
    entry.visualStyleTags.push(...candidate.visualStyleTags)
    entry.sceneTags.push(...candidate.sceneTags)
  }
  return [...evidence].map(([provider, entry]) => ({
    provider,
    ...(entry.templateId === undefined ? {} : { templateId: entry.templateId }),
    caseIds: unique(entry.caseIds),
    visualStyleTags: unique(entry.visualStyleTags),
    sceneTags: unique(entry.sceneTags),
  }))
}

function deriveCapabilities(
  request: ImageOptimizationRequest,
  selected: readonly CollectedCandidate[],
): string[] {
  const capabilities: string[] = []
  if (request.references.length > 1) capabilities.push('multiple-references')
  if (request.operation === 'edit') capabilities.push('local-editing')
  if (request.output.transparentBackground) capabilities.push('transparent-background')
  if (request.exactText.length > 0) capabilities.push('exact-text')
  const ratio = request.output.aspectRatio?.trim()
    ?? (request.output.width !== undefined && request.output.height !== undefined
      ? reducedRatio(request.output.width, request.output.height)
      : undefined)
  if (ratio !== undefined) capabilities.push(`aspect-ratio:${ratio}`)
  capabilities.push(...selected.flatMap(item => item.candidate.requiredCapabilities))
  return unique(capabilities)
}

function compilePrompt(sections: ReadonlyMap<SectionTitle, readonly string[]>): string {
  return SECTION_ORDER.flatMap((title) => {
    const lines = sections.get(title) ?? []
    return lines.length === 0 ? [] : [`## ${title}`, ...lines.map(line => `- ${line}`)]
  }).join('\n')
}

function promptSections(
  request: ImageOptimizationRequest,
  references: readonly ImageReferencePlan[],
  composition: readonly string[],
  visualStyle: readonly string[],
  scene: readonly string[],
  exactText: readonly ExactTextRequirement[],
  preserve: readonly string[],
  avoid: readonly string[],
): ReadonlyMap<SectionTitle, readonly string[]> {
  const sections = new Map<SectionTitle, readonly string[]>()
  sections.set('Task', [`${request.operation}: ${request.intent.trim()}`])
  sections.set('References', references.map(reference =>
    `image ${reference.inputIndex}: role=${reference.role}; priority=${reference.priority}`))
  sections.set('Composition', composition)
  sections.set('Visual style', visualStyle)
  sections.set('Scene', scene)
  sections.set('Exact text', exactText.map((entry) => {
    const placement = entry.placement === undefined ? '' : `; placement=${entry.placement.trim()}`
    return `text=${JSON.stringify(entry.text)}${placement}; preserveCase=${entry.preserveCase}`
  }))
  const output: string[] = []
  if (request.output.width !== undefined && request.output.height !== undefined) {
    output.push(`dimensions=${request.output.width}x${request.output.height}`)
  }
  if (request.output.aspectRatio !== undefined) output.push(`aspectRatio=${request.output.aspectRatio.trim()}`)
  output.push(`transparentBackground=${request.output.transparentBackground}`)
  output.push(`count=${request.output.count}`)
  sections.set('Output', output)
  sections.set('Preserve', preserve)
  sections.set('Avoid', avoid)
  return sections
}

/**
 * Select Provider evidence and compile a complete deterministic specification.
 * @param request - structurally and semantically validated request.
 * @param prepared - resolved references and conflict-free exact text.
 * @param collected - normalized Provider candidates in deterministic order.
 * @param limits - configured automatic-case and prepared-result limits.
 * @returns one executor-neutral specification.
 */
export function compileCandidates(
  request: ImageOptimizationRequest,
  prepared: Extract<PreparedRequest, { status: 'ready' }>,
  collected: readonly CollectedCandidate[],
  limits: CompilationLimits,
): ImageGenerationSpec {
  const { candidates, warnFallbackTemplate } = selectedCandidates(request, collected, limits.maxCases)
  const composition = unique(candidates.flatMap(item => item.candidate.composition))
  const visualStyle = unique([...request.styleHints, ...candidates.flatMap(item => item.candidate.visualStyle)])
  const scene = unique([...request.sceneHints, ...candidates.flatMap(item => item.candidate.scene)])
  const preserve = unique([...request.preserve, ...candidates.flatMap(item => item.candidate.preserve)])
  const avoid = unique([...request.avoid, ...candidates.flatMap(item => item.candidate.avoid)])
  const canonicalPrompt = compilePrompt(promptSections(
    request,
    prepared.references,
    composition,
    visualStyle,
    scene,
    prepared.exactText,
    preserve,
    avoid,
  ))
  const spec: ImageGenerationSpec = {
    schemaVersion: 1,
    operation: request.operation,
    canonicalPrompt,
    references: prepared.references,
    composition,
    visualStyle,
    scene,
    exactText: prepared.exactText,
    output: { ...request.output },
    preserve,
    negativeConstraints: avoid,
    requiredCapabilities: deriveCapabilities(request, candidates),
    evidence: buildEvidence(candidates),
    warnings: warnFallbackTemplate
      ? ['No automatic image optimization case matched; a general template was used.']
      : [],
  }
  const bytes = Buffer.byteLength(JSON.stringify({ status: 'prepared', spec }), 'utf8')
  if (bytes > limits.maxPromptBytes) {
    inputError('canonicalPrompt', `prepared result is ${bytes} UTF-8 bytes; maximum is ${limits.maxPromptBytes}`)
  }
  return spec
}
