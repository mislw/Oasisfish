import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (path) => {
    await rm(path, { recursive: true, force: true })
  }))
})

describe('runtime closure verification', () => {
  it('follows product app dependencies before accepting a deploy root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-closure-'))
    temporaryDirectories.push(root)
    const manifest = join(root, 'package.json')
    await writeFile(manifest, `${JSON.stringify({
      name: 'desktop-closure-fixture',
      dependencies: { '@deepseek-ai/dsh': 'workspace:^' },
    })}\n`)

    const result = spawnSync(process.execPath, [
      '--import',
      'tsx/esm',
      fileURLToPath(new URL('../../../scripts/verify-runtime-closure.ts', import.meta.url)),
      '--manifest',
      manifest,
    ], { encoding: 'utf8' })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('@deepseek-ai/dsh -> @deepseek-ai/dsh-app-boot')
  })
})
