import { app, BrowserWindow, dialog, session } from 'electron'
import { join } from 'node:path'

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    title: 'MoeLoaderE',
    width: 1000,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    show: false,
    backgroundColor: '#f5f6f8',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.once('ready-to-show', () => window.show())

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devUrl) {
    await window.loadURL(devUrl)
  } else {
    await window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function showStartupError(error: unknown): void {
  dialog.showErrorBox('MoeLoaderE 启动失败', String(error))
  app.exit(1)
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  await createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow().catch(showStartupError)
    }
  })
}).catch(showStartupError)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
