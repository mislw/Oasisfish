import { access, readFile, rm, rmdir, stat } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validatePortableInventory, verifyPortableTree } from './portable-inventory.mjs'

function isInside(parent, child) {
  const candidate = relative(resolve(parent), resolve(child))
  return candidate !== '' && !candidate.startsWith('..') && !isAbsolute(candidate)
}

async function readReceipt(path) {
  const value = JSON.parse(await readFile(path, 'utf8'))
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
    || value.product !== 'Oasisfish'
    || typeof value.version !== 'string'
    || typeof value.installDirectory !== 'string'
    || typeof value.executablePath !== 'string'
  ) throw new Error('Installed receipt is invalid.')
  return value
}

async function validateReceipt(receiptPath, targetVersion, portableRoot) {
  const receipt = await readReceipt(receiptPath)
  if (receipt.version !== targetVersion) throw new Error('Installed receipt version does not match the update.')
  if (resolve(receipt.installDirectory) !== resolve(dirname(receipt.executablePath))) {
    throw new Error('Installed receipt directory does not match its executable.')
  }
  if (isInside(portableRoot, receipt.executablePath) || resolve(portableRoot) === resolve(receipt.installDirectory)) {
    throw new Error('Installed receipt points into the portable directory.')
  }
  await access(receipt.executablePath)
  return receipt
}

/** Remove an unchanged portable tree only after a matching installed receipt exists. */
export async function cleanPortableTree(options) {
  try {
    const inventory = validatePortableInventory(options.inventory)
    await validateReceipt(options.receiptPath, options.targetVersion, options.portableRoot)
    const verified = await verifyPortableTree(options.portableRoot, inventory)
    if (!verified.ok) return verified

    const files = inventory.entries.filter(entry => entry.kind === 'file')
    const directories = inventory.entries
      .filter(entry => entry.kind === 'directory')
      .sort((left, right) => right.path.split('/').length - left.path.split('/').length)
    for (const entry of files) await rm(resolve(options.portableRoot, ...entry.path.split('/')), { force: false })
    await rm(resolve(options.portableRoot, 'resources', 'oasisfish-portable-inventory.json'), { force: false })
    for (const entry of directories) await rmdir(resolve(options.portableRoot, ...entry.path.split('/')))
    await rmdir(options.portableRoot)
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

async function processExists(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

async function waitForProcessExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (await processExists(pid)) {
    if (Date.now() >= deadline) throw new Error('Portable process did not exit before cleanup timeout.')
    await new Promise(resolvePromise => setTimeout(resolvePromise, 500))
  }
}

async function waitForReceipt(path, version, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (true) {
    try {
      const receipt = await readReceipt(path)
      if (receipt.version === version) return
    } catch (error) {
      if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
    }
    if (Date.now() >= deadline) throw new Error('Installed receipt did not reach the requested version.')
    await new Promise(resolvePromise => setTimeout(resolvePromise, 1_000))
  }
}

async function appendDiagnostic(path, message) {
  const { appendFile, mkdir } = await import('node:fs/promises')
  await mkdir(dirname(path), { recursive: true })
  await appendFile(path, `${new Date().toISOString()} ${message}\n`, 'utf8')
}

async function main(requestPath) {
  const request = JSON.parse(await readFile(requestPath, 'utf8'))
  const inventory = JSON.parse(await readFile(request.inventoryPath, 'utf8'))
  try {
    await waitForProcessExit(request.oldPid, 15 * 60_000)
    await waitForReceipt(request.receiptPath, request.targetVersion, 30 * 60_000)
    const result = await cleanPortableTree({
      portableRoot: request.portableRoot,
      inventory,
      receiptPath: request.receiptPath,
      targetVersion: request.targetVersion,
    })
    await appendDiagnostic(request.diagnosticPath, result.ok ? 'Portable cleanup completed.' : result.reason)
    if (!result.ok) process.exitCode = 1
  } catch (error) {
    await appendDiagnostic(request.diagnosticPath, error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && resolve(invokedPath) === resolve(fileURLToPath(import.meta.url))) {
  const requestPath = process.argv[2]
  if (requestPath === undefined) throw new Error('Portable cleanup request path is required.')
  await main(requestPath)
}
