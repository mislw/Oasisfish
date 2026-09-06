import { join } from 'node:path'

const LEGACY_DATA_DIRECTORY = 'DeepSeek Harness'

/** Preserve the desktop data directory while the visible product name changes. */
export function resolveDesktopDataRoot(appDataRoot: string): string {
  return join(appDataRoot, LEGACY_DATA_DIRECTORY)
}

/** Immutable product resources and mutable per-user desktop state. */
export interface DesktopPaths {
  resourcesRoot: string
  runtimeRoot: string
  harnessRoot: string
  nodeExecutable: string
  dshEntry: string
  dataRoot: string
  logDirectory: string
}

/**
 * Resolve every product path from Electron-owned roots.
 * @param resourcesRoot - `process.resourcesPath` in a packaged app or the staged resource directory in development.
 * @param dataRoot - Electron's per-user `userData` directory.
 * @returns Paths consumed by the desktop supervisor and child environment.
 */
export function resolveDesktopPaths(resourcesRoot: string, dataRoot: string): DesktopPaths {
  const runtimeRoot = join(resourcesRoot, 'runtime')
  const harnessRoot = join(resourcesRoot, 'harness')
  return {
    resourcesRoot,
    runtimeRoot,
    harnessRoot,
    nodeExecutable: join(runtimeRoot, 'node', 'node.exe'),
    dshEntry: join(harnessRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    dataRoot,
    logDirectory: join(dataRoot, 'logs'),
  }
}
