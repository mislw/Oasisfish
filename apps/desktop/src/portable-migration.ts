import { spawn as spawnProcess, type ChildProcess } from 'node:child_process'
import { access, copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import {
  PORTABLE_INVENTORY_PATH,
  validatePortableInventory,
  verifyPortableTree,
} from '../scripts/portable-inventory.mjs'

export const INSTALLED_MARKER = 'oasisfish-installed.json'
const INSTALLED_RECEIPT = 'updates/installed-receipt.json'

/** Runtime distribution mode selected by the NSIS-owned installation marker. */
export type DesktopDistribution = 'installed' | 'portable'

/** Receipt written by an installed build after Electron reaches ready state. */
interface InstalledReceipt {
  readonly product: 'Oasisfish'
  readonly version: string
  readonly installDirectory: string
  readonly executablePath: string
}

/** Immutable request consumed by the detached portable cleanup process. */
export interface PortableCleanupRequest {
  readonly oldPid: number
  readonly targetVersion: string
  readonly portableRoot: string
  readonly inventoryPath: string
  readonly receiptPath: string
  readonly diagnosticPath: string
}

interface SpawnedCleanup {
  unref(): void
}

/** Spawn signature used for the copied cleanup runtime. */
type SpawnCleanup = (
  command: string,
  args: readonly string[],
  options: { detached: true; stdio: 'ignore'; windowsHide: true },
) => SpawnedCleanup

/** Dependencies required to prepare and launch detached portable cleanup. */
export interface PreparePortableCleanupOptions {
  readonly portableRoot: string
  readonly resourcesRoot: string
  readonly dataRoot: string
  readonly currentPid: number
  readonly targetVersion: string
  readonly spawn?: SpawnCleanup
}

function inside(parent: string, child: string): boolean {
  const candidate = relative(resolve(parent), resolve(child))
  return candidate !== '' && !candidate.startsWith('..') && !isAbsolute(candidate)
}

/** Resolve installed versus extracted-portable execution without consulting mutable user data. */
export async function resolveDesktopDistribution(resourcesRoot: string): Promise<DesktopDistribution> {
  try {
    await access(join(resourcesRoot, INSTALLED_MARKER))
    return 'installed'
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'portable'
    throw error
  }
}

/** Atomically publish the version and path reached by a successfully started installed build. */
export async function writeInstalledReceipt(options: {
  readonly dataRoot: string
  readonly version: string
  readonly executablePath: string
}): Promise<string> {
  const target = join(options.dataRoot, ...INSTALLED_RECEIPT.split('/'))
  const temporary = `${target}.tmp-${process.pid}`
  const receipt: InstalledReceipt = {
    product: 'Oasisfish',
    version: options.version,
    installDirectory: dirname(options.executablePath),
    executablePath: options.executablePath,
  }
  await mkdir(dirname(target), { recursive: true })
  await writeFile(temporary, `${JSON.stringify(receipt)}\n`, 'utf8')
  try {
    await rm(target, { force: true })
    await rename(temporary, target)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
  return target
}

function nodeSpawn(command: string, args: readonly string[], options: {
  detached: true
  stdio: 'ignore'
  windowsHide: true
}): ChildProcess {
  return spawnProcess(command, [...args], options)
}

/** Copy a self-contained cleanup runtime outside the old tree and launch it detached. */
export async function preparePortableCleanup(options: PreparePortableCleanupOptions): Promise<{
  readonly request: PortableCleanupRequest
  readonly requestPath: string
  readonly nodePath: string
  readonly helperPath: string
}> {
  if (resolve(options.portableRoot) === resolve(options.dataRoot)
    || inside(options.portableRoot, options.dataRoot)
    || inside(options.dataRoot, options.portableRoot)) {
    throw new Error('Portable application and user-data roots must be separate.')
  }
  const sourceInventoryPath = join(options.portableRoot, ...PORTABLE_INVENTORY_PATH.split('/'))
  const inventory = validatePortableInventory(JSON.parse(await readFile(sourceInventoryPath, 'utf8')))
  if (inventory.version === options.targetVersion) throw new Error('Portable cleanup target must be newer than the running version.')
  const verified = await verifyPortableTree(options.portableRoot, inventory)
  if (!verified.ok) throw new Error(verified.reason)

  const cleanupRoot = join(
    options.dataRoot,
    'updates',
    `portable-cleanup-${options.currentPid}-${options.targetVersion.replaceAll(/[^a-zA-Z0-9._-]/g, '_')}`,
  )
  await mkdir(cleanupRoot, { recursive: true })
  const nodePath = join(cleanupRoot, 'node.exe')
  const helperPath = join(cleanupRoot, 'portable-cleanup.mjs')
  const inventoryModulePath = join(cleanupRoot, 'portable-inventory.mjs')
  const inventoryPath = join(cleanupRoot, 'inventory.json')
  await Promise.all([
    copyFile(join(options.resourcesRoot, 'runtime', 'node', 'node.exe'), nodePath),
    copyFile(join(options.resourcesRoot, 'cleanup', 'portable-cleanup.mjs'), helperPath),
    copyFile(join(options.resourcesRoot, 'cleanup', 'portable-inventory.mjs'), inventoryModulePath),
    copyFile(sourceInventoryPath, inventoryPath),
  ])
  const request: PortableCleanupRequest = Object.freeze({
    oldPid: options.currentPid,
    targetVersion: options.targetVersion,
    portableRoot: options.portableRoot,
    inventoryPath,
    receiptPath: join(options.dataRoot, ...INSTALLED_RECEIPT.split('/')),
    diagnosticPath: join(options.dataRoot, 'updates', 'portable-cleanup.log'),
  })
  const requestPath = join(cleanupRoot, 'request.json')
  await writeFile(requestPath, `${JSON.stringify(request)}\n`, 'utf8')
  const child = (options.spawn ?? nodeSpawn)(nodePath, [helperPath, requestPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
  return { request, requestPath, nodePath, helperPath }
}
