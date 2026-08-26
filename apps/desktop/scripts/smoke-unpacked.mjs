import { spawn, spawnSync } from 'node:child_process'
import { lstat, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PACKAGED_REQUIRED_FILES, verifyStagedProduct } from './staged-inventory.mjs'

const startupTimeoutMs = 60_000
const shutdownTimeoutMs = 15_000

const toolChecks = Object.freeze([
  { name: 'node', artifact: 'node', executable: ['node', 'node.exe'], args: ['--version'], pattern: /v([^\s]+)/ },
  { name: 'pnpm', artifact: 'pnpm', executable: ['node-global', 'pnpm.exe'], args: ['--version'], pattern: /([^\s]+)/ },
  { name: 'python', artifact: 'python', executable: ['python', 'python.exe'], args: ['--version'], pattern: /Python\s+([^\s]+)/ },
  { name: 'pip', artifact: 'pip-wheel', executable: ['python', 'Scripts', 'pip.exe'], args: ['--version'], pattern: /pip\s+([^\s]+)/ },
  { name: 'git', artifact: 'git', executable: ['git', 'cmd', 'git.exe'], args: ['--version'], pattern: /git version\s+([^\s]+)/ },
  { name: 'bash', executable: ['git', 'bin', 'bash.exe'], args: ['--version'], pattern: /version\s+([^()\s]+)/ },
  { name: 'powershell', artifact: 'powershell', executable: ['powershell', 'pwsh.exe'], args: ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], pattern: /([^\s]+)/ },
  { name: 'ssh', executable: ['git', 'usr', 'bin', 'ssh.exe'], args: ['-V'], pattern: /OpenSSH_([^,\s]+)/ },
  { name: 'ripgrep', artifact: 'ripgrep', executable: ['tools', 'ripgrep', 'rg.exe'], args: ['--version'], pattern: /ripgrep\s+([^\s]+)/ },
  { name: 'fd', artifact: 'fd', executable: ['tools', 'fd', 'fd.exe'], args: ['--version'], pattern: /fd\s+([^\s]+)/ },
  { name: 'jq', artifact: 'jq', executable: ['tools', 'jq', 'jq.exe'], args: ['--version'], pattern: /jq-([^\s]+)/ },
  { name: 'curl', executable: ['git', 'mingw64', 'bin', 'curl.exe'], args: ['--version'], pattern: /curl\s+([^\s]+)/ },
  { name: 'sevenzip', artifact: 'sevenzip', executable: ['tools', 'sevenzip', 'x64', '7za.exe'], args: [], pattern: /7-Zip.*?([0-9]+\.[0-9]+)/ },
])

function runVersionCheck(runtimeRoot, check) {
  const executable = join(runtimeRoot, ...check.executable)
  const result = spawnSync(executable, check.args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15_000,
  })
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim()
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`${check.name} exited with status ${String(result.status)}:\n${output}`)
  }
  const match = check.pattern.exec(output)
  if (match === null) throw new Error(`${check.name} returned an unrecognized version:\n${output}`)
  return { name: check.name, version: match[1] }
}

/** Execute every coding tool carried by the desktop runtime and verify manifest-owned versions. */
export async function verifyBundledTools(runtimeRoot) {
  const manifest = JSON.parse(await readFile(join(runtimeRoot, 'manifest.json'), 'utf8'))
  const expected = new Map(manifest.artifacts.map(artifact => [artifact.name, artifact.version]))
  const results = toolChecks.map(check => runVersionCheck(runtimeRoot, check))
  for (let index = 0; index < toolChecks.length; index += 1) {
    const artifact = toolChecks[index].artifact
    if (artifact === undefined) continue
    const expectedVersion = expected.get(artifact)
    if (expectedVersion !== results[index].version) {
      throw new Error(`${results[index].name} version ${results[index].version} does not match manifest ${String(expectedVersion)}.`)
    }
  }
  return results
}

async function countReparsePoints(root) {
  let count = 0
  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      const metadata = await lstat(path)
      if (metadata.isSymbolicLink()) {
        count += 1
      } else if (metadata.isDirectory()) {
        pending.push(path)
      }
    }
  }
  return count
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitFor(predicate, timeoutMs, failureMessage) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await predicate()
    if (value !== undefined) return value
    await new Promise(resolveDelay => setTimeout(resolveDelay, 200))
  }
  throw new Error(failureMessage)
}

async function readReadyState(path, electronPid) {
  return await waitFor(async () => {
    if (!isProcessAlive(electronPid)) throw new Error('Electron exited before desktop-ready.json was written.')
    try {
      return JSON.parse(await readFile(path, 'utf8'))
    } catch (error) {
      if (error?.code === 'ENOENT') return undefined
      throw error
    }
  }, startupTimeoutMs, 'Timed out waiting for desktop-ready.json.')
}

async function waitForExit(pid, timeoutMs, label) {
  await waitFor(
    async () => isProcessAlive(pid) ? undefined : true,
    timeoutMs,
    `${label} process ${String(pid)} did not exit within ${String(timeoutMs)} ms.`,
  )
}

async function terminateProcessTree(pid) {
  spawnSync('taskkill.exe', ['/pid', String(pid), '/t', '/f'], {
    windowsHide: true,
    stdio: 'ignore',
  })
}

/** Exercise a packaged Electron directory through startup, HTTP readiness, and shutdown. */
export async function smokeUnpacked(unpackedRoot) {
  const productRoot = resolve(unpackedRoot)
  const resourcesRoot = join(productRoot, 'resources')
  const executable = join(productRoot, 'DeepSeek Harness.exe')
  await verifyStagedProduct(resourcesRoot, PACKAGED_REQUIRED_FILES)
  const reparsePoints = await countReparsePoints(resourcesRoot)
  if (reparsePoints !== 0) throw new Error(`Packaged resources contain ${String(reparsePoints)} reparse points.`)
  const tools = await verifyBundledTools(join(resourcesRoot, 'runtime'))
  const userData = await mkdtemp(join(tmpdir(), 'dsh-desktop-unpacked-'))
  const child = spawn(executable, [], {
    env: { ...process.env, DSH_DESKTOP_USER_DATA: userData },
    stdio: 'ignore',
    windowsHide: false,
  })
  if (child.pid === undefined) throw new Error('Electron did not report a process id.')

  let harnessPid
  try {
    const ready = await readReadyState(join(userData, 'desktop-ready.json'), child.pid)
    harnessPid = ready.pid
    const response = await fetch(ready.url, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error(`Desktop HTTP request returned ${String(response.status)}.`)
    await new Promise(resolveDelay => setTimeout(resolveDelay, 2_000))
    if (!isProcessAlive(harnessPid)) throw new Error('Harness exited after the desktop reported readiness.')

    const close = spawnSync('taskkill.exe', ['/pid', String(child.pid)], {
      encoding: 'utf8',
      windowsHide: true,
    })
    if (close.status !== 0) throw new Error(`Could not close Electron:\n${close.stderr ?? close.stdout}`)
    await waitForExit(child.pid, shutdownTimeoutMs, 'Electron')
    await waitForExit(harnessPid, shutdownTimeoutMs, 'Harness')
    return { httpStatus: response.status, reparsePoints, tools }
  } finally {
    if (isProcessAlive(child.pid)) await terminateProcessTree(child.pid)
    if (harnessPid !== undefined && isProcessAlive(harnessPid)) await terminateProcessTree(harnessPid)
    await rm(userData, { recursive: true, force: true })
  }
}

/** Resolve an optional custom unpacked directory from package-manager forwarded arguments. */
export function resolveUnpackedRootArgument(args, defaultRoot) {
  const values = args[0] === '--' ? args.slice(1) : args
  return values[0] ?? defaultRoot
}

const scriptPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (scriptPath === resolve(fileURLToPath(import.meta.url))) {
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const unpackedRoot = resolveUnpackedRootArgument(
    process.argv.slice(2),
    join(desktopRoot, 'release', 'win-unpacked'),
  )
  const result = await smokeUnpacked(unpackedRoot)
  console.log(`smoke-unpacked: HTTP ${String(result.httpStatus)}, ${String(result.reparsePoints)} reparse points`)
  for (const tool of result.tools) console.log(`- ${tool.name} ${tool.version}`)
}
