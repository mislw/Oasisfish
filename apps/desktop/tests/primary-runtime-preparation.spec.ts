import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { zipSync } from 'fflate'
import { expect, it } from 'vitest'
import {
  downloadPrimaryRuntimeAsset,
  prepareModelAssets,
  prepareSkillAssets,
  primaryRuntimePayloadDigest,
  smokePrimaryRuntime,
  unpackPrimaryRuntimeWheel,
  verifyModelResources,
} from '../scripts/prepare-primary-runtime.ts'
import lock from '../scripts/primary-runtime-lock.json' with { type: 'json' }

const libraryWheel = Buffer.from('UEsDBAoAAAAAAASeLl0sYMPjDAAAAAwAAAAJAAAAc2FtcGxlLnB5c2FtcGxlID0gNDIKUEsBAh4DCgAAAAAABJ4uXSxgw+MMAAAADAAAAAkAAAAAAAAAAQAAAKSBAAAAAHNhbXBsZS5weVBLBQYAAAAAAQABADcAAAAzAAAAAAA=', 'base64')
const relocatedWheel = Buffer.from('UEsDBAoAAAAAAASeLl3x0Nj9FAAAABQAAAAeAAAAc2FtcGxlLTEuMC5kYXRhL3NjcmlwdHMvc2FtcGxlcmVxdWlyZXMgcmVsb2NhdGlvbgpQSwECHgMKAAAAAAAEni5d8dDY/RQAAAAUAAAAHgAAAAAAAAABAAAApIEAAAAAc2FtcGxlLTEuMC5kYXRhL3NjcmlwdHMvc2FtcGxlUEsFBgAAAAABAAEATAAAAFAAAAAAAA==', 'base64')
const externalLibraryWheel = Buffer.from('UEsDBBQAAAAAAAAAIVyBOE8OHAAAABwAAAAhAAAAc2FtcGxlLTEuMC5kYXRhL3B1cmVsaWIvc2FtcGxlLnB5cmVxdWlyZXMgbGlicmFyeSByZWxvY2F0aW9uClBLAQIUAxQAAAAAAAAAIVyBOE8OHAAAABwAAAAhAAAAAAAAAAAAAACAAQAAAABzYW1wbGUtMS4wLmRhdGEvcHVyZWxpYi9zYW1wbGUucHlQSwUGAAAAAAEAAQBPAAAAWwAAAAAA', 'base64')

it.each(Object.entries(lock.targets))('records every locked wheel distribution and version for %s', (_target, artifact) => {
  const normalize = (name: string): string => name.toLowerCase().replace(/[-_.]+/gu, '-')
  const distributions = [...artifact.wheels, ...lock.wheels].map(({ url }) => {
    const [name, version] = basename(new URL(url).pathname).split('-')
    return [normalize(name!), version] as const
  })
  const declared = Object.entries(lock.pythonPackages).map(([name, version]) => [normalize(name), version] as const)
  expect(new Set(distributions.map(([name]) => name)).size).toBe(distributions.length)
  expect(new Set(declared.map(([name]) => name)).size).toBe(declared.length)
  expect(Object.fromEntries(distributions)).toEqual(Object.fromEntries(declared))
})

it('keeps a target payload identity independent of other target archives', () => {
  const changed = structuredClone(lock)
  changed.targets['win-x64'].wheels[0]!.sha256 = 'a'.repeat(64)
  expect(primaryRuntimePayloadDigest('mac-arm64', changed, '11.7.0')).toBe(primaryRuntimePayloadDigest('mac-arm64', lock, '11.7.0'))
  expect(primaryRuntimePayloadDigest('win-x64', changed, '11.7.0')).not.toBe(primaryRuntimePayloadDigest('win-x64', lock, '11.7.0'))
})

it('invalidates payload identity for shared wheels, package versions and package-manager changes', () => {
  const wheel = structuredClone(lock), distribution = structuredClone(lock)
  wheel.wheels[0]!.sha256 = 'a'.repeat(64)
  distribution.pythonPackages['python-docx'] = '1.2.1'
  const original = primaryRuntimePayloadDigest('mac-arm64', lock, '11.7.0')
  expect(primaryRuntimePayloadDigest('mac-arm64', wheel, '11.7.0')).not.toBe(original)
  expect(primaryRuntimePayloadDigest('mac-arm64', distribution, '11.7.0')).not.toBe(original)
  expect(primaryRuntimePayloadDigest('mac-arm64', lock, '11.7.1')).not.toBe(original)
})

it('reports missing distribution metadata before trying to execute a stale native payload', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-stale-runtime-'))
  try {
    await writeFile(join(root, 'runtime.json'), JSON.stringify({ platform: process.platform, arch: process.arch }))
    expect(() => { smokePrimaryRuntime(root) }).toThrow('missing Python distribution versions; prepare the payload')
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('extracts a hash-verified cached library without a Python installer or network request', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-wheel-'))
  try {
    const hash = createHash('sha256').update(libraryWheel).digest('hex')
    const archive = join(root, hash)
    await writeFile(archive, libraryWheel)
    expect(await downloadPrimaryRuntimeAsset('https://unused.invalid/library.whl', hash, root)).toBe(archive)
    await unpackPrimaryRuntimeWheel(archive, join(root, 'site-packages'))
    expect(await readFile(join(root, 'site-packages/sample.py'), 'utf8')).toBe('sample = 42\n')
    await writeFile(archive, 'corrupt archive')
    await expect(downloadPrimaryRuntimeAsset('https://unused.invalid/library.whl', hash, root)).rejects.toThrow('checksum mismatch')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('fully extracts a large deflate-compressed wheel entry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-large-wheel-'))
  try {
    const expected = Buffer.alloc(1024 * 1024)
    // Seeded xorshift bytes keep the compressed entry larger than the stream buffers.
    let state = 26
    for (let index = 0; index < expected.length; index++) {
      state ^= state << 13
      state ^= state >>> 17
      state ^= state << 5
      expected[index] = state & 255
    }
    const archive = join(root, 'large.whl')
    await writeFile(archive, zipSync({ 'large.bin': expected }, { level: 6 }))
    await unpackPrimaryRuntimeWheel(archive, root)
    expect(await readFile(join(root, 'large.bin'))).toEqual(expected)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('retains auxiliary wheel scripts without generating command wrappers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-wheel-'))
  try {
    const archive = join(root, 'relocated.whl')
    await writeFile(archive, relocatedWheel)
    await unpackPrimaryRuntimeWheel(archive, join(root, 'site-packages'))
    expect(await readFile(join(root, 'site-packages/sample-1.0.data/scripts/sample'), 'utf8')).toBe('requires relocation\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('rejects library files requiring an unsupported installation scheme', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-wheel-'))
  try {
    const archive = join(root, 'relocated.whl')
    await writeFile(archive, externalLibraryWheel)
    await expect(unpackPrimaryRuntimeWheel(archive, join(root, 'site-packages'))).rejects.toThrow('unsupported installation paths')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('copies complete Office resources outside the application archive and removes obsolete assets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-office-assets-'))
  try {
    const source = join(root, 'package', 'assets')
    const destination = join(root, 'Contents', 'Resources', 'runtime', 'office-skills')
    await mkdir(join(source, 'scripts'), { recursive: true })
    await writeFile(join(source, 'scripts', 'check_office.py'), 'print("checker")\n')
    for (const name of ['office-docx', 'office-pptx', 'office-xlsx']) {
      await mkdir(join(source, name))
      await writeFile(join(source, name, 'SKILL.md'), `# ${name}\n`)
    }
    await prepareSkillAssets(source, destination)
    await writeFile(join(destination, 'obsolete.py'), 'old helper')
    await prepareSkillAssets(source, destination)
    for (const name of ['office-docx', 'office-pptx', 'office-xlsx']) {
      expect(await readFile(join(destination, name, 'SKILL.md'), 'utf8')).toBe(`# ${name}\n`)
    }
    expect(await readFile(join(destination, 'scripts', 'check_office.py'), 'utf8')).toBe('print("checker")\n')
    await expect(readFile(join(destination, 'obsolete.py'))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('rejects linked files before copying Skill assets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-linked-skill-file-'))
  try {
    const source = join(root, 'source')
    const destination = join(root, 'destination')
    const outside = join(root, 'outside.md')
    await mkdir(join(source, 'fixture-skill', 'references'), { recursive: true })
    await writeFile(join(source, 'fixture-skill', 'SKILL.md'), '# Fixture\n')
    await writeFile(outside, 'external file contents\n')
    await symlink(outside, join(source, 'fixture-skill', 'references', 'linked.md'), 'file')

    await expect(prepareSkillAssets(source, destination)).rejects.toThrow('filesystem link')
    await expect(readFile(join(destination, 'fixture-skill', 'references', 'linked.md')))
      .rejects.toMatchObject({ code: 'ENOENT' })
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('rejects linked directories before copying Skill assets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-linked-skill-directory-'))
  try {
    const source = join(root, 'source')
    const destination = join(root, 'destination')
    const outside = join(root, 'outside')
    await mkdir(join(source, 'fixture-skill', 'references'), { recursive: true })
    await mkdir(outside)
    await writeFile(join(source, 'fixture-skill', 'SKILL.md'), '# Fixture\n')
    await writeFile(join(outside, 'secret.md'), 'external directory contents\n')
    await symlink(
      outside,
      join(source, 'fixture-skill', 'references', 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )

    await expect(prepareSkillAssets(source, destination)).rejects.toThrow('filesystem link')
    await expect(readFile(join(destination, 'fixture-skill', 'references', 'linked', 'secret.md')))
      .rejects.toMatchObject({ code: 'ENOENT' })
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('carries the current Oasis Wiki skill as a clean bundled Desktop resource', async () => {
  const root = join(import.meta.dirname, '..', 'resources', 'bundled-skills', 'oasis-wiki')
  expect((await readFile(join(root, 'VERSION'), 'utf8')).trim()).toBe('1.260909.2')
  expect(await readFile(join(root, 'SKILL.md'), 'utf8')).toContain('name: oasis-wiki')
  const entries = await readdir(root, { recursive: true })
  expect(entries.filter(entry => entry.includes('__pycache__') || entry.endsWith('.pyc'))).toEqual([])
})

it('carries the released image guidance as a licensed bundled Desktop Skill', async () => {
  const root = join(import.meta.dirname, '..', 'resources', 'bundled-skills', 'ai-image-prompts')
  expect(await readFile(join(root, 'SKILL.md'), 'utf8')).toContain('name: ai-image-prompts')
  expect(await readFile(join(root, 'LICENSE'), 'utf8')).toContain('MIT License')
  expect(await readFile(join(root, 'references', 'visual-recipes.md'), 'utf8')).toContain('## Game Item Icon')
})

it('declares Skill retrieval plugins in every Loader resolver manifest', async () => {
  const manifest = async (...segments: string[]): Promise<Record<string, string>> => {
    const parsed = JSON.parse(await readFile(join(import.meta.dirname, ...segments), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    return parsed.dependencies ?? {}
  }
  const base = await manifest('..', '..', '..', 'packages', 'bundle', 'base', 'package.json')
  const cli = await manifest('..', '..', 'cli', 'package.json')
  const host = await manifest('..', '..', 'desktop-host', 'package.json')
  const runtime = await manifest('..', '..', 'desktop-runtime', 'package.json')
  const desktop = await manifest('..', 'package.json')

  expect(base).toMatchObject({
    '@deepseek-ai/dsh-skill-search': 'workspace:^',
    '@deepseek-ai/dsh-tool-skill-search': 'workspace:^',
  })
  expect(cli).toMatchObject({
    '@deepseek-ai/dsh-skill-search': 'workspace:^',
    '@deepseek-ai/dsh-skill-search-local': 'workspace:^',
    '@deepseek-ai/dsh-tool-skill-search': 'workspace:^',
  })
  expect(host).toMatchObject({ '@deepseek-ai/dsh-skill-search-local': 'workspace:^' })
  expect(runtime).toMatchObject({
    '@deepseek-ai/dsh-skill-search': 'workspace:^',
    '@deepseek-ai/dsh-skill-search-local': 'workspace:^',
    '@deepseek-ai/dsh-tool-skill-search': 'workspace:^',
  })
  expect(desktop).toMatchObject({ '@deepseek-ai/dsh-home-paths': 'workspace:^' })
})

it('pins and verifies the released local embedding model without a download path', async () => {
  const root = join(import.meta.dirname, '..', 'resources', 'bundled-models', 'bge-small-zh-v1.5')
  const verified = await verifyModelResources(root)
  expect(verified).toMatchObject({
    schemaVersion: 1,
    modelId: 'Xenova/bge-small-zh-v1.5',
    upstreamModelId: 'BAAI/bge-small-zh-v1.5',
    revision: '75c43b069aac4d136ba6bc1122f995fedcfd2781',
    dimensions: 512,
    license: 'MIT',
    transformersJsVersion: '4.2.0',
  })
  expect(verified.files).toContainEqual({
    path: 'LICENSE',
    sha256: '8e318bf1245d801ffe93917d1674a039ae947b206bdba0b73b271190c5ef1f58',
  })
})

it('rejects missing and modified local embedding model files before staging', async () => {
  const source = join(import.meta.dirname, '..', 'resources', 'bundled-models', 'bge-small-zh-v1.5')
  const root = await mkdtemp(join(tmpdir(), 'desktop-model-assets-'))
  try {
    const missing = join(root, 'missing')
    await mkdir(missing)
    await writeFile(join(missing, 'model-manifest.json'), await readFile(join(source, 'model-manifest.json')))
    await writeFile(join(missing, 'LICENSE'), await readFile(join(source, 'LICENSE')))
    await expect(verifyModelResources(missing)).rejects.toThrow('config.json')

    const unapproved = join(root, 'unapproved')
    await prepareModelAssets(source, unapproved)
    const manifest = JSON.parse(await readFile(join(unapproved, 'model-manifest.json'), 'utf8')) as Record<string, unknown>
    manifest.revision = 'unapproved'
    await writeFile(join(unapproved, 'model-manifest.json'), `${JSON.stringify(manifest)}\n`)
    await expect(verifyModelResources(unapproved)).rejects.toThrow('approved snapshot')

    const modified = join(root, 'modified')
    await prepareModelAssets(source, modified)
    await writeFile(join(modified, 'config.json'), 'modified')
    await expect(verifyModelResources(modified)).rejects.toThrow('SHA-256 mismatch')

    const replacedLicense = join(root, 'replaced-license')
    await prepareModelAssets(source, replacedLicense)
    await writeFile(join(replacedLicense, 'LICENSE'), 'replacement license\n')
    await expect(verifyModelResources(replacedLicense)).rejects.toThrow('SHA-256 mismatch')
  } finally { await rm(root, { recursive: true, force: true }) }
})
