import type { DesktopDistribution } from './portable-migration.ts'

/** Dependencies and ordered teardown operations for one update installation. */
export interface UpdateInstallationOptions {
  readonly distribution: DesktopDistribution
  readonly targetVersion: string
  readonly preparePortableCleanup: (targetVersion: string) => Promise<void>
  readonly beginQuit: () => void
  readonly terminateHarness: () => void
  readonly destroyUi: () => void
  readonly quitAndInstall: () => void
}

/** Prepare portable cleanup before allowing electron-updater to terminate the application. */
export async function runUpdateInstallation(options: UpdateInstallationOptions): Promise<void> {
  if (options.distribution === 'portable') {
    await options.preparePortableCleanup(options.targetVersion)
  }
  options.beginQuit()
  options.terminateHarness()
  options.destroyUi()
  options.quitAndInstall()
}
