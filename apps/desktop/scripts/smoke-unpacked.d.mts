export interface BundledToolVersion {
  name: string
  version: string
}

export interface UnpackedSmokeResult {
  backgroundClosePreserved: boolean
  httpStatus: number
  reparsePoints: number
  tools: BundledToolVersion[]
  search: SkillSearchSmokeResult
  restartSearch: SkillSearchSmokeResult
  cacheReused: boolean
  corpusRevisions: Array<{ corpusKey: string; revision: number }>
}

export interface SkillSearchSmokeResult {
  skill: string
  query: string
  count: number
  hits: Array<{
    rank: number
    score: number
    path: string
    headings: string[]
    startLine: number
    endLine: number
    excerpt: string
  }>
}

export function verifyBundledTools(runtimeRoot: string): Promise<BundledToolVersion[]>
export function smokeUnpacked(unpackedRoot: string): Promise<UnpackedSmokeResult>
export function resolveUnpackedRootArgument(args: string[], defaultRoot: string): string
