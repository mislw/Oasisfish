export const STAGED_REQUIRED_FILES: readonly string[]
export const PACKAGED_REQUIRED_FILES: readonly string[]
export const RELEASE_REQUIRED_FILES: readonly string[]

export function verifyStagedProduct(
  resourcesRoot: string,
  requiredFiles?: readonly string[],
): Promise<void>
