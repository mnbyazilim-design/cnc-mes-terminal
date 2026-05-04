'use strict'

const { app, BrowserWindow, ipcMain, shell, globalShortcut, Menu } = require('electron')
const path = require('node:path')
const os = require('node:os')

const config = require('./config')

const isDev = process.env.CNC_MES_DEV === '1'
const PRELOAD_PATH = path.join(__dirname, '..', 'preload', 'index.js')
const SETUP_HTML = path.join(__dirname, '..', 'renderer', 'setup', 'index.html')

let mainWindow = null

function createMainWindow() {
  const cfg = config.ensureConfig()

  mainWindow = new BrowserWindow({
    fullscreen: !isDev,
    kiosk: !isDev,
    frame: isDev,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    title: 'CNC-MES Terminal',
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  })

  Menu.setApplicationMenu(null)

  // Yeni pencereler harici tarayıcıya
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (config.isConfigured(cfg)) {
    loadFrontend(cfg.backendUrl)
  } else {
    loadSetup()
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Network hatası → 5sn sonra yeniden dene (sadece konfigüre edilmişse)
  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedUrl) => {
    if (validatedUrl && validatedUrl.startsWith('file://')) return // setup
    console.error('[main] yükleme hatası:', errorCode, errorDescription, validatedUrl)
    setTimeout(() => {
      const cfgNow = config.readConfig()
      if (cfgNow && cfgNow.backendUrl && mainWindow) {
        mainWindow.loadURL(cfgNow.backendUrl)
      }
    }, 5000)
  })
}

function loadFrontend(url) {
  if (!mainWindow) return
  mainWindow.loadURL(url).catch((err) => {
    console.error('[main] frontend URL yüklenemedi:', err.message)
  })
}

function loadSetup() {
  if (!mainWindow) return
  mainWindow.loadFile(SETUP_HTML).catch((err) => {
    console.error('[main] setup ekranı yüklenemedi:', err.message)
  })
}

// ---- IPC ----

ipcMain.handle('terminal:get-config', () => {
  return config.readConfig() || config.ensureConfig()
})

ipcMain.handle('terminal:save-config', (_event, patch) => {
  if (!patch || typeof patch !== 'object') {
    throw new Error('Geçersiz konfigürasyon.')
  }
  // Sadece izinli alanlar güncellenir
  const allowed = {}
  if (typeof patch.backendUrl === 'string') allowed.backendUrl = patch.backendUrl.trim()
  if (typeof patch.name === 'string') allowed.name = patch.name.trim()
  return config.updateConfig(allowed)
})

ipcMain.handle('terminal:get-info', () => {
  const cfg = config.readConfig() || {}
  return {
    uuid: cfg.uuid,
    name: cfg.name || null,
    appVersion: app.getVersion(),
    hostname: os.hostname(),
    platform: process.platform,
  }
})

ipcMain.handle('terminal:reload', () => {
  const cfg = config.readConfig()
  if (config.isConfigured(cfg)) {
    loadFrontend(cfg.backendUrl)
  } else {
    loadSetup()
  }
})

ipcMain.handle('terminal:relaunch', () => {
  app.relaunch()
  app.exit(0)
})

ipcMain.handle('terminal:quit', () => {
  app.exit(0)
})

// ---- App lifecycle ----

app.whenReady().then(() => {
  createMainWindow()

  // Geliştirici arka kapı — dev modda DevTools, üretimde de Ctrl+Shift+Alt+F12
  // (saha desteği için — kullanıcı kazara açamasın diye 4'lü kombinasyon)
  globalShortcut.register('Control+Shift+Alt+F12', () => {
    if (mainWindow) mainWindow.webContents.toggleDevTools()
  })
  globalShortcut.register('Control+Shift+Alt+R', () => {
    const cfg = config.readConfig()
    if (config.isConfigured(cfg) && mainWindow) {
      loadFrontend(cfg.backendUrl)
    }
  })
  globalShortcut.register('Control+Shift+Alt+S', () => {
    if (mainWindow) loadSetup()
  })
  if (isDev) {
    globalShortcut.register('F12', () => {
      if (mainWindow) mainWindow.webContents.toggleDevTools()
    })
  }
})

app.on('window-all-closed', () => {
  // Kiosk → kapatınca uygulama biter
  app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// Yalnız tek instance
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}
