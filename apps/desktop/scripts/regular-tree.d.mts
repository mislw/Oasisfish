/** One regular file found under an inspected tree. */
export interface RegularTreeFile {
  readonly path: string
  readonly absolutePath: string
}

/** Enumerate one ordinary directory tree without following filesystem links. */
export function inspectRegularTree(root: string): Promise<{
  readonly files: RegularTreeFile[]
  readonly directories: string[]
}>
