import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { DesktopUpdateController, type UpdaterFacade } from '../src/update-controller.ts'

class FakeUpdater extends EventEmitter implements UpdaterFacade {
  allowPrerelease = false
  autoDownload = true
  autoInstallOnAppQuit = true

  checkForUpdates = vi.fn<UpdaterFacade['checkForUpdates']>()
  downloadUpdate = vi.fn<UpdaterFacade['downloadUpdate']>()
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('DesktopUpdateController', () => {
  it.each([
    { isPackaged: true, version: '1.2.3', phase: 'idle', allowPrerelease: false },
    { isPackaged: true, version: '1.2.3-rc.1', phase: 'idle', allowPrerelease: true },
    { isPackaged: false, version: '1.2.3', phase: 'unsupported', allowPrerelease: false },
  ] as const)('starts $phase for $version when packaged=$isPackaged without automatic actions', (fixture) => {
    const updater = new FakeUpdater()
    const controller = new DesktopUpdateController({
      updater,
      currentVersion: fixture.version,
      isPackaged: fixture.isPackaged,
      install: vi.fn(),
    })

    expect(controller.getState()).toEqual({
      phase: fixture.phase,
      currentVersion: fixture.version,
    })
    expect(Object.isFrozen(controller.getState())).toBe(true)
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    expect(updater.allowPrerelease).toBe(fixture.allowPrerelease)
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.downloadUpdate).not.toHaveBeenCalled()
  })

  it('publishes an available version after an explicit check', async () => {
    const updater = new FakeUpdater()
    updater.checkForUpdates.mockImplementation(async () => {
      updater.emit('update-available', { version: '1.3.0' })
      return undefined
    })
    const controller = new DesktopUpdateController({
      updater,
      currentVersion: '1.2.3',
      isPackaged: true,
      install: vi.fn(),
    })
    const seen: unknown[] = []
    const dispose = controller.subscribe(state => seen.push(state))

    const result = await controller.check()
    dispose()

    expect(result).toEqual({
      phase: 'available',
      currentVersion: '1.2.3',
      availableVersion: '1.3.0',
    })
    expect(seen).toEqual([
      { phase: 'checking', currentVersion: '1.2.3' },
      { phase: 'available', currentVersion: '1.2.3', availableVersion: '1.3.0' },
    ])
    updater.emit('update-not-available', { version: '1.2.3' })
    expect(seen).toHaveLength(2)
  })

  it('coalesces repeated checks into one updater operation', async () => {
    const pending = deferred<unknown>()
    const updater = new FakeUpdater()
    updater.checkForUpdates.mockReturnValue(pending.promise)
    const controller = new DesktopUpdateController({
      updater,
      currentVersion: '1.2.3',
      isPackaged: true,
      install: vi.fn(),
    })

    const first = controller.check()
    const second = controller.check()
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
    updater.emit('update-not-available', { version: '1.2.3' })
    pending.resolve(undefined)

    await expect(first).resolves.toEqual({ phase: 'up-to-date', currentVersion: '1.2.3' })
    await expect(second).resolves.toEqual({ phase: 'up-to-date', currentVersion: '1.2.3' })
  })

  it('publishes frozen download progress and enables install only after download', async () => {
    const install = vi.fn()
    const updater = new FakeUpdater()
    updater.checkForUpdates.mockImplementation(async () => {
      updater.emit('update-available', { version: '1.3.0' })
      return undefined
    })
    updater.downloadUpdate.mockImplementation(async () => {
      updater.emit('download-progress', {
        percent: 25,
        transferred: 250,
        total: 1_000,
        bytesPerSecond: 500,
      })
      updater.emit('update-downloaded', { version: '1.3.0' })
      return []
    })
    const controller = new DesktopUpdateController({
      updater,
      currentVersion: '1.2.3',
      isPackaged: true,
      install,
    })
    const seen: Array<ReturnType<DesktopUpdateController['getState']>> = []
    controller.subscribe(state => seen.push(state))

    await expect(controller.install()).rejects.toThrow('downloaded')
    await controller.check()
    await controller.download()

    expect(seen).toContainEqual({
      phase: 'downloading',
      currentVersion: '1.2.3',
      availableVersion: '1.3.0',
      progress: {
        percent: 25,
        transferred: 250,
        total: 1_000,
        bytesPerSecond: 500,
      },
    })
    expect(Object.isFrozen(seen.find(state => state.progress !== undefined)?.progress)).toBe(true)
    expect(controller.getState()).toEqual({
      phase: 'downloaded',
      currentVersion: '1.2.3',
      availableVersion: '1.3.0',
    })

    await controller.install()
    expect(install).toHaveBeenCalledWith('1.3.0')
    expect(controller.getState()).toEqual({
      phase: 'installing',
      currentVersion: '1.2.3',
      availableVersion: '1.3.0',
    })
  })

  it('keeps the app running when install preparation rejects', async () => {
    const updater = new FakeUpdater()
    updater.emit = updater.emit.bind(updater)
    const controller = new DesktopUpdateController({
      updater,
      currentVersion: '1.2.3',
      isPackaged: true,
      install: vi.fn(async () => { throw new Error('cleanup preparation failed') }),
    })
    updater.emit('update-downloaded', { version: '1.3.0' })

    await expect(controller.install()).resolves.toEqual({
      phase: 'error',
      currentVersion: '1.2.3',
      availableVersion: '1.3.0',
      message: 'Unable to complete the update. Try again.',
    })
  })

  it('keeps partial progress fields absent and rejects commands in incompatible states', async () => {
    const updater = new FakeUpdater()
    const controller = new DesktopUpdateController({
      updater,
      currentVersion: '1.2.3',
      isPackaged: true,
      install: vi.fn(),
    })

    await expect(controller.download()).rejects.toThrow('available')
    updater.emit('download-progress', { transferred: 10 })
    expect(controller.getState()).toEqual({
      phase: 'downloading',
      currentVersion: '1.2.3',
      progress: { transferred: 10 },
    })
    await expect(controller.check()).rejects.toThrow('downloading')
  })

  it('returns the active operation for every repeated command', async () => {
    const pending = deferred<unknown>()
    const updater = new FakeUpdater()
    updater.checkForUpdates.mockReturnValue(pending.promise)
    const controller = new DesktopUpdateController({
      updater,
      currentVersion: '1.2.3',
      isPackaged: true,
      install: vi.fn(),
    })

    const checking = controller.check()
    const downloadWhileChecking = controller.download()
    const installWhileChecking = controller.install()
    updater.emit('update-not-available', { version: '1.2.3' })
    pending.resolve(undefined)

    await expect(downloadWhileChecking).resolves.toEqual({ phase: 'up-to-date', currentVersion: '1.2.3' })
    await expect(installWhileChecking).resolves.toEqual({ phase: 'up-to-date', currentVersion: '1.2.3' })
    await checking
  })

  it('returns unsupported without contacting the provider', async () => {
    const updater = new FakeUpdater()
    const controller = new DesktopUpdateController({
      updater,
      currentVersion: '1.2.3',
      isPackaged: false,
      install: vi.fn(),
    })

    await expect(controller.check()).resolves.toEqual({
      phase: 'unsupported',
      currentVersion: '1.2.3',
    })
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('projects updater failures without local paths, URLs, or tokens', async () => {
    const updater = new FakeUpdater()
    updater.checkForUpdates.mockRejectedValue(new Error(
      'request https://github.com/private failed at C:\\Users\\Alice\\.env token=super-secret',
    ))
    const controller = new DesktopUpdateController({
      updater,
      currentVersion: '1.2.3',
      isPackaged: true,
      install: vi.fn(),
    })

    await expect(controller.check()).resolves.toEqual({
      phase: 'error',
      currentVersion: '1.2.3',
      message: 'Unable to complete the update. Try again.',
    })
    expect(JSON.stringify(controller.getState())).not.toMatch(/Alice|github|token|secret/i)

    updater.emit('update-available', { version: '1.3.0' })
    updater.emit('error', new Error('D:\\private\\token.txt'))
    expect(controller.getState()).toEqual({
      phase: 'error',
      currentVersion: '1.2.3',
      availableVersion: '1.3.0',
      message: 'Unable to complete the update. Try again.',
    })
  })
})
