/** Effect-owned Provider registration and deterministic candidate collection. @module @deepseek-ai/dsh-image-optimizer/registry */

import type { Context } from '@deepseek-ai/cordis'
import { parseCandidate } from './schema.ts'
import type {
  ImageOptimizationCandidate,
  ImageOptimizationProvider,
  ImageOptimizationQuery,
  ImageOptimizationSelection,
} from './types.ts'

/** Provider metadata retained with one normalized candidate. */
export interface CollectedCandidate {
  candidate: ImageOptimizationCandidate
  provider: string
  providerRank: number
  explicit: boolean
}

function validateProviderIdentity(provider: ImageOptimizationProvider): void {
  if (provider.name.length === 0 || provider.name.trim() !== provider.name) {
    throw new Error('image optimization Provider name must be a non-empty trimmed string')
  }
  if (!Number.isFinite(provider.rank)) {
    throw new Error(`image optimization Provider rank must be finite: ${provider.name}`)
  }
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareAutomatic(left: CollectedCandidate, right: CollectedCandidate): number {
  return right.candidate.score - left.candidate.score
    || right.providerRank - left.providerRank
    || compareOrdinal(left.provider, right.provider)
    || compareOrdinal(left.candidate.id, right.candidate.id)
}

function explicitPosition(
  candidate: ImageOptimizationCandidate,
  selection: ImageOptimizationSelection,
): number | undefined {
  if (candidate.kind === 'template') {
    return candidate.id === selection.templateId ? 0 : undefined
  }
  const index = selection.caseIds.indexOf(candidate.id)
  return index < 0 ? undefined : index + 1
}

/** Registry whose contributions are owned by their Cordis effects. */
export class ImageOptimizationRegistry {
  private readonly providers = new Map<string, ImageOptimizationProvider>()

  /**
   * Register one Provider until the returned disposer runs.
   * @param ctx - current contributing Context that owns the registration effect.
   * @param provider - borrowed Provider contribution.
   * @returns synchronous fire-and-forget wrapper around the effect disposer.
   */
  registerProvider(ctx: Context, provider: ImageOptimizationProvider): () => void {
    validateProviderIdentity(provider)
    if (this.providers.has(provider.name)) {
      throw new Error(`duplicate image optimization Provider: ${provider.name}`)
    }
    const providers = this.providers
    const dispose = ctx.effect(function* () {
      providers.set(provider.name, provider)
      yield () => { providers.delete(provider.name) }
    }, `imageOptimizer.registerProvider(${JSON.stringify(provider.name)})`)
    return () => void dispose()
  }

  /**
   * Resolve explicit ids and collect deterministic automatic matches.
   * @param selection - explicit source ids requested by the Consumer.
   * @param query - provider-neutral matching fields.
   * @param signal - cooperative cancellation signal forwarded unchanged.
   * @returns normalized candidates with Provider ordering metadata.
   */
  async collect(
    selection: ImageOptimizationSelection,
    query: ImageOptimizationQuery,
    signal?: AbortSignal,
  ): Promise<readonly CollectedCandidate[]> {
    const providers = [...this.providers.values()].sort((left, right) =>
      right.rank - left.rank || compareOrdinal(left.name, right.name))
    const explicit: Array<CollectedCandidate & { position: number }> = []
    const automatic: CollectedCandidate[] = []

    for (const provider of providers) {
      signal?.throwIfAborted()
      if (selection.templateId !== undefined || selection.caseIds.length > 0) {
        const resolved = await provider.resolve(selection, signal)
        signal?.throwIfAborted()
        for (const input of resolved) {
          const candidate = parseCandidate(input)
          const position = explicitPosition(candidate, selection)
          if (position === undefined) continue
          explicit.push({ candidate, provider: provider.name, providerRank: provider.rank, explicit: true, position })
        }
      }
      const matched = await provider.match(query, signal)
      signal?.throwIfAborted()
      for (const input of matched) {
        const candidate = parseCandidate(input)
        automatic.push({ candidate, provider: provider.name, providerRank: provider.rank, explicit: false })
      }
    }

    explicit.sort((left, right) => left.position - right.position
      || right.providerRank - left.providerRank
      || compareOrdinal(left.provider, right.provider)
      || compareOrdinal(left.candidate.id, right.candidate.id))
    automatic.sort(compareAutomatic)

    const selected = new Set(explicit.map(item => `${item.provider}\0${item.candidate.kind}\0${item.candidate.id}`))
    return [
      ...explicit,
      ...automatic.filter(item => !selected.has(`${item.provider}\0${item.candidate.kind}\0${item.candidate.id}`)),
    ]
  }
}
