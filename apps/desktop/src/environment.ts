import { delimiter, join } from 'node:path'
import type { DesktopPaths } from './paths.ts'

/**
 * Construct the environment inherited only by Harness and its tool subprocesses.
 * @param inherited - Environment received by the desktop application.
 * @param paths - Installed runtime and per-user data paths.
 * @returns A new environment object; the inherited object is not mutated.
 */
export function buildHarnessEnvironment(
  inherited: Readonly<NodeJS.ProcessEnv>,
  paths: DesktopPaths,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...inherited }
  const bundledPath = [
    join(paths.runtimeRoot, 'node'),
    join(paths.runtimeRoot, 'node-global'),
    join(paths.runtimeRoot, 'python'),
    join(paths.runtimeRoot, 'python', 'Scripts'),
    join(paths.runtimeRoot, 'git', 'cmd'),
    join(paths.runtimeRoot, 'git', 'bin'),
    join(paths.runtimeRoot, 'git', 'usr', 'bin'),
    join(paths.runtimeRoot, 'git', 'mingw64', 'bin'),
    join(paths.runtimeRoot, 'powershell'),
    join(paths.runtimeRoot, 'tools', 'ripgrep'),
    join(paths.runtimeRoot, 'tools', 'fd'),
    join(paths.runtimeRoot, 'tools', 'jq'),
    join(paths.runtimeRoot, 'tools', 'sevenzip', 'x64'),
  ]
  const inheritedPath = inherited.PATH ?? inherited.Path
  environment.PATH = inheritedPath === undefined
    ? bundledPath.join(delimiter)
    : [...bundledPath, inheritedPath].join(delimiter)
  delete environment.Path
  delete environment.ELECTRON_RUN_AS_NODE

  environment.DSH_HOME = join(paths.dataRoot, 'dsh')
  environment.XDG_CONFIG_HOME = join(paths.dataRoot, 'config')
  environment.XDG_DATA_HOME = join(paths.dataRoot, 'data')
  environment.XDG_CACHE_HOME = join(paths.dataRoot, 'cache')
  environment.PYTHONHOME = join(paths.runtimeRoot, 'python')
  environment.PYTHONUTF8 = '1'
  environment.PIP_DISABLE_PIP_VERSION_CHECK = '1'
  environment.GIT_CONFIG_NOSYSTEM = '1'
  return environment
}
