import { cp, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { syncUpstream } from '../src/sync-upstream.ts'
import { prepareCheckout, syncFixture } from './harness.ts'

describe('offline upstream synchronization', () => {
  it.each([
    ['unknown field', 'unknown-field'],
    ['duplicate id', 'duplicate-id'],
    ['missing reference', 'missing-reference'],
    ['path traversal', 'path-traversal'],
    ['referenced executable', 'executable-reference'],
    ['tracked executable', 'tracked-executable'],
    ['invalid UTF-8 input', 'invalid-utf8'],
  ])('rejects %s', async (_label, fixture) => {
    await expect(syncFixture(fixture)).rejects.toThrow()
  })

  it('reads the real data layout while ignoring unrelated site, docs, and image content', async () => {
    const first = await syncFixture('valid')
    expect(first).toEqual(await syncFixture('valid'))
    expect(JSON.stringify(first)).not.toContain('Ignored fixture site')
    expect(JSON.stringify(first)).not.toContain('Ignored documentation')
    expect(JSON.stringify(first)).not.toContain('ignored binary-like asset placeholder')
  })

  it.each(['dirty-checkout', 'wrong-commit', 'wrong-origin'])('rejects invalid Git source state: %s', async (fixture) => {
    await expect(syncFixture(fixture)).rejects.toThrow()
  })

  it('requires the supplied commit to be reachable from origin remote-tracking history', async () => {
    await expect(syncFixture('unreachable-remote')).rejects.toThrow('remote-tracking history')
  })

  it('requires every emitted upstream path to exist at the pinned commit', async () => {
    await expect(syncFixture('missing-upstream-path')).rejects.toThrow('pinned commit')
  })

  it('requires absolute non-overlapping source and output paths', async () => {
    const commit = '0'.repeat(40)
    await expect(syncUpstream({ sourceRoot: 'relative', outputRoot: resolve('output'), upstreamCommit: commit }))
      .rejects.toThrow('--source must be an absolute directory')
    await expect(syncUpstream({ sourceRoot: resolve('source'), outputRoot: 'relative', upstreamCommit: commit }))
      .rejects.toThrow('--output must be an absolute directory')
    await expect(syncUpstream({ sourceRoot: resolve('same'), outputRoot: resolve('same'), upstreamCommit: commit }))
      .rejects.toThrow('must not overlap')
  })

  it('normalizes safe metadata without redistributing unlicensed prompts', async () => {
    const output = await syncFixture('valid')
    expect(Object.keys(output)).toEqual([
      'LICENSE.upstream',
      'cases.json',
      'manifest.json',
      'sources.json',
      'tags.json',
      'templates.json',
    ])
    const cases = JSON.parse(output['cases.json']!) as Array<Record<string, unknown>>
    expect(cases.find(item => item.id === 'case-4')).not.toHaveProperty('prompt')
    expect(output['cases.json']).not.toContain('特斯拉车主：求上链接')
    const sources = JSON.parse(output['sources.json']!) as Array<{ id: string; upstreamPath?: string }>
    expect(sources.filter(source => source.upstreamPath !== undefined)).toEqual([
      expect.objectContaining({ id: 'upstream-case-10', upstreamPath: 'data/cases.json' }),
      expect.objectContaining({ id: 'upstream-case-4', upstreamPath: 'data/cases.json' }),
      expect.objectContaining({ id: 'upstream-style-library', upstreamPath: 'data/style-library.json' }),
    ])
    const manifest = JSON.parse(output['manifest.json']!) as unknown as {
      counts: { cases: number; sources: number; tags: number; templates: number }
      resources: Record<string, { bytes: number; sha256: string }>
      snapshot: { importedUpstreamCases: number; importedUpstreamTemplates: number }
    }
    expect(manifest.counts).toEqual({ cases: 2, sources: 4, tags: 9, templates: 3 })
    expect(manifest.snapshot).toMatchObject({ importedUpstreamCases: 2, importedUpstreamTemplates: 2 })
    expect(Object.values(manifest.resources)).toHaveLength(5)
    expect(Object.values(manifest.resources).every(resource => resource.bytes > 0
      && /^[0-9a-f]{64}$/u.test(resource.sha256))).toBe(true)
  })

  it('does not publish a destination when staged snapshot validation fails', async () => {
    const checkout = await prepareCheckout('unknown-field')
    const parent = await mkdtemp(join(tmpdir(), 'dsh-image-library-atomic-'))
    const outputRoot = join(parent, 'assets')
    try {
      await expect(syncUpstream({
        sourceRoot: checkout.root,
        outputRoot,
        upstreamCommit: checkout.commit,
      })).rejects.toThrow()
      await expect(stat(outputRoot)).rejects.toMatchObject({ code: 'ENOENT' })
      expect(await readdir(parent)).toEqual([])
    } finally {
      await checkout.cleanup()
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('cleans the retained backup after an installed replacement is interrupted', async () => {
    const checkout = await prepareCheckout('valid')
    const parent = await mkdtemp(join(tmpdir(), 'dsh-image-library-recovery-'))
    const outputRoot = join(parent, 'assets')
    const backupRoot = join(parent, '.assets.backup')
    try {
      await syncUpstream({
        sourceRoot: checkout.root,
        outputRoot,
        upstreamCommit: checkout.commit,
      })
      await cp(outputRoot, backupRoot, { recursive: true })

      await syncUpstream({
        sourceRoot: checkout.root,
        outputRoot,
        upstreamCommit: checkout.commit,
      })

      await expect(stat(backupRoot)).rejects.toMatchObject({ code: 'ENOENT' })
      expect((await stat(outputRoot)).isDirectory()).toBe(true)
    } finally {
      await checkout.cleanup()
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('restores the retained backup before validating the next source checkout', async () => {
    const checkout = await prepareCheckout('valid')
    const parent = await mkdtemp(join(tmpdir(), 'dsh-image-library-recovery-'))
    const outputRoot = join(parent, 'assets')
    const backupRoot = join(parent, '.assets.backup')
    try {
      await syncUpstream({
        sourceRoot: checkout.root,
        outputRoot,
        upstreamCommit: checkout.commit,
      })
      const expectedManifest = await readFile(join(outputRoot, 'manifest.json'), 'utf8')
      await rename(outputRoot, backupRoot)
      await writeFile(join(checkout.root, 'untracked.txt'), 'dirty\n')

      await expect(syncUpstream({
        sourceRoot: checkout.root,
        outputRoot,
        upstreamCommit: checkout.commit,
      })).rejects.toThrow('source checkout must be clean')

      expect(await readFile(join(outputRoot, 'manifest.json'), 'utf8')).toBe(expectedManifest)
      await expect(stat(backupRoot)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await checkout.cleanup()
      await rm(parent, { recursive: true, force: true })
    }
  })
})
