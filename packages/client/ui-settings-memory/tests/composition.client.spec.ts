import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { apply as applyHost } from '../src/index.ts'

const root = resolve(import.meta.dirname, '../../../..')
const readJson = (path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8')) as {
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

describe('memory Settings product composition', () => {
  it('keeps the Host loader body side-effect free', () => {
    expect(() => { applyHost() }).not.toThrow()
  })

  it('mounts the generated memory Remote in the Client aggregate', () => {
    const source = readFileSync(resolve(root, 'packages/api/remotes/src/client/index.ts'), 'utf8')
    expect(source).toContain("import memoryRemote from '@deepseek-ai/dsh-memory/remote'")
    expect(source).toContain('memoryRemote,')
    expect(readJson('packages/api/remotes/package.json').devDependencies)
      .toHaveProperty('@deepseek-ai/dsh-memory', 'workspace:^')
  })

  it('ships the Settings plugin in the Web Loader roster and dependency closure', () => {
    const patch = readFileSync(resolve(root, 'packages/bundle/web-app/cordis.patch.yml'), 'utf8')
    expect(patch).toContain("name: '@deepseek-ai/dsh-client-ui-settings-memory'")
    expect(readJson('packages/bundle/web-app/package.json').dependencies)
      .toHaveProperty('@deepseek-ai/dsh-client-ui-settings-memory', 'workspace:^')
    expect(patch).toContain("name: '@deepseek-ai/dsh-memory-local'")
    expect(readJson('packages/bundle/web-app/package.json').dependencies)
      .toHaveProperty('@deepseek-ai/dsh-memory-local', 'workspace:^')
    expect(patch).toContain("name: '@deepseek-ai/dsh-tool-memory'")
    expect(readJson('packages/bundle/web-app/package.json').dependencies)
      .toHaveProperty('@deepseek-ai/dsh-tool-memory', 'workspace:^')
  })

  it('registers the package in the Client project-reference aggregate', () => {
    const config = readFileSync(resolve(root, 'tsconfig.client.json'), 'utf8')
    expect(config).toContain('./packages/client/ui-settings-memory')
  })
})
