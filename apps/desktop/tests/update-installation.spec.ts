import { describe, expect, it, vi } from 'vitest'
import { runUpdateInstallation } from '../src/update-installation.ts'

describe('runUpdateInstallation', () => {
  it('prepares portable cleanup before allowing the application to quit', async () => {
    const order: string[] = []
    await runUpdateInstallation({
      distribution: 'portable',
      targetVersion: '1.3.0',
      preparePortableCleanup: vi.fn(async (version) => { order.push(`prepare:${version}`) }),
      beginQuit: () => { order.push('begin-quit') },
      terminateHarness: () => { order.push('terminate-harness') },
      destroyUi: () => { order.push('destroy-ui') },
      quitAndInstall: () => { order.push('quit-and-install') },
    })

    expect(order).toEqual([
      'prepare:1.3.0',
      'begin-quit',
      'terminate-harness',
      'destroy-ui',
      'quit-and-install',
    ])
  })

  it('skips portable cleanup for an installed upgrade', async () => {
    const preparePortableCleanup = vi.fn()
    const quitAndInstall = vi.fn()
    await runUpdateInstallation({
      distribution: 'installed',
      targetVersion: '1.3.0',
      preparePortableCleanup,
      beginQuit: vi.fn(),
      terminateHarness: vi.fn(),
      destroyUi: vi.fn(),
      quitAndInstall,
    })

    expect(preparePortableCleanup).not.toHaveBeenCalled()
    expect(quitAndInstall).toHaveBeenCalledTimes(1)
  })

  it('does not tear down the running application when portable preparation fails', async () => {
    const beginQuit = vi.fn()
    const terminateHarness = vi.fn()
    const destroyUi = vi.fn()
    const quitAndInstall = vi.fn()

    await expect(runUpdateInstallation({
      distribution: 'portable',
      targetVersion: '1.3.0',
      preparePortableCleanup: async () => { throw new Error('unsafe portable tree') },
      beginQuit,
      terminateHarness,
      destroyUi,
      quitAndInstall,
    })).rejects.toThrow('unsafe portable tree')

    expect(beginQuit).not.toHaveBeenCalled()
    expect(terminateHarness).not.toHaveBeenCalled()
    expect(destroyUi).not.toHaveBeenCalled()
    expect(quitAndInstall).not.toHaveBeenCalled()
  })
})
