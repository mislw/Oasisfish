export interface BundledToolVersion {
  name: string
  version: string
}

export interface UnpackedSmokeResult {
  httpStatus: number
  reparsePoints: number
  tools: BundledToolVersion[]
}

export function verifyBundledTools(runtimeRoot: string): Promise<BundledToolVersion[]>
export function smokeUnpacked(unpackedRoot: string): Promise<UnpackedSmokeResult>
export function resolveUnpackedRootArgument(args: string[], defaultRoot: string): string
