'use strict'

const { app, BrowserWindow, ipcMain, shell, globalShortcut, Menu } = require('electron')
const path = require('node:path')
const os = require('node:os')

const config = require('./config')
const updater = require('./updater')

const isDev = process.env.CNC_MES_DEV === '1'
const PRELOAD_PATH = path.join(__dirname, '..', 'preload', 'index.js')
const SETUP_HTML = path.join(__dirname, '..', 'renderer', 'setup', 'index.html')
const SPLASH_HTML = path.join(__dirname, '..', 'renderer', 'splash', 'index.html')
const OFFLINE_HTML = path.join(__dirname, '..', 'renderer', 'offline', 'index.html')
const ABOUT_HTML = path.join(__dirname, '..', 'renderer', 'about', 'index.html')

const SPLASH_FALLBACK_MS = 12000
const OFFLINE_AUTO_RETRY_MS = 10000

let mainWindow = null
let splashWindow = null
let aboutWindow = null
let allowQuit = false
let currentView = 'splash' // 'splash' | 'setup' | 'frontend' | 'offline'
let pendingRetryTimer = null

// ---- Auto-launch ----

function applyAutoLaunch(enabled) {
  if (isDev) return
  if (process.platform !== 'win32' && process.platform !== 'darwin') return
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      openAsHidden: false,
      // Windows'ta installer içinden başlatıldığında exe yolu otomatik yakalanır
    })
  } catch (err) {
    console.error('[main] auto-launch ayarlanamadı:', err.message)
  }
}

function syncAutoLaunchFromConfig() {
  const cfg = config.readConfig()
  applyAutoLaunch(cfg?.autoLaunch !== false)
}

// ---- Splash ----

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 380,
    height: 320,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  splashWindow.loadFile(SPLASH_HTML).catch(() => {})
  splashWindow.once('ready-to-show', () => {
    if (splashWindow) splashWindow.show()
  })
  splashWindow.on('closed', () => {
    splashWindow = null
  })

  // Güvenlik: ana pencere hiç gelmezse bile asılı kalmasın
  setTimeout(() => closeSplash(), SPLASH_FALLBACK_MS)
}

function closeSplash() {
  if (!splashWindow) return
  try {
    splashWindow.destroy()
  } catch (_e) {
    // pencere zaten kapanmış olabilir
  }
  splashWindow = null
}

// ---- Main window ----

function createMainWindow() {
  const cfg = config.ensureConfig()

  mainWindow = new BrowserWindow({
    fullscreen: !isDev,
    kiosk: !isDev,
    frame: isDev,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    title: 'CNC-MES Terminal',
    show: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  })

  Menu.setApplicationMenu(null)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Üretim modu: kapatma engeli — sadece allowQuit set edildiğinde gerçekten kapanır
  mainWindow.on('close', (event) => {
    if (!isDev && !allowQuit) {
      event.preventDefault()
    }
  })

  // Üretim modu: tehlikeli kısayolları engelle
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (isDev) return
    if (input.type !== 'keyDown') return
    const key = (input.key || '').toLowerCase()
    const blocked =
      // Reload / hard reload
      key === 'f5' ||
      (input.control && key === 'r') ||
      (input.control && input.shift && key === 'r') ||
      // DevTools
      (input.control && input.shift && key === 'i') ||
      (input.control && input.shift && key === 'j') ||
      (key === 'f12' && !(input.control && input.shift && input.alt)) ||
      // Pencere kapatma
      (input.alt && key === 'f4') ||
      (input.control && key === 'w')
    if (blocked) event.preventDefault()
  })

  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (!isMainFrame) return
    if (validatedUrl && validatedUrl.startsWith('file://')) return // setup / offline / splash

    // Yüklenmesi iptal edilen istekler için (-3 ABORTED) offline'a düşme
    if (errorCode === -3) return

    console.error('[main] frontend yüklenemedi:', errorCode, errorDescription, validatedUrl)
    showOffline({ url: validatedUrl, code: errorCode, desc: errorDescription })
  })

  // Frontend ilk render olduğunda splash'i kapat
  mainWindow.webContents.on('did-finish-load', () => {
    if (currentView === 'frontend' || currentView === 'setup') {
      closeSplash()
      revealMainWindow()
    }
  })

  if (config.isConfigured(cfg)) {
    loadFrontend(cfg.backendUrl)
  } else {
    loadSetup()
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function revealMainWindow() {
  if (!mainWindow) return
  if (!mainWindow.isVisible()) {
    mainWindow.show()
    mainWindow.focus()
  }
}

function clearPendingRetry() {
  if (pendingRetryTimer) {
    clearTimeout(pendingRetryTimer)
    pendingRetryTimer = null
  }
}

function loadFrontend(url) {
  if (!mainWindow) return
  clearPendingRetry()
  currentView = 'frontend'
  mainWindow.loadURL(url).catch((err) => {
    console.error('[main] frontend URL yüklenemedi:', err.message)
  })
}

function loadSetup() {
  if (!mainWindow) return
  clearPendingRetry()
  currentView = 'setup'
  mainWindow.loadFile(SETUP_HTML).catch((err) => {
    console.error('[main] setup ekranı yüklenemedi:', err.message)
  })
}

function showOffline({ url, code, desc }) {
  if (!mainWindow) return
  clearPendingRetry()
  currentView = 'offline'
  const params = new URLSearchParams()
  if (url) params.set('url', url)
  if (code !== undefined && code !== null) params.set('code', String(code))
  if (desc) params.set('desc', desc)
  mainWindow
    .loadFile(OFFLINE_HTML, { search: params.toString() })
    .then(() => {
      closeSplash()
      revealMainWindow()
      // Yedek otomatik retry — offline.js zaten dener, bu yalnızca renderer hata verirse devreye girer
      pendingRetryTimer = setTimeout(() => {
        const cfg = config.readConfig()
        if (cfg && cfg.backendUrl && currentView === 'offline') {
          loadFrontend(cfg.backendUrl)
        }
      }, OFFLINE_AUTO_RETRY_MS + 2000)
    })
    .catch((err) => console.error('[main] offline ekranı yüklenemedi:', err.message))
}

// ---- IPC ----

ipcMain.handle('terminal:get-config', () => {
  return config.readConfig() || config.ensureConfig()
})

ipcMain.handle('terminal:save-config', (_event, patch) => {
  if (!patch || typeof patch !== 'object') {
    throw new Error('Geçersiz konfigürasyon.')
  }
  const allowed = {}
  if (typeof patch.backendUrl === 'string') allowed.backendUrl = patch.backendUrl.trim()
  if (typeof patch.name === 'string') allowed.name = patch.name.trim()
  if (typeof patch.autoLaunch === 'boolean') allowed.autoLaunch = patch.autoLaunch
  const next = config.updateConfig(allowed)
  if (Object.prototype.hasOwnProperty.call(allowed, 'autoLaunch')) {
    applyAutoLaunch(next.autoLaunch !== false)
  }
  return next
})

ipcMain.handle('terminal:get-info', () => {
  const cfg = config.readConfig() || {}
  return {
    uuid: cfg.uuid,
    name: cfg.name || null,
    autoLaunch: cfg.autoLaunch !== false,
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

ipcMain.handle('terminal:open-setup', () => {
  loadSetup()
})

ipcMain.handle('terminal:relaunch', () => {
  allowQuit = true
  app.relaunch()
  app.exit(0)
})

ipcMain.handle('terminal:quit', () => {
  allowQuit = true
  app.exit(0)
})

// ---- About IPC ----

ipcMain.handle('terminal:open-about', () => openAboutWindow())
ipcMain.handle('terminal:close-about', () => closeAboutWindow())

// ---- Updater IPC ----

ipcMain.handle('terminal:check-updates', () => updater.triggerCheck('manual'))
ipcMain.handle('terminal:update-status', () => updater.getStatus())
ipcMain.handle('terminal:install-update', () => {
  allowQuit = true
  updater.quitAndInstall()
})

function broadcastToRenderer(channel, payload) {
  for (const win of [mainWindow, aboutWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

// ---- About window ----

function openAboutWindow() {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.focus()
    return
  }

  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined

  aboutWindow = new BrowserWindow({
    width: 520,
    height: 640,
    parent,
    modal: Boolean(parent),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    autoHideMenuBar: true,
    title: 'CNC-MES Terminal — Hakkında',
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  aboutWindow.loadFile(ABOUT_HTML).catch((err) => {
    console.error('[main] about ekranı yüklenemedi:', err.message)
  })

  aboutWindow.once('ready-to-show', () => {
    if (aboutWindow) aboutWindow.show()
  })

  aboutWindow.on('closed', () => {
    aboutWindow = null
  })
}

function closeAboutWindow() {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.close()
  }
  aboutWindow = null
}

// ---- App lifecycle ----

// Tek instance kilidi — diğer her şeyden önce
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.exit(0)
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    syncAutoLaunchFromConfig()
    const cfg = config.ensureConfig()
    updater.init({
      isDev,
      forwardToRenderer: broadcastToRenderer,
      backendUrl: cfg?.backendUrl,
      terminalUuid: cfg?.uuid,
    })
    createSplash()
    createMainWindow()

    // Saha desteği için 4'lü kombinasyon kısayolları (yetkisiz kullanıcı kazara açamaz)
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
    globalShortcut.register('Control+Shift+Alt+Q', () => {
      allowQuit = true
      app.exit(0)
    })
    globalShortcut.register('Control+Shift+Alt+I', () => {
      openAboutWindow()
    })
    if (isDev) {
      globalShortcut.register('F12', () => {
        if (mainWindow) mainWindow.webContents.toggleDevTools()
      })
    }
  })
}

app.on('before-quit', () => {
  // Uygulama gerçekten kapanıyorsa close engeli devre dışı kalsın
  allowQuit = true
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
