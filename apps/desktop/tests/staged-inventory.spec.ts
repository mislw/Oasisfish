import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PACKAGED_REQUIRED_FILES,
  STAGED_REQUIRED_FILES,
  verifyStagedProduct,
} from '../scripts/staged-inventory.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (path) => {
    await rm(path, { recursive: true, force: true })
  }))
})

describe('verifyStagedProduct', () => {
  it('requires the CLI boot package in the deployed Harness closure', () => {
    expect(STAGED_REQUIRED_FILES).toContain('harness/node_modules/@deepseek-ai/dsh-app-boot/package.json')
  })

  it('requires the desktop runtime notices beside the packaged resources', () => {
    expect(PACKAGED_REQUIRED_FILES).toContain('RUNTIME_NOTICES.md')
  })

  it('requires the bundled Oasis Wiki skill and its provenance in the packaged product', () => {
    expect(PACKAGED_REQUIRED_FILES).toEqual(expect.arrayContaining([
      'skills/oasis-wiki/SKILL.md',
      'skills/oasis-wiki/VERSION',
      'skills/oasis-wiki.provenance.json',
    ]))
  })

  it('rejects an incomplete desktop product with every missing relative path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-incomplete-'))
    temporaryDirectories.push(root)

    await expect(verifyStagedProduct(root)).rejects.toThrow(STAGED_REQUIRED_FILES[0])
  })

  it('accepts a product containing every required file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-complete-'))
    temporaryDirectories.push(root)
    for (const relativePath of STAGED_REQUIRED_FILES) {
      const path = join(root, relativePath)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, 'fixture')
    }

    await expect(verifyStagedProduct(root)).resolves.toBeUndefined()
  })
})
