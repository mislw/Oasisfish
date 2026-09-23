/** Files that make Desktop Skill retrieval complete without runtime downloads. */
export const RETRIEVAL_REQUIRED_FILES: readonly string[]

/** Reject a staged Desktop runtime that omits any immutable retrieval resource. */
export function verifyStagedRetrievalResources(root: string): Promise<void>
