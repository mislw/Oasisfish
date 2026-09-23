/** One immutable file approved for Desktop Skill retrieval. */
export interface RetrievalApprovedFile {
  readonly path: string
  readonly sha256: string
}

/** Exact immutable files approved for Desktop Skill retrieval. */
export const RETRIEVAL_APPROVED_FILES: readonly RetrievalApprovedFile[]

/** Reject staged Desktop retrieval roots that differ from the approved regular-file inventory. */
export function verifyStagedRetrievalResources(root: string): Promise<void>
