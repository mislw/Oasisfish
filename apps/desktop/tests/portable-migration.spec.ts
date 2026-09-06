import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPortableInventory, PORTABLE_INVENTORY_PATH } from '../scripts/portable-inventory.mjs'
import { cleanPortableTree } from '../scripts/portable-cleanup.mjs'
import {
  INSTALLED_MARKER,
  preparePortableCleanup,
  resolveDesktopDistribution,
  writeInstalledReceipt,
} from '../src/portable-migration.ts'

const temporaryDirectories: string[] = []

async function temporaryRoot(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), name))
  temporaryDirectories.push(root)
  return root
}

async function write(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('portable migration', () => {
  it('distinguishes an NSIS install from an extracted portable tree', async () => {
    const root = await temporaryRoot('oasisfish-distribution-')
    const resourcesRoot = join(root, 'resources')
    await mkdir(resourcesRoot)

    await expect(resolveDesktopDistribution(resourcesRoot)).resolves.toBe('portable')
    await write(join(resourcesRoot, INSTALLED_MARKER), 'installed\n')
    await expect(resolveDesktopDistribution(resourcesRoot)).resolves.toBe('installed')
  })

  it('writes an installed receipt from the running target version', async () => {
    const dataRoot = await temporaryRoot('oasisfish-receipt-')
    const executable = join(await temporaryRoot('oasisfish-installed-'), 'Oasisfish.exe')
    await write(executable, 'exe')

    const receiptPath = await writeInstalledReceipt({ dataRoot, version: '1.3.0', executablePath: executable })

    expect(JSON.parse(await readFile(receiptPath, 'utf8'))).toEqual({
      product: 'Oasisfish',
      version: '1.3.0',
      installDirectory: dirname(executable),
      executablePath: executable,
    })
  })

  it('deletes only an unchanged portable tree after the target receipt is verified', async () => {
    const portableRoot = await temporaryRoot('oasisfish-clean-success-')
    const stateRoot = await temporaryRoot('oasisfish-clean-state-')
    await write(join(portableRoot, 'Oasisfish.exe'), 'old exe')
    await write(join(portableRoot, 'resources/app.txt'), 'owned')
    const inventory = await createPortableInventory(portableRoot, '1.2.3')
    const inventoryCopy = join(stateRoot, 'inventory.json')
    await copyFile(join(portableRoot, PORTABLE_INVENTORY_PATH), inventoryCopy)
    const installedExecutable = join(stateRoot, 'installed/Oasisfish.exe')
    await write(installedExecutable, 'new exe')
    const receiptPath = await writeInstalledReceipt({
      dataRoot: stateRoot,
      version: '1.3.0',
      executablePath: installedExecutable,
    })

    await expect(cleanPortableTree({
      portableRoot,
      inventory,
      receiptPath,
      targetVersion: '1.3.0',
    })).resolves.toEqual({ ok: true })
    await expect(stat(portableRoot)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each([
    ['an unknown file', async (root: string) => write(join(root, 'notes.txt'), 'keep me'), '1.3.0'],
    ['a modified owned file', async (root: string) => write(join(root, 'resources/app.txt'), 'changed'), '1.3.0'],
    ['a mismatched installed version', async () => {}, '1.4.0'],
  ])('preserves every portable file when cleanup finds %s', async (_label, mutate, targetVersion) => {
    const portableRoot = await temporaryRoot('oasisfish-clean-preserve-')
    const stateRoot = await temporaryRoot('oasisfish-clean-preserve-state-')
    await write(join(portableRoot, 'Oasisfish.exe'), 'old exe')
    await write(join(portableRoot, 'resources/app.txt'), 'owned')
    const inventory = await createPortableInventory(portableRoot, '1.2.3')
    await mutate(portableRoot)
    const installedExecutable = join(stateRoot, 'installed/Oasisfish.exe')
    await write(installedExecutable, 'new exe')
    const receiptPath = await writeInstalledReceipt({
      dataRoot: stateRoot,
      version: '1.3.0',
      executablePath: installedExecutable,
    })

    await expect(cleanPortableTree({
      portableRoot,
      inventory,
      receiptPath,
      targetVersion,
    })).resolves.toMatchObject({ ok: false })
    await expect(readFile(join(portableRoot, 'Oasisfish.exe'), 'utf8')).resolves.toBe('old exe')
    await expect(readFile(join(portableRoot, 'resources/app.txt'), 'utf8')).resolves.toBe(
      _label === 'a modified owned file' ? 'changed' : 'owned',
    )
  })

  it('copies the cleanup runtime outside the portable root and launches it detached', async () => {
    const portableRoot = await temporaryRoot('oasisfish-clean-prepare-')
    const dataRoot = await temporaryRoot('oasisfish-clean-data-')
    await write(join(portableRoot, 'Oasisfish.exe'), 'old exe')
    await write(join(portableRoot, 'resources/runtime/node/node.exe'), 'node')
    await write(join(portableRoot, 'resources/cleanup/portable-cleanup.mjs'), 'helper')
    await write(join(portableRoot, 'resources/cleanup/portable-inventory.mjs'), 'inventory helper')
    await createPortableInventory(portableRoot, '1.2.3')
    const unref = vi.fn()
    const spawn = vi.fn(() => ({ unref }))

    const prepared = await preparePortableCleanup({
      portableRoot,
      resourcesRoot: join(portableRoot, 'resources'),
      dataRoot,
      currentPid: 123,
      targetVersion: '1.3.0',
      spawn,
    })

    expect(prepared.request.portableRoot).toBe(portableRoot)
    expect(prepared.request.targetVersion).toBe('1.3.0')
    expect(prepared.nodePath.startsWith(dataRoot)).toBe(true)
    expect(prepared.helperPath.startsWith(dataRoot)).toBe(true)
    expect(spawn).toHaveBeenCalledWith(
      prepared.nodePath,
      [prepared.helperPath, prepared.requestPath],
      { detached: true, stdio: 'ignore', windowsHide: true },
    )
    expect(unref).toHaveBeenCalledTimes(1)
  })
})
