/**
 * Provider-neutral Skill corpus search registry.
 * @module @deepseek-ai/dsh-skill-search
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { NamedEntries, ScopedLayers } from '@deepseek-ai/dsh-scope'
import type { ScopeKey, ScopeLayer } from '@deepseek-ai/dsh-scope'
import { isModelInvocable } from '@deepseek-ai/dsh-skill'
import type { SkillDefinition, SkillResourceBase } from '@deepseek-ai/dsh-skill'
import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'

/** Stable identifier for one declared Skill corpus. */
export type SkillCorpusId = string & { readonly __brand: 'SkillCorpusId' }

/** Deployment-owned declaration of searchable Skill resources. */
export interface SkillCorpusSpec {
  /** Skill name resolved through `ctx.skills`. */
  readonly skill: string
  /** Optional winning Skill provider required by this declaration. */
  readonly provider?: string
  /** Relative resource roots included in this corpus. */
  readonly roots: string[]
  /** Accepted lower-case file extensions including the leading dot. */
  readonly extensions: string[]
  /** Maximum bytes accepted from one file. */
  readonly maxFileBytes: number
  /** Maximum aggregate source bytes accepted by the corpus. */
  readonly maxCorpusBytes: number
  /** Maximum chunks retained for the corpus. */
  readonly maxChunks: number
}

/** A declared corpus after the Skill registry resolves its winning definition. */
export interface ResolvedSkillCorpus {
  /** Stable digest input used by providers as part of persistent identity. */
  readonly id: SkillCorpusId
  /** Loaded, model-invocable Skill definition. */
  readonly skill: SkillDefinition
  /** Provider-specific resource base from the loaded Skill. */
  readonly resourceBase: SkillResourceBase
  /** Validated deployment declaration. */
  readonly spec: SkillCorpusSpec
}

/** Model- or host-initiated search request. */
export interface SkillSearchRequest {
  /** Skill whose declared corpus should be searched. */
  readonly name: string
  /** Natural-language or exact-symbol query. */
  readonly query: string
  /** Maximum returned passages. */
  readonly limit?: number
}

/** One source passage returned by a Skill search provider. */
export interface SkillSearchHit {
  readonly skill: string
  readonly rank: number
  readonly score: number
  readonly path: string
  readonly headings: readonly string[]
  readonly startLine: number
  readonly endLine: number
  readonly excerpt: string
}

/** Complete provider-neutral Skill search result. */
export interface SkillSearchResult {
  readonly skill: string
  readonly query: string
  readonly hits: readonly SkillSearchHit[]
}

/** Stable failure categories exposed by the Skill search capability. */
export type SkillSearchErrorCode =
  | 'UNKNOWN_SKILL'
  | 'NOT_MODEL_INVOCABLE'
  | 'CORPUS_UNDECLARED'
  | 'UNSUPPORTED_RESOURCE_BASE'
  | 'CORPUS_LIMIT'
  | 'SOURCE_UNREADABLE'
  | 'MODEL_UNAVAILABLE'
  | 'ABORTED'

/** Structured Skill search failure. */
export class SkillSearchError extends Error {
  /**
   * @param code - Stable failure category.
   * @param message - Human-readable diagnostic without source or query text.
   * @param options - Optional native error options.
   */
  constructor(
    readonly code: SkillSearchErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'SkillSearchError'
  }
}

/** Caller context used for scope-sensitive and abortable search. */
export interface SkillSearchOptions {
  readonly cwd?: string
  readonly scope?: ScopeKey
  readonly signal?: AbortSignal
}

/** Registration-scoped provider lifecycle. */
export interface SkillSearchProviderControl {
  /** Aborts if registration fails or is disposed. */
  readonly signal: AbortSignal
}

/** Concrete search backend for one or more resolved corpus resource kinds. */
export interface SkillSearchProvider {
  /** Unique provider name within its registration layer. */
  readonly name: string
  /**
   * Return whether this provider can search the resolved corpus.
   * @param corpus - Loaded Skill plus deployment declaration.
   */
  readonly supports: (corpus: ResolvedSkillCorpus) => boolean
  /**
   * Search one resolved corpus.
   * @param corpus - Loaded Skill plus deployment declaration.
   * @param request - Caller query and optional result limit.
   * @param signal - Cancellation shared with Skill resolution.
   * @returns ranked source passages.
   */
  readonly search: (
    corpus: ResolvedSkillCorpus,
    request: SkillSearchRequest,
    signal: AbortSignal,
  ) => Promise<SkillSearchResult>
}

/** Skill search registry configuration. */
export interface Config {
  /** Explicit searchable corpora. */
  readonly corpora?: SkillCorpusSpec[]
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    skillSearch: SkillSearchRegistry
  }
}

interface SearchLayer extends ScopeLayer {
  readonly providers: NamedEntries<SkillSearchProvider>
}

function createLayer(): SearchLayer {
  return {
    providers: new NamedEntries(name => new Error(`a Skill search provider named "${name}" is already registered in this scope`)),
    isEmpty() {
      return this.providers.isEmpty()
    },
  }
}

function abortError(signal: AbortSignal): SkillSearchError {
  return new SkillSearchError('ABORTED', 'Skill search was cancelled.', { cause: signal.reason })
}

function requireActive(signal: AbortSignal): void {
  if (signal.aborted) throw abortError(signal)
}

function corpusId(skill: SkillDefinition, spec: SkillCorpusSpec): SkillCorpusId {
  return JSON.stringify({
    provider: skill.provider,
    skill: skill.name,
    roots: spec.roots,
    extensions: spec.extensions,
    maxFileBytes: spec.maxFileBytes,
    maxCorpusBytes: spec.maxCorpusBytes,
    maxChunks: spec.maxChunks,
  }) as SkillCorpusId
}

function validateCorpus(spec: SkillCorpusSpec): void {
  if (spec.skill.trim() === '') throw new Error('Skill corpus skill must be non-empty')
  if (spec.roots.length === 0) throw new Error(`Skill corpus "${spec.skill}" must declare at least one root`)
  if (spec.extensions.length === 0) throw new Error(`Skill corpus "${spec.skill}" must declare at least one extension`)
  for (const value of [spec.maxFileBytes, spec.maxCorpusBytes, spec.maxChunks]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Skill corpus "${spec.skill}" limits must be positive safe integers`)
  }
  if (spec.maxFileBytes > spec.maxCorpusBytes) {
    throw new Error(`Skill corpus "${spec.skill}" maxFileBytes cannot exceed maxCorpusBytes`)
  }
}

/** Layered registry that resolves Skills before delegating declared corpora to providers. */
export class SkillSearchRegistry extends Service {
  static Config: Schema<Config> = z.object({
    corpora: z.array(z.object({
      skill: z.string().required(),
      provider: z.string(),
      roots: z.array(z.string()).required(),
      extensions: z.array(z.string()).required(),
      maxFileBytes: z.number().required(),
      maxCorpusBytes: z.number().required(),
      maxChunks: z.number().required(),
    })).default([]),
  })

  private readonly corpora = new Map<string, SkillCorpusSpec>()
  private readonly layers = new ScopedLayers<SearchLayer>(() => createLayer(), () => {})

  /**
   * @param ctx - Cordis context carrying `ctx.skills`.
   * @param config - Explicit corpus declarations.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'skillSearch')
    for (const spec of config.corpora ?? []) {
      validateCorpus(spec)
      const key = `${spec.skill}\0${spec.provider ?? ''}`
      if (this.corpora.has(key)) throw new Error(`duplicate Skill corpus declaration for "${spec.skill}"`)
      this.corpora.set(key, spec)
    }
  }

  /**
   * Register a provider in the calling context's scope layer.
   * @param create - Synchronous provider factory receiving its disposal signal.
   * @returns exact Cordis effect disposer.
   */
  registerProvider(create: (control: SkillSearchProviderControl) => SkillSearchProvider): () => void {
    const lifecycle = new AbortController()
    try {
      const provider = create({ signal: lifecycle.signal })
      return this.layers.effect(this.ctx, (layer) => {
        const undo = layer.providers.insert(provider.name, provider)
        return () => {
          undo()
          lifecycle.abort(new Error(`Skill search provider "${provider.name}" disposed`))
        }
      }, { label: 'skillSearch.registerProvider()' })
    } catch (error) {
      lifecycle.abort(error)
      throw error
    }
  }

  /**
   * Resolve a model-invocable Skill and search its explicit corpus.
   * @param request - Skill name, query, and optional result limit.
   * @param options - cwd, scope, and cancellation inherited from the caller.
   * @returns provider-ranked source passages.
   */
  async search(request: SkillSearchRequest, options: SkillSearchOptions = {}): Promise<SkillSearchResult> {
    const signal = options.signal ?? new AbortController().signal
    requireActive(signal)
    const skill = await this.ctx.skills.get(request.name, options)
    requireActive(signal)
    if (skill === undefined) throw new SkillSearchError('UNKNOWN_SKILL', `Skill "${request.name}" is unknown or unavailable.`)
    if (!isModelInvocable(skill)) {
      throw new SkillSearchError('NOT_MODEL_INVOCABLE', `Skill "${request.name}" is not available for model invocation.`)
    }
    const spec = this.corpora.get(`${skill.name}\0${skill.provider}`) ?? this.corpora.get(`${skill.name}\0`)
    if (spec === undefined) {
      throw new SkillSearchError('CORPUS_UNDECLARED', `Skill "${skill.name}" has no declared searchable corpus.`)
    }
    const resourceBase = skill.resourceBase
    if (resourceBase === undefined) {
      throw new SkillSearchError('UNSUPPORTED_RESOURCE_BASE', `Skill "${skill.name}" has no searchable resource base.`)
    }
    const corpus: ResolvedSkillCorpus = {
      id: corpusId(skill, spec),
      skill,
      resourceBase,
      spec,
    }
    const providers = this.layers.merge(options.scope, layer => layer.providers)
    const provider = [...providers.values()].find(candidate => candidate.supports(corpus))
    if (provider === undefined) {
      throw new SkillSearchError(
        'UNSUPPORTED_RESOURCE_BASE',
        `No Skill search provider accepts the ${resourceBase.kind} resources for "${skill.name}".`,
      )
    }
    try {
      const result = await provider.search(corpus, request, signal)
      requireActive(signal)
      return result
    } catch (error) {
      if (signal.aborted) throw abortError(signal)
      throw error
    }
  }
}

export default SkillSearchRegistry
