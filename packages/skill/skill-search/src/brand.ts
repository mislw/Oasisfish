/** Branded identities owned by the Skill search service. @module @deepseek-ai/dsh-skill-search/brand */

import { brandString, type Branded } from '@deepseek-ai/dsh-brand'

/** Stable identity for one declared Skill corpus. */
export type SkillCorpusId = Branded<'SkillCorpusId'>

/**
 * Apply the corpus-id brand after the service derives a validated identity.
 * @param value - Validated serialized corpus identity.
 * @returns Branded corpus identity.
 */
export function SkillCorpusId(value: string): SkillCorpusId {
  return brandString<SkillCorpusId>(value)
}

/** Opaque name reserved by one Skill search provider registration. */
export type SkillSearchProviderName = Branded<'SkillSearchProviderName'>

/**
 * Apply the provider-name brand; the registry rejects blank names.
 * @param value - Provider name reserved for registry validation.
 * @returns Branded provider name.
 */
export function SkillSearchProviderName(value: string): SkillSearchProviderName {
  return brandString<SkillSearchProviderName>(value)
}
