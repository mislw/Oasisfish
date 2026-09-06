import { spawn, spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PACKAGED_REQUIRED_FILES, verifyStagedProduct } from './staged-inventory.mjs'
import { verifyModelResources } from './verify-model-resources.mjs'

const startupTimeoutMs = 60_000
const shutdownTimeoutMs = 15_000
const backgroundCloseObservationMs = 1_000
const rpcTimeoutMs = 600_000
const searchQuery = '如何用 UGCAskQ 读取 DataTable？'
let rpcSequence = 0

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

async function rpc(baseUrl, method, payload) {
  rpcSequence += 1
  const response = await fetch(`${baseUrl}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `desktop-smoke-${String(rpcSequence)}`,
      method,
      payload,
    }),
    signal: AbortSignal.timeout(rpcTimeoutMs),
  })
  if (!response.ok) throw new Error(`${method} failed over HTTP ${String(response.status)}: ${await response.text()}`)
  const body = await response.json()
  if (body?.result?.ok !== true) {
    const error = body?.result?.error
    throw new Error(`${method} failed: ${String(error?.code)}: ${String(error?.message)}`)
  }
  return body.result.value
}

async function writeSearchCommandPlugin(userData) {
  const dshHome = join(userData, 'dsh')
  const pluginPath = join(dshHome, 'desktop-smoke-search.mjs')
  await mkdir(dshHome, { recursive: true })
  await writeFile(pluginPath, `export const name = 'desktop-smoke-search'\n\nexport const inject = ['commands']\n\nexport function apply(ctx) {\n  ctx.commands.register({\n    name: 'desktop-smoke-search',\n    description: 'Run the packaged local Skill search acceptance probe.',\n    recordInput: false,\n    async handler(invocation) {\n      const result = await invocation.agent.ctx.tools.execute({\n        callId: \`desktop-smoke-search-\${Date.now()}\`,\n        name: 'skill_search',\n        arguments: { name: 'oasis-wiki', query: ${JSON.stringify(searchQuery)}, limit: 1 },\n        agent: invocation.agent,\n        signal: invocation.signal,\n      })\n      if (result.isError) return { kind: 'error', text: result.error.message }\n      return { kind: 'success', text: JSON.stringify(result.value) }\n    },\n  })\n}\n`)
  await writeFile(join(dshHome, 'cordis.patch.yml'), [
    '- insert:',
    '    - id: desktop-smoke-search',
    `      name: ${JSON.stringify(pathToFileURL(pluginPath).href)}`,
    '',
  ].join('\n'))
}

async function executeSearch(baseUrl, userData) {
  const created = await rpc(baseUrl, 'session.create', {
    cwd: userData,
    agentPreset: 'standard',
  })
  const execution = await rpc(baseUrl, 'commands/execute', {
    args: {
      agentId: created.sessionId,
      line: '/desktop-smoke-search',
      images: [],
    },
  })
  if (execution?.result?.kind !== 'success' || typeof execution.result.text !== 'string') {
    throw new Error(`Desktop Skill search command failed: ${String(execution?.result?.text)}`)
  }
  return JSON.parse(execution.result.text)
}

function readCorpusRevisions(databasePath) {
  const database = new DatabaseSync(databasePath, { readOnly: true })
  try {
    return database.prepare(`
      SELECT corpus_key AS corpusKey, revision
      FROM corpora
      ORDER BY corpus_key ASC
    `).all()
  } finally {
    database.close()
  }
}

async function runDesktopCycle(executable, userData) {
  const readyPath = join(userData, 'desktop-ready.json')
  await rm(readyPath, { force: true })
  const child = spawn(executable, [], {
    env: {
      ...process.env,
      BROWSER: process.execPath,
      DSH_DESKTOP_USER_DATA: userData,
    },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    windowsHide: false,
  })
  if (child.pid === undefined) throw new Error('Electron did not report a process id.')

  let harnessPid
  try {
    const ready = await readReadyState(readyPath, child.pid)
    harnessPid = ready.pid
    const response = await fetch(ready.url, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error(`Desktop HTTP request returned ${String(response.status)}.`)
    if (!isProcessAlive(harnessPid)) throw new Error('Harness exited after the desktop reported readiness.')
    const search = await executeSearch(ready.url, userData)
    const desktopLog = await readFile(join(userData, 'logs', 'desktop.log'), 'utf8')
    if (desktopLog.includes('dsh web: opening the default browser')) {
      throw new Error('Desktop startup attempted to open the Web UI in the default browser.')
    }

    const close = spawnSync('taskkill.exe', ['/pid', String(child.pid)], {
      encoding: 'utf8',
      windowsHide: true,
    })
    if (close.status !== 0) throw new Error(`Could not request an Electron window close:\n${close.stderr ?? close.stdout}`)
    await new Promise(resolveDelay => setTimeout(resolveDelay, backgroundCloseObservationMs))
    if (!isProcessAlive(child.pid)) throw new Error('Electron exited after a window-close request.')
    if (!isProcessAlive(harnessPid)) throw new Error('Harness exited after an Electron window-close request.')
    await new Promise((resolveQuitRequest, reject) => {
      child.send({ type: 'oasisfish.quit' }, (error) => {
        if (error === null) resolveQuitRequest()
        else reject(error)
      })
    })
    await waitForExit(child.pid, shutdownTimeoutMs, 'Electron')
    await waitForExit(harnessPid, shutdownTimeoutMs, 'Harness')
    return { backgroundClosePreserved: true, httpStatus: response.status, search }
  } finally {
    if (isProcessAlive(child.pid)) await terminateProcessTree(child.pid)
    if (harnessPid !== undefined && isProcessAlive(harnessPid)) await terminateProcessTree(harnessPid)
  }
}

/** Exercise a packaged Electron directory through local retrieval, restart reuse, and shutdown. */
export async function smokeUnpacked(unpackedRoot) {
  const productRoot = resolve(unpackedRoot)
  const resourcesRoot = join(productRoot, 'resources')
  const executable = join(productRoot, 'Oasisfish.exe')
  await verifyStagedProduct(resourcesRoot, PACKAGED_REQUIRED_FILES)
  await verifyModelResources(join(resourcesRoot, 'models', 'bge-small-zh-v1.5'))
  const reparsePoints = await countReparsePoints(resourcesRoot)
  if (reparsePoints !== 0) throw new Error(`Packaged resources contain ${String(reparsePoints)} reparse points.`)
  const tools = await verifyBundledTools(join(resourcesRoot, 'runtime'))
  const userData = await mkdtemp(join(tmpdir(), 'dsh-desktop-unpacked-'))
  try {
    await writeSearchCommandPlugin(userData)
    const first = await runDesktopCycle(executable, userData)
    const databasePath = join(userData, 'cache', 'skill-search', 'skill-search.sqlite')
    const firstRevisions = readCorpusRevisions(databasePath)
    const second = await runDesktopCycle(executable, userData)
    const secondRevisions = readCorpusRevisions(databasePath)
    const cacheReused = firstRevisions.length > 0
      && JSON.stringify(firstRevisions) === JSON.stringify(secondRevisions)
    return {
      backgroundClosePreserved: first.backgroundClosePreserved && second.backgroundClosePreserved,
      httpStatus: second.httpStatus,
      reparsePoints,
      tools,
      search: first.search,
      restartSearch: second.search,
      cacheReused,
      corpusRevisions: secondRevisions,
    }
  } finally {
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
  console.log(`- skill search: ${String(result.search.count)} hit(s), cache reused=${String(result.cacheReused)}`)
  for (const revision of result.corpusRevisions) {
    console.log(`- corpus ${String(revision.corpusKey)} revision ${String(revision.revision)}`)
  }
  for (const tool of result.tools) console.log(`- ${tool.name} ${tool.version}`)
}
