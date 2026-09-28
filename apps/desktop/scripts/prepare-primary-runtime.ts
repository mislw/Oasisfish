/** Prepare pinned, relocatable script interpreters without installing into the build host. */

import { execFileSync } from 'node:child_process'
import { deepStrictEqual } from 'node:assert'
import { createHash } from 'node:crypto'
import { createReadStream, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { chmod, copyFile, cp, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import extractZip from 'extract-zip'
import { x as extractTar } from 'tar'
import { workspaceDependencyPaths, type PrimaryRuntimeManifest } from '../../desktop-host/src/primary-runtime.ts'
import { resolveDesktopBuildTarget, resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { inspectRegularTree } from './regular-tree.mjs'
import { verifyStagedRetrievalResources } from './staged-inventory.mjs'
import { scrubWindowsSigningEnvironment } from './windows-sign.mjs'
import lock from './primary-runtime-lock.json' with { type: 'json' }

const APP_ROOT = resolve(import.meta.dirname, '..')
const MODEL_RESOURCE_FILES = [
  'LICENSE',
  'config.json',
  'onnx/model_quantized.onnx',
  'special_tokens_map.json',
  'tokenizer_config.json',
  'tokenizer.json',
  'vocab.txt',
] as const
const APPROVED_MODEL_MANIFEST = Object.freeze({
  schemaVersion: 1,
  modelId: 'Xenova/bge-small-zh-v1.5',
  upstreamModelId: 'BAAI/bge-small-zh-v1.5',
  revision: '75c43b069aac4d136ba6bc1122f995fedcfd2781',
  dimensions: 512,
  license: 'MIT',
  transformersJsVersion: '4.2.0',
  files: Object.freeze([
    Object.freeze({ path: 'LICENSE', sha256: '8e318bf1245d801ffe93917d1674a039ae947b206bdba0b73b271190c5ef1f58' }),
    Object.freeze({ path: 'config.json', sha256: 'd4193ead3a810fd694fa8a31d7fc72fbaebc0668b603e398734bf2f6538ff42f' }),
    Object.freeze({ path: 'onnx/model_quantized.onnx', sha256: '15b717c382bcb518ba457b93ea6850ede7f4f1cd8937454aa06972366cd19bcc' }),
    Object.freeze({ path: 'special_tokens_map.json', sha256: 'b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3' }),
    Object.freeze({ path: 'tokenizer_config.json', sha256: 'e6f3b96db926a37d4039995fbf5ad17de158dfb8f6343d607e4dbaad18d75f5a' }),
    Object.freeze({ path: 'tokenizer.json', sha256: '48cea5d44424912a6fd1ea647bf4fe50b55ab8b1e5879c3275f80e339e8fae26' }),
    Object.freeze({ path: 'vocab.txt', sha256: '45bbac6b341c319adc98a532532882e91a9cefc0329aa57bac9ae761c27b291c' }),
  ]),
})

/** Approved immutable embedding model metadata carried by Desktop resources. */
export type ModelResourceManifest = typeof APPROVED_MODEL_MANIFEST

async function regularModelFile(root: string, relativePath: string): Promise<string> {
  let current = root
  const rootMetadata = await lstat(current)
  if (rootMetadata.isSymbolicLink()) throw new Error(`local embedding model contains a filesystem link: ${current}`)
  if (!rootMetadata.isDirectory()) throw new Error(`local embedding model root is not a directory: ${current}`)
  const segments = relativePath.split('/')
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment)
    const metadata = await lstat(current)
    if (metadata.isSymbolicLink()) throw new Error(`local embedding model contains a filesystem link: ${current}`)
    if (index === segments.length - 1 ? !metadata.isFile() : !metadata.isDirectory()) {
      throw new Error(`local embedding model resource has the wrong file type: ${current}`)
    }
  }
  return current
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

/** Verify the pinned manifest, license, file types, and SHA-256 digests without network access. */
export async function verifyModelResources(root: string): Promise<ModelResourceManifest> {
  const manifestPath = await regularModelFile(root, 'model-manifest.json')
  const parsed: unknown = JSON.parse(await readFile(manifestPath, 'utf8'))
  try { deepStrictEqual(parsed, APPROVED_MODEL_MANIFEST) } catch (error) {
    throw new Error('local embedding model manifest does not match the approved snapshot', { cause: error })
  }
  const manifest = parsed as ModelResourceManifest
  const hashes = new Map(manifest.files.map(file => [file.path, file.sha256]))
  for (const relativePath of MODEL_RESOURCE_FILES) {
    const path = await regularModelFile(root, relativePath)
    const actual = await sha256(path)
    const expected = hashes.get(relativePath)
    if (actual !== expected) throw new Error(`SHA-256 mismatch for ${relativePath}: expected ${String(expected)}, received ${actual}`)
  }
  return manifest
}

/** Replace one staged model directory with only the approved verified resource files. */
export async function prepareModelAssets(source: string, destination: string): Promise<void> {
  await verifyModelResources(source)
  rmSync(destination, { recursive: true, force: true })
  for (const relativePath of ['model-manifest.json', ...MODEL_RESOURCE_FILES]) {
    const output = join(destination, relativePath)
    await mkdir(dirname(output), { recursive: true })
    await copyFile(join(source, relativePath), output)
  }
  await verifyModelResources(destination)
}

/**
 * Download or reuse an archive only when its bytes match the release lock.
 * @param url - Locked archive URL.
 * @param sha256 - Expected SHA-256 digest.
 * @param cache - Download cache directory.
 * @returns Verified local archive path.
 */
export async function downloadPrimaryRuntimeAsset(url: string, sha256: string, cache: string): Promise<string> {
  const destination = join(cache, sha256)
  let bytes: Buffer
  try { bytes = readFileSync(destination) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const response = await fetch(url)
    if (!response.ok) throw new Error(`primary runtime download: ${String(response.status)} ${url}`)
    bytes = Buffer.from(await response.arrayBuffer())
  }
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error(`primary runtime download: checksum mismatch for ${url}`)
  writeFileSync(destination, bytes)
  return destination
}

async function pythonArchive(target: keyof typeof lock.targets, cache: string): Promise<string> {
  const artifact = lock.targets[target]
  const filename = `cpython-${lock.pythonVersion}+${lock.pythonRelease}-${artifact.pythonTarget}-install_only_stripped.tar.gz`
  return downloadPrimaryRuntimeAsset(`https://github.com/astral-sh/python-build-standalone/releases/download/${lock.pythonRelease}/${encodeURIComponent(filename)}`, artifact.pythonSha256, cache)
}

/**
 * Identify the inputs that assemble one target's payload, excluding unrelated target locks.
 * @param target - Desktop target whose archives are installed.
 * @param runtimeLock - Locked interpreter and wheel inputs.
 * @param pnpmVersion - Package-manager version copied into the payload.
 * @returns SHA-256 payload identity for installation reuse.
 */
export function primaryRuntimePayloadDigest(target: keyof typeof lock.targets, runtimeLock: typeof lock, pnpmVersion: string): string {
  const { pythonVersion, pythonRelease, nodeVersion, wheels, pythonPackages } = runtimeLock
  // Identity preserves key order within the selected target, wheel records and distribution map, plus wheel-entry order.
  // Bump format when extraction or assembly changes payload bytes without changing locked inputs.
  return createHash('sha256').update(JSON.stringify({
    format: 3, target, pythonVersion, pythonRelease, nodeVersion,
    artifact: runtimeLock.targets[target], wheels, pythonPackages, pnpm: pnpmVersion,
  })).digest('hex')
}

/**
 * Unpack a locked library wheel, retaining auxiliary scripts in its distribution data directory.
 * @param archive - Hash-verified wheel archive.
 * @param destination - Absolute site-packages directory.
 * @returns Resolves after extraction without command wrappers; rejects other wheel installation schemes.
 */
export async function unpackPrimaryRuntimeWheel(archive: string, destination: string): Promise<void> {
  await extractZip(archive, {
    dir: destination,
    onEntry: (entry) => {
      const [directory, scheme] = entry.fileName.split('/')
      if (directory?.endsWith('.data') && scheme !== '' && scheme !== 'scripts') {
        throw new Error(`primary runtime: wheel requires unsupported installation paths: ${entry.fileName}`)
      }
    },
  })
}

/**
 * Copy a complete skill asset tree to ordinary filesystem resources.
 * @param source - Directory containing one or more skill bundles.
 * @param destination - Desktop runtime resource directory outside ASAR.
 * @returns Resolves after replacing the external assets with the complete package tree.
 */
export async function prepareSkillAssets(source: string, destination: string): Promise<void> {
  await inspectRegularTree(source)
  rmSync(destination, { recursive: true, force: true })
  try {
    await cp(source, destination, { recursive: true, dereference: false, verbatimSymlinks: true })
    await inspectRegularTree(destination)
  } catch (error) {
    rmSync(destination, { recursive: true, force: true })
    throw error
  }
}

function nodeCommand(cli: 'npm' | 'npx', windows: boolean): string {
  const script = `../node_modules/npm/bin/${cli}-cli.js`
  return windows
    ? `@echo off\r\n"%~dp0node.exe" "%~dp0${script}" %*\r\n`
    : `#!/bin/sh\nexec "$(dirname "$0")/node" "$(dirname "$0")/${script}" "$@"\n`
}

/**
 * Copy Node and its bundled npm distribution into the relocatable runtime layout.
 * @param source - Extracted root of one locked Node distribution.
 * @param destination - Runtime-owned Node directory containing `bin` and `node_modules`.
 * @param target - Desktop target selecting the native Node executable and command wrappers.
 * @returns npm version carried by the locked Node distribution.
 */
export async function prepareNodeRuntime(
  source: string, destination: string, target: 'win-x64' | 'mac-arm64' | 'mac-x64',
): Promise<string> {
  const windows = target === 'win-x64'
  const bin = join(destination, 'bin')
  const npmSource = join(source, ...(windows ? ['node_modules', 'npm'] : ['lib', 'node_modules', 'npm']))
  const npmManifest = JSON.parse(await readFile(join(npmSource, 'package.json'), 'utf8')) as { version?: unknown }
  if (typeof npmManifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/u.test(npmManifest.version)) {
    throw new Error('primary runtime: Node distribution contains invalid npm metadata')
  }
  await rm(destination, { recursive: true, force: true })
  await mkdir(bin, { recursive: true })
  await mkdir(join(destination, 'node_modules'), { recursive: true })
  await cp(join(source, ...(windows ? ['node.exe'] : ['bin', 'node'])), join(bin, windows ? 'node.exe' : 'node'))
  await cp(join(source, 'LICENSE'), join(destination, 'LICENSE'))
  await cp(npmSource, join(destination, 'node_modules', 'npm'), { recursive: true, dereference: true })
  await writeFile(join(destination, 'node_modules', 'README.txt'), 'Bundled npm ships with Node; pnpm retains its own runtime directory.\n')
  for (const cli of ['npm', 'npx'] as const) {
    const path = join(bin, windows ? `${cli}.cmd` : cli)
    await writeFile(path, nodeCommand(cli, windows))
    if (!windows) await chmod(path, 0o755)
  }
  if (!windows) await chmod(join(bin, 'node'), 0o755)
  return npmManifest.version
}

/**
 * Materialize the selected Desktop target's primary runtime in its build resources.
 * @param options - Signed Windows packaging defers execution until its supervised signing stage.
 * @returns Resolves after materialization and, unless deferred, native-target execution checks.
 */
export async function preparePrimaryRuntime(options: { deferSmoke?: boolean } = {}): Promise<void> {
  const target = resolveDesktopBuildTarget()
  const paths = resolveDesktopTargetBuildPaths()
  const artifact = lock.targets[target]
  mkdirSync(paths.runtime, { recursive: true })
  mkdirSync(paths.downloads, { recursive: true })
  const staging = mkdtempSync(join(tmpdir(), 'dsh-primary-'))
  try {
    const output = join(staging, 'payload')
    const dependencies = join(output, 'dependencies')
    mkdirSync(dependencies, { recursive: true })
    const nodeFilename = `node-v${lock.nodeVersion}-${artifact.nodeArchive}`
    const nodeArchive = await downloadPrimaryRuntimeAsset(`https://nodejs.org/dist/v${lock.nodeVersion}/${nodeFilename}`, artifact.nodeSha256, paths.downloads)
    const unpackedNode = join(staging, 'node')
    mkdirSync(unpackedNode)
    if (target === 'win-x64') await extractZip(nodeArchive, { dir: unpackedNode })
    else await extractTar({ file: nodeArchive, cwd: unpackedNode })
    const nodeSource = join(unpackedNode, nodeFilename.replace(/\.(?:zip|tar\.gz)$/u, ''))
    const npmVersion = await prepareNodeRuntime(nodeSource, join(dependencies, 'node'), target)
    await extractTar({ file: await pythonArchive(target, paths.downloads), cwd: dependencies })
    const require = createRequire(import.meta.url)
    const pnpmManifest = require.resolve('pnpm')
    const pnpm = JSON.parse(readFileSync(pnpmManifest, 'utf8')) as { version: string }
    await cp(dirname(pnpmManifest), join(dependencies, 'pnpm'), { recursive: true, dereference: true })
    const desktop = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')) as { version: string }
    const manifest: PrimaryRuntimeManifest = {
      desktopVersion: desktop.version,
      platform: target === 'win-x64' ? 'win32' : 'darwin',
      arch: target === 'mac-arm64' ? 'arm64' : 'x64',
      payloadDigest: primaryRuntimePayloadDigest(target, lock, pnpm.version),
      pythonPackages: lock.pythonPackages,
      components: {
        python: lock.pythonVersion, node: lock.nodeVersion, npm: npmVersion, pnpm: pnpm.version,
        numpy: lock.pythonPackages.numpy, pandas: lock.pythonPackages.pandas,
      },
    }
    const entries = workspaceDependencyPaths(output, manifest)
    for (const wheel of [...artifact.wheels, ...lock.wheels]) {
      await unpackPrimaryRuntimeWheel(await downloadPrimaryRuntimeAsset(wheel.url, wheel.sha256, paths.downloads), entries.pythonPackages)
    }
    writeFileSync(join(output, 'runtime.json'), `${JSON.stringify(manifest, undefined, 2)}\n`)
    const destination = join(paths.runtime, 'primary-runtime')
    rmSync(destination, { recursive: true, force: true })
    await cp(output, destination, { recursive: true, dereference: true })
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
  const hostRequire = createRequire(resolve(import.meta.dirname, '..', '..', 'desktop-host', 'package.json'))
  await prepareSkillAssets(join(dirname(hostRequire.resolve('@deepseek-ai/dsh-skill-office/package.json')), 'assets'),
    join(paths.runtime, 'office-skills'))
  await prepareSkillAssets(join(APP_ROOT, 'resources', 'bundled-skills'), join(paths.runtime, 'bundled-skills'))
  await prepareModelAssets(join(APP_ROOT, 'resources', 'bundled-models', 'bge-small-zh-v1.5'),
    join(paths.runtime, 'models', 'bge-small-zh-v1.5'))
  await mkdir(join(paths.runtime, 'desktop'), { recursive: true })
  await copyFile(
    join(APP_ROOT, '..', 'desktop-host', 'oasisfish.cordis.patch.yml'),
    join(paths.runtime, 'desktop', 'oasisfish.cordis.patch.yml'),
  )
  await verifyStagedRetrievalResources(paths.runtime)
  if (!options.deferSmoke) smokePrimaryRuntime(join(paths.runtime, 'primary-runtime'))
}

/**
 * Execute the native payload's interpreters, package manager and Python libraries.
 * @param root - Final payload directory, including any platform signatures.
 */
export function smokePrimaryRuntime(root: string): void {
  const manifest = JSON.parse(readFileSync(join(root, 'runtime.json'), 'utf8')) as PrimaryRuntimeManifest
  if (manifest.platform !== process.platform || manifest.arch !== process.arch) return
  if (manifest.pythonPackages === undefined) throw new Error('primary runtime: missing Python distribution versions; prepare the payload before running its smoke checks.')
  const entries = workspaceDependencyPaths(root, manifest)
  const options = { stdio: 'inherit', timeout: 120_000, env: scrubWindowsSigningEnvironment(process.env) } as const
  execFileSync(entries.python, ['-I', '-c', 'import decimal, xml.parsers.expat, lzma, uuid, numpy, pandas; assert numpy.arange(4).sum() == 6; assert pandas.DataFrame({"n": [1, 2]}).n.sum() == 3'], options)
  execFileSync(entries.python, ['-I', '-B', join(import.meta.dirname, 'smoke-primary-runtime.py'), JSON.stringify(manifest.pythonPackages),
    manifest.components.python, join(dirname(root), 'office-skills', 'scripts', 'check_office.py')], options)
  execFileSync(entries.python, ['-I', '-B', '-m', 'pip', 'check'], options)
  execFileSync(entries.node, ['-e', `if (process.versions.node !== ${JSON.stringify(manifest.components.node)}) process.exit(1)`], options)
  const npmBin = join(root, 'dependencies', 'node', 'node_modules', 'npm', 'bin')
  execFileSync(entries.node, [join(npmBin, 'npm-cli.js'), '--version'], options)
  execFileSync(entries.node, [join(npmBin, 'npx-cli.js'), '--version'], options)
  execFileSync(entries.node, [entries.pnpm, '--version'], options)
}

if (import.meta.main) await preparePrimaryRuntime()
