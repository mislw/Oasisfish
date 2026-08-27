/**
 * Local directory corpus primitives for Skill search.
 * @module @deepseek-ai/dsh-skill-search-local
 */

export { discoverCorpus, type DiscoveredDocument } from './corpus.ts'
export { chunkDocument, type ChunkOptions, type SourceChunk } from './chunk.ts'
export { lexicalTokenStream } from './lexical.ts'
export {
  SKILL_SEARCH_SCHEMA_VERSION,
  SkillSearchStore,
  openSkillSearchStore,
  type EmbedChangedChunks,
  type IndexedSourceDocument,
  type LexicalCandidate,
  type SkillSearchModelIdentity,
  type SkillSearchRefreshRequest,
  type SkillSearchRefreshResult,
  type StoredVectorRow,
} from './store.ts'
