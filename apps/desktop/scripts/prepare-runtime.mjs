import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, copyFile, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { delimiter, dirname, join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import extract from 'extract-zip'
import { makeWindowsPythonLauncherPortable } from './portable-launcher.mjs'
import { readRuntimeManifest } from './runtime-manifest.mjs'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(desktopRoot, 'runtime-manifest.json')
const cacheRoot = join(desktopRoot, '.runtime-cache', 'downloads')
const buildResourcesRoot = join(desktopRoot, 'build-resources')
const runtimeRoot = join(buildResourcesRoot, 'runtime')

function assertManagedPath(path) {
  const normalized = resolve(path)
  const managedRoot = `${resolve(desktopRoot)}\\`
  if (!normalized.startsWith(managedRoot)) throw new Error(`Refusing to modify unmanaged path: ${path}`)
}

async function sha256(path) {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

async function download(artifact) {
  await mkdir(cacheRoot, { recursive: true })
  const fileName = decodeURIComponent(new URL(artifact.url).pathname.split('/').at(-1))
  const path = join(cacheRoot, fileName)
  try {
    if (await sha256(path) === artifact.sha256) return path
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const partial = `${path}.partial`
  await rm(partial, { force: true })
  const response = await fetch(artifact.url, { redirect: 'follow' })
  if (!response.ok || response.body === null) {
    throw new Error(`Failed to download ${artifact.name}: HTTP ${response.status}.`)
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial))
  const actual = await sha256(partial)
  if (actual !== artifact.sha256) {
    await rm(partial, { force: true })
    throw new Error(`SHA-256 mismatch for ${artifact.name}: expected ${artifact.sha256}, received ${actual}.`)
  }
  await rename(partial, path)
  return path
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${String(result.status)}):\n${result.stdout}\n${result.stderr}`)
  }
  return `${result.stdout}${result.stderr}`.trim()
}

async function installArtifact(artifact, archive, stagingRoot) {
  const destination = join(stagingRoot, artifact.destination)
  await mkdir(destination, { recursive: true })
  if (artifact.format === 'file') {
    if (artifact.fileName === undefined) throw new Error(`${artifact.name} requires fileName.`)
    await copyFile(archive, join(destination, artifact.fileName))
    return
  }
  if (artifact.format === 'self-extracting-7z') {
    run(archive, ['-y', `-o${destination}`])
    return
  }
  if (artifact.format === 'sevenzip') {
    const extractor = join(stagingRoot, 'build-tools', 'sevenzip', '7zr.exe')
    await access(extractor)
    run(extractor, ['x', archive, `-o${destination}`, '-y'])
    return
  }
  const extracted = join(stagingRoot, '.extract', artifact.name)
  await mkdir(extracted, { recursive: true })
  await extract(archive, { dir: extracted })
  let source = extracted
  if (artifact.stripComponents === 1) {
    const entries = await readdir(extracted, { withFileTypes: true })
    const directories = entries.filter(entry => entry.isDirectory())
    if (entries.length !== 1 || directories.length !== 1) {
      throw new Error(`${artifact.name} must contain exactly one root directory.`)
    }
    source = join(extracted, directories[0].name)
  }
  await cp(source, destination, { recursive: true, force: true })
}

async function enablePip(stagingRoot) {
  const pythonRoot = join(stagingRoot, 'python')
  const pthPath = join(pythonRoot, 'python314._pth')
  const current = await readFile(pthPath, 'utf8')
  const lines = current.split(/\r?\n/u).filter(Boolean)
  const enabled = lines.map(line => line === '#import site' ? 'import site' : line)
  if (!enabled.includes('Lib\\site-packages')) enabled.splice(enabled.length - 1, 0, 'Lib\\site-packages')
  await mkdir(join(pythonRoot, 'Lib', 'site-packages'), { recursive: true })
  await writeFile(pthPath, `${enabled.join('\r\n')}\r\n`)
  const getPip = join(stagingRoot, 'build-tools', 'python', 'get-pip.py')
  const wheels = join(stagingRoot, 'build-tools', 'python-wheels')
  run(join(pythonRoot, 'python.exe'), [
    getPip,
    '--no-index',
    '--find-links',
    wheels,
    '--no-warn-script-location',
  ], {
    env: {
      ...process.env,
      PYTHONHOME: pythonRoot,
      PYTHONUTF8: '1',
      PIP_NO_INDEX: '1',
    },
  })
  const scriptsRoot = join(pythonRoot, 'Scripts')
  const scripts = await readdir(scriptsRoot)
  for (const script of scripts.filter(name => /^pip.*\.exe$/iu.test(name))) {
    const path = join(scriptsRoot, script)
    await writeFile(path, makeWindowsPythonLauncherPortable(await readFile(path)))
  }
  const pipEnvironment = { ...process.env }
  delete pipEnvironment.Path
  pipEnvironment.PATH = [pythonRoot, process.env.PATH ?? process.env.Path].filter(Boolean).join(delimiter)
  run(join(scriptsRoot, 'pip.exe'), ['--version'], { env: pipEnvironment })
}

async function verifyRequiredFiles(manifest, stagingRoot) {
  for (const artifact of manifest.artifacts) {
    for (const requiredFile of artifact.requiredFiles) {
      const path = join(stagingRoot, artifact.destination, requiredFile)
      const details = await stat(path)
      if (!details.isFile()) throw new Error(`Required runtime file is not a file: ${path}`)
    }
  }
}

function verifyCommands(stagingRoot) {
  const commands = [
    ['node', join(stagingRoot, 'node', 'node.exe'), ['--version']],
    ['pnpm', join(stagingRoot, 'node-global', 'pnpm.exe'), ['--version']],
    ['python', join(stagingRoot, 'python', 'python.exe'), ['--version']],
    ['pip', join(stagingRoot, 'python', 'Scripts', 'pip.exe'), ['--version']],
    ['git', join(stagingRoot, 'git', 'cmd', 'git.exe'), ['--version']],
    ['bash', join(stagingRoot, 'git', 'bin', 'bash.exe'), ['--version']],
    ['pwsh', join(stagingRoot, 'powershell', 'pwsh.exe'), ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()']],
    ['rg', join(stagingRoot, 'tools', 'ripgrep', 'rg.exe'), ['--version']],
    ['fd', join(stagingRoot, 'tools', 'fd', 'fd.exe'), ['--version']],
    ['jq', join(stagingRoot, 'tools', 'jq', 'jq.exe'), ['--version']],
    ['curl', join(stagingRoot, 'git', 'mingw64', 'bin', 'curl.exe'), ['--version']],
    ['7za', join(stagingRoot, 'tools', 'sevenzip', 'x64', '7za.exe'), ['--help']],
    ['ssh', join(stagingRoot, 'git', 'usr', 'bin', 'ssh.exe'), ['-V']],
  ]
  for (const [name, command, args] of commands) {
    const output = run(command, args)
    process.stdout.write(`${name}: ${output.split(/\r?\n/u)[0]}\n`)
  }
}

async function main() {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error(`Runtime preparation supports Windows x64 only, received ${process.platform}-${process.arch}.`)
  }
  const manifest = await readRuntimeManifest(manifestPath)
  const stagingRoot = join(buildResourcesRoot, `.runtime-${process.pid}-${Date.now()}`)
  assertManagedPath(stagingRoot)
  assertManagedPath(runtimeRoot)
  await mkdir(stagingRoot, { recursive: true })
  try {
    for (const artifact of manifest.artifacts) {
      process.stdout.write(`prepare-runtime: ${artifact.name} ${artifact.version}\n`)
      await installArtifact(artifact, await download(artifact), stagingRoot)
    }
    await enablePip(stagingRoot)
    await verifyRequiredFiles(manifest, stagingRoot)
    verifyCommands(stagingRoot)
    await rm(join(stagingRoot, '.extract'), { recursive: true, force: true })
    await writeFile(join(stagingRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    await mkdir(buildResourcesRoot, { recursive: true })
    await rm(runtimeRoot, { recursive: true, force: true })
    await rename(stagingRoot, runtimeRoot)
    process.stdout.write(`prepare-runtime: ready at ${runtimeRoot}\n`)
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true })
    throw error
  }
}

await main()
