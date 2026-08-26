import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  copyHarnessResources,
  harnessDeployArguments,
  materializeStagedLinks,
} from '../scripts/harness-deployment.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (path) => {
    await rm(path, { recursive: true, force: true })
  }))
})

describe('desktop Harness deployment', () => {
  it('keeps deploy settings compatible with the shared frozen lockfile', () => {
    const args = harnessDeployArguments('C:\\staging')

    expect(args).not.toContain('--config.auto-install-peers=false')
  })

  it('extends the proven SDK runtime closure with the product CLI', async () => {
    const desktop = JSON.parse(
      await readFile(new URL('../../desktop-runtime/package.json', import.meta.url), 'utf8'),
    ) as { dependencies: Record<string, string> }
    const sdk = JSON.parse(
      await readFile(new URL('../../../python/sdk-runtime/package.json', import.meta.url), 'utf8'),
    ) as { dependencies: Record<string, string> }

    expect(desktop.dependencies['@deepseek-ai/dsh']).toBe('workspace:^')
    for (const [name, version] of Object.entries(sdk.dependencies)) {
      expect(desktop.dependencies[name]).toBe(version)
    }
  })

  it('replaces staged package junctions with independent files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-links-'))
    temporaryDirectories.push(root)
    const nodeModules = join(root, 'node_modules')
    const source = join(root, 'source-package')
    const destination = join(nodeModules, 'example-package')
    await mkdir(source, { recursive: true })
    await mkdir(nodeModules, { recursive: true })
    await writeFile(join(source, 'package.json'), '{}\n')
    await symlink(source, destination, 'junction')

    await materializeStagedLinks(nodeModules)
    await rm(source, { recursive: true, force: true })

    expect((await lstat(destination)).isSymbolicLink()).toBe(false)
    await expect(readFile(join(destination, 'package.json'), 'utf8')).resolves.toBe('{}\n')
  })

  it('replaces the packaged Harness directory with the complete staged tree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-after-pack-'))
    temporaryDirectories.push(root)
    const source = join(root, 'source')
    const resources = join(root, 'resources')
    await mkdir(join(source, 'node_modules', '@deepseek-ai', 'dsh'), { recursive: true })
    await mkdir(join(resources, 'harness'), { recursive: true })
    await writeFile(join(source, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), '{}\n')
    await writeFile(join(resources, 'harness', 'stale.txt'), 'stale\n')

    await copyHarnessResources(source, resources)

    await expect(readFile(join(
      resources,
      'harness',
      'node_modules',
      '@deepseek-ai',
      'dsh',
      'package.json',
    ), 'utf8')).resolves.toBe('{}\n')
    await expect(readFile(join(resources, 'harness', 'stale.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
