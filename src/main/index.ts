import { app, BrowserWindow, dialog, protocol, screen, session } from 'electron'
import { join } from 'node:path'
import { installBrowser } from './browser'
import type { BrowserState } from '../shared/types'
import { installAppearance } from './appearance'

protocol.registerSchemesAsPrivileged([{ scheme: 'moe-image', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
let mainWindow: BrowserWindow | undefined
let uiState: BrowserState | undefined

function createWindow(previewKey?: string): BrowserWindow {
  const preview = previewKey !== undefined
  const parentBounds = mainWindow?.getBounds()
  const saved = !preview ? uiState?.bounds : undefined
  const area = saved ? screen.getDisplayMatching(saved).workArea : undefined
  const window = new BrowserWindow({
    title: preview ? '预览' : 'MoeLoaderE',
    width: preview ? Math.round((parentBounds?.width ?? 1060) * 0.85) : saved?.width ?? 1060,
    height: preview ? Math.round((parentBounds?.height ?? 760) * 0.85) : saved?.height ?? 760,
    x: saved && area ? Math.round(Math.min(Math.max(saved.x, area.x - saved.width + 40), area.x + area.width - 40)) : undefined,
    y: saved && area ? Math.round(Math.min(Math.max(saved.y, area.y - saved.height + 40), area.y + area.height - 40)) : undefined,
    minWidth: preview ? 400 : 700,
    minHeight: preview ? 300 : 400,
    parent: preview ? mainWindow : undefined,
    show: false,
    backgroundColor: '#00000000',
    transparent: process.platform === 'win32',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? false : { color: '#00000000', symbolColor: '#000000', height: 30 },
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })
  installAppearance(window)

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.once('ready-to-show', () => window.show())
  if (!preview) window.on('close', () => { if (uiState) uiState.bounds = window.getNormalBounds() })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  const hash = preview ? `preview=${previewKey}` : ''
  const loading = !app.isPackaged && devUrl
    ? window.loadURL(`${devUrl}${hash ? `#${hash}` : ''}`)
    : window.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  void loading.catch(showStartupError)
  return window
}

function showStartupError(error: unknown): void {
  dialog.showErrorBox('MoeLoaderE 启动失败', String(error))
  app.exit(1)
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  uiState = installBrowser(() => mainWindow, key => createWindow(key))
  mainWindow = createWindow()
  mainWindow.on('closed', () => { mainWindow = undefined })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
      mainWindow.on('closed', () => { mainWindow = undefined })
    }
  })
}).catch(showStartupError)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
