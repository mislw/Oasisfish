import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog } from 'electron'
import { buildHarnessEnvironment } from './environment.ts'
import { resolveDesktopPaths, type DesktopPaths } from './paths.ts'
import { reserveLoopbackPort, waitForServer } from './server.ts'

const startupTimeoutMs = 45_000
const maxLogBytes = 5 * 1024 * 1024
let mainWindow: BrowserWindow | undefined
let harnessProcess: ChildProcess | undefined
let quitting = false

function developmentResourcesRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'build-resources')
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

function createWindow(url: string): BrowserWindow {
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
  window.on('closed', () => {
    mainWindow = undefined
  })
  return window
}

async function boot(): Promise<void> {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error(`DeepSeek Harness Desktop supports Windows x64 only, received ${process.platform}-${process.arch}.`)
  }
  const resourcesRoot = process.env.DSH_DESKTOP_RESOURCES
    ?? (app.isPackaged ? process.resourcesPath : developmentResourcesRoot())
  const dataRoot = process.env.DSH_DESKTOP_USER_DATA ?? app.getPath('userData')
  const paths = resolveDesktopPaths(resourcesRoot, dataRoot)
  assertInstalledResources(paths)
  const port = await reserveLoopbackPort()
  const url = await startHarness(paths, port)
  mainWindow = createWindow(url)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    mainWindow?.restore()
    mainWindow?.focus()
  })
  app.on('window-all-closed', () => {
    app.quit()
  })
  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    terminateHarness()
    app.quit()
  })
  void app.whenReady().then(boot).catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    dialog.showErrorBox('DeepSeek Harness could not start', message)
    terminateHarness()
    app.exit(1)
  })
}
