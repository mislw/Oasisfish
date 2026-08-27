/**
 * Local directory corpus primitives for Skill search.
 * @module @deepseek-ai/dsh-skill-search-local
 */

export { discoverCorpus, type DiscoveredDocument } from './corpus.ts'
export { chunkDocument, type ChunkOptions, type SourceChunk } from './chunk.ts'
export { lexicalTokenStream } from './lexical.ts'
