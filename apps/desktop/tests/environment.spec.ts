import { delimiter, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildHarnessEnvironment } from '../src/environment.ts'
import { resolveDesktopPaths, type DesktopPaths } from '../src/paths.ts'

const paths: DesktopPaths = {
  resourcesRoot: 'C:\\Program Files\\DeepSeek Harness\\resources',
  runtimeRoot: 'C:\\Program Files\\DeepSeek Harness\\resources\\runtime',
  harnessRoot: 'C:\\Program Files\\DeepSeek Harness\\resources\\harness',
  nodeExecutable: 'C:\\Program Files\\DeepSeek Harness\\resources\\runtime\\node\\node.exe',
  dshEntry: 'C:\\Program Files\\DeepSeek Harness\\resources\\harness\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js',
  dataRoot: 'C:\\Users\\tester\\AppData\\Roaming\\DeepSeek Harness',
  logDirectory: 'C:\\Users\\tester\\AppData\\Roaming\\DeepSeek Harness\\logs',
}

describe('buildHarnessEnvironment', () => {
  it('prepends every bundled tool directory without mutating the inherited environment', () => {
    const inherited = {
      PATH: 'C:\\Windows\\System32',
      NODE_OPTIONS: '--trace-warnings',
      ELECTRON_RUN_AS_NODE: '1',
      DEEPSEEK_API_KEY: 'secret',
    }

    const environment = buildHarnessEnvironment(inherited, paths)

    expect(inherited).toHaveProperty('ELECTRON_RUN_AS_NODE', '1')
    expect(environment.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(environment.DEEPSEEK_API_KEY).toBe('secret')
    expect(environment.PATH?.split(delimiter)).toEqual([
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
      inherited.PATH,
    ])
  })

  it('keeps mutable Harness and language state below the app data directory', () => {
    const environment = buildHarnessEnvironment({}, paths)

    expect(environment).toMatchObject({
      DSH_BUNDLED_SKILL_DIR: join(paths.resourcesRoot, 'skills'),
      DSH_SKILL_SEARCH_MODEL_DIR: join(paths.resourcesRoot, 'models', 'bge-small-zh-v1.5'),
      DSH_SKILL_SEARCH_CACHE_DIR: join(paths.dataRoot, 'cache', 'skill-search'),
      DSH_HOME: join(paths.dataRoot, 'dsh'),
      XDG_CONFIG_HOME: join(paths.dataRoot, 'config'),
      XDG_DATA_HOME: join(paths.dataRoot, 'data'),
      XDG_CACHE_HOME: join(paths.dataRoot, 'cache'),
      PYTHONHOME: join(paths.runtimeRoot, 'python'),
      PYTHONUTF8: '1',
      PIP_DISABLE_PIP_VERSION_CHECK: '1',
      GIT_CONFIG_NOSYSTEM: '1',
    })
  })
})

describe('resolveDesktopPaths', () => {
  it('loads the CLI from the dependency-only Harness deployment root', () => {
    const resolved = resolveDesktopPaths(paths.resourcesRoot, paths.dataRoot)

    expect(resolved.dshEntry).toBe(join(
      paths.harnessRoot,
      'node_modules',
      '@deepseek-ai',
      'dsh',
      'lib',
      'bin.js',
    ))
  })
})
