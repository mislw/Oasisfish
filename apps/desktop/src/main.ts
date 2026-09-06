import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, Menu, Tray } from 'electron'
import { buildHarnessEnvironment } from './environment.ts'
import { resolveDesktopDataRoot, resolveDesktopPaths, type DesktopPaths } from './paths.ts'
import {
  preparePortableCleanup,
  resolveDesktopDistribution,
  writeInstalledReceipt,
} from './portable-migration.ts'
import { reserveLoopbackPort, waitForServer } from './server.ts'
import { DesktopUpdateController } from './update-controller.ts'
import { runUpdateInstallation } from './update-installation.ts'
import { registerDesktopUpdateIpc } from './update-ipc.ts'
import {
  createTrayMenuTemplate,
  createWindowLifecycle,
  handleParentControlMessage,
  type WindowLifecycle,
} from './window-lifecycle.ts'

const startupTimeoutMs = 45_000
const maxLogBytes = 5 * 1024 * 1024
let mainWindow: BrowserWindow | undefined
let mainWindowLifecycle: WindowLifecycle | undefined
let tray: Tray | undefined
let harnessProcess: ChildProcess | undefined
let disposeUpdateIpc: (() => void) | undefined
let quitting = false

if (process.send !== undefined) {
  process.on('message', (message: unknown) => {
    if (mainWindowLifecycle !== undefined) handleParentControlMessage(message, mainWindowLifecycle)
  })
}

interface DesktopWindow {
  readonly lifecycle: WindowLifecycle
  readonly window: BrowserWindow
}

if (process.env.DSH_DESKTOP_USER_DATA === undefined) {
  app.setPath('userData', resolveDesktopDataRoot(app.getPath('appData')))
} else {
  app.setPath('userData', process.env.DSH_DESKTOP_USER_DATA)
}

function developmentResourcesRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'build-resources')
}

function trayIconPath(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'icon.png')
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon.png')
}

function rotateLog(logPath: string): void {
  if (!existsSync(logPath) || statSync(logPath).size < maxLogBytes) return
  const previous = `${logPath}.previous`
  try {
    renameSync(logPath, previous)
  } catch (error) {
    // A stale previous log may be locked by diagnostics; continuing preserves startup availability.
    void error
  }
}

function assertInstalledResources(paths: DesktopPaths): void {
  for (const path of [paths.nodeExecutable, paths.dshEntry]) {
    if (!existsSync(path)) throw new Error(`Required desktop resource is missing: ${path}`)
  }
}

function terminateHarness(): void {
  const pid = harnessProcess?.pid
  harnessProcess = undefined
  if (pid === undefined) return
  spawnSync('taskkill.exe', ['/pid', String(pid), '/t', '/f'], {
    windowsHide: true,
    stdio: 'ignore',
  })
}

function destroyDesktopUi(): void {
  disposeUpdateIpc?.()
  disposeUpdateIpc = undefined
  mainWindow?.destroy()
  tray?.destroy()
}

async function startHarness(paths: DesktopPaths, port: number): Promise<string> {
  mkdirSync(paths.logDirectory, { recursive: true })
  mkdirSync(paths.dataRoot, { recursive: true })
  const logPath = join(paths.logDirectory, 'desktop.log')
  rotateLog(logPath)
  const log = createWriteStream(logPath, { flags: 'a' })
  const url = `http://127.0.0.1:${port}`

  const child = spawn(paths.nodeExecutable, [
    paths.dshEntry,
    'web',
    '--no-open',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
  ], {
    cwd: paths.dataRoot,
    env: buildHarnessEnvironment(process.env, paths),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  harnessProcess = child
  child.stdout.pipe(log, { end: false })
  child.stderr.pipe(log, { end: false })
  child.once('error', error => log.write(`\n[desktop] spawn error: ${error.stack ?? error.message}\n`))

  const earlyExit = new Promise<never>((_resolve, reject) => {
    child.once('exit', (code, signal) => {
      reject(new Error(`Harness exited before startup (code=${String(code)}, signal=${String(signal)}).`))
    })
  })
  await Promise.race([
    waitForServer(url, { timeoutMs: startupTimeoutMs }),
    earlyExit,
  ])
  writeFileSync(join(paths.dataRoot, 'desktop-ready.json'), `${JSON.stringify({ url, pid: child.pid })}\n`)
  return url
}

function createWindow(url: string): DesktopWindow {
  const preload = join(dirname(fileURLToPath(import.meta.url)), 'preload.cjs')
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload,
      sandbox: true,
    },
  })
  const allowedOrigin = new URL(url).origin
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, navigationUrl) => {
    if (new URL(navigationUrl).origin !== allowedOrigin) event.preventDefault()
  })
  window.once('ready-to-show', () => {
    window.show()
  })
  void window.loadURL(url)
  const lifecycle = createWindowLifecycle({
    window,
    confirmCloseToBackground: async () => {
      const result = await dialog.showMessageBox(window, {
        type: 'question',
        title: 'Oasisfish',
        message: '关闭窗口后，Oasisfish 将继续在后台运行。',
        detail: '你可以从 Windows 系统托盘重新打开或退出应用。',
        buttons: ['最小化到后台', '取消'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })
      return result.response === 0
    },
    quit: () => { app.quit() },
  })
  window.on('minimize', () => { lifecycle.handleMinimize() })
  window.on('close', (event) => {
    void lifecycle.handleClose(event).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      dialog.showErrorBox('Oasisfish', `无法切换到后台：${message}`)
    })
  })
  window.on('closed', () => {
    mainWindow = undefined
    mainWindowLifecycle = undefined
  })
  return { lifecycle, window }
}

function createTray(lifecycle: WindowLifecycle): Tray {
  const desktopTray = new Tray(trayIconPath())
  desktopTray.setToolTip('Oasisfish')
  desktopTray.setContextMenu(Menu.buildFromTemplate(createTrayMenuTemplate(lifecycle)))
  desktopTray.on('double-click', () => { lifecycle.showWindow() })
  return desktopTray
}

async function boot(): Promise<void> {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error(`Oasisfish supports Windows x64 only, received ${process.platform}-${process.arch}.`)
  }
  const resourcesRoot = process.env.DSH_DESKTOP_RESOURCES
    ?? (app.isPackaged ? process.resourcesPath : developmentResourcesRoot())
  const dataRoot = app.getPath('userData')
  const paths = resolveDesktopPaths(resourcesRoot, dataRoot)
  assertInstalledResources(paths)
  const distribution = await resolveDesktopDistribution(resourcesRoot)
  const { autoUpdater } = createRequire(import.meta.url)('electron-updater') as typeof import('electron-updater')
  const updateController = new DesktopUpdateController({
    updater: autoUpdater,
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    install: targetVersion => runUpdateInstallation({
      distribution,
      targetVersion,
      preparePortableCleanup: async (version) => {
        await preparePortableCleanup({
          portableRoot: dirname(process.execPath),
          resourcesRoot,
          dataRoot,
          currentPid: process.pid,
          targetVersion: version,
        })
      },
      beginQuit: () => { quitting = true },
      terminateHarness,
      destroyUi: destroyDesktopUi,
      quitAndInstall: () => { autoUpdater.quitAndInstall(false, true) },
    }),
  })
  disposeUpdateIpc = registerDesktopUpdateIpc({
    ipcMain,
    controller: updateController,
    windows: () => BrowserWindow.getAllWindows().map(window => window.webContents),
  })
  const port = await reserveLoopbackPort()
  const url = await startHarness(paths, port)
  const desktopWindow = createWindow(url)
  mainWindow = desktopWindow.window
  mainWindowLifecycle = desktopWindow.lifecycle
  tray = createTray(desktopWindow.lifecycle)
  if (distribution === 'installed') {
    await writeInstalledReceipt({
      dataRoot,
      version: app.getVersion(),
      executablePath: process.execPath,
    })
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    mainWindowLifecycle?.showWindow()
  })
  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    terminateHarness()
    destroyDesktopUi()
    app.quit()
  })
  void app.whenReady().then(boot).catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    dialog.showErrorBox('Oasisfish could not start', message)
    disposeUpdateIpc?.()
    disposeUpdateIpc = undefined
    terminateHarness()
    app.exit(1)
  })
}
