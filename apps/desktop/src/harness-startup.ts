import { mkdir, open, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

const READY_FILENAME = 'desktop-ready.json'
const STARTUP_LOCK_FILENAME = 'desktop-harness-startup.lock'

interface ReadyState {
  pid: number
  url: string
}

/** Result of coordinating one Harness server for a desktop data directory. */
export interface HarnessStartupResult {
  /** Loopback URL served by the active Harness. */
  url: string
  /** Whether this desktop process started and therefore owns the Harness process. */
  owned: boolean
}

/** Injectable process, network, and timing operations for startup coordination. */
export interface HarnessStartupOptions {
  fetch?: typeof globalThis.fetch
  isProcessAlive?: (pid: number) => boolean
  sleep?: (milliseconds: number) => Promise<void>
  now?: () => number
  timeoutMs?: number
  intervalMs?: number
}

function defaultProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // Process lookup failures mean the recorded startup owner is no longer usable.
    void error
    return false
  }
}

function parseReadyState(value: string): ReadyState | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    // A partial or foreign file is not an active Harness announcement.
    void error
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const candidate = parsed as Partial<ReadyState>
  if (!Number.isSafeInteger(candidate.pid) || (candidate.pid ?? 0) <= 0 || typeof candidate.url !== 'string') {
    return undefined
  }
  let url: URL
  try {
    url = new URL(candidate.url)
  } catch (error) {
    // Only a valid local HTTP endpoint can be reused by the desktop shell.
    void error
    return undefined
  }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') return undefined
  return { pid: candidate.pid as number, url: url.href.replace(/\/$/u, '') }
}

async function readActiveReadyState(
  path: string,
  fetch: typeof globalThis.fetch,
  isProcessAlive: (pid: number) => boolean,
): Promise<ReadyState | undefined> {
  let serialized: string
  try {
    serialized = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  const ready = parseReadyState(serialized)
  if (ready === undefined || !isProcessAlive(ready.pid)) return undefined
  try {
    const response = await fetch(ready.url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(2_000),
    })
    return response.ok ? ready : undefined
  } catch (error) {
    // A live PID without a responding loopback server is not ready for reuse.
    void error
    return undefined
  }
}

async function readLockOwner(path: string): Promise<number | undefined> {
  let value: string
  try {
    value = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  const pid = Number(value.trim())
  return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined
}

async function removeStaleLock(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

/**
 * Reuse or start the single Harness server associated with one desktop data directory.
 * @param dataRoot - Electron user-data directory shared by desktop distributions.
 * @param start - Starts a Harness and resolves after its loopback server is ready.
 * @param options - Injectable process, network, and timing operations.
 * @returns The active URL and whether the caller owns the new Harness process.
 */
export async function coordinateHarnessStartup(
  dataRoot: string,
  start: () => Promise<string>,
  options: HarnessStartupOptions = {},
): Promise<HarnessStartupResult> {
  await mkdir(dataRoot, { recursive: true })
  const readyPath = join(dataRoot, READY_FILENAME)
  const lockPath = join(dataRoot, STARTUP_LOCK_FILENAME)
  const fetch = options.fetch ?? globalThis.fetch
  const isProcessAlive = options.isProcessAlive ?? defaultProcessAlive
  const sleep = options.sleep ?? (async (milliseconds) => {
    await new Promise<void>((resolve) => { setTimeout(resolve, milliseconds) })
  })
  const now = options.now ?? Date.now
  const timeoutMs = options.timeoutMs ?? 45_000
  const intervalMs = options.intervalMs ?? 100
  const deadline = now() + timeoutMs

  while (now() < deadline) {
    const ready = await readActiveReadyState(readyPath, fetch, isProcessAlive)
    if (ready !== undefined) return { url: ready.url, owned: false }

    let lock
    try {
      lock = await open(lockPath, 'wx')
      await lock.writeFile(`${process.pid}\n`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const ownerPid = await readLockOwner(lockPath)
      if (ownerPid === undefined || !isProcessAlive(ownerPid)) {
        await removeStaleLock(lockPath)
        continue
      }
      await sleep(intervalMs)
      continue
    }

    try {
      const published = await readActiveReadyState(readyPath, fetch, isProcessAlive)
      if (published !== undefined) return { url: published.url, owned: false }
      return { url: await start(), owned: true }
    } finally {
      await lock.close()
      await removeStaleLock(lockPath)
    }
  }

  throw new Error(`Timed out waiting for the desktop Harness startup after ${timeoutMs} ms.`)
}
