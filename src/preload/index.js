'use strict'

const { contextBridge, ipcRenderer } = require('electron')

/**
 * Frontend tarafına `window.cncMesTerminal` olarak expose edilir.
 * Operatör akışında frontend `terminalStore`, bu varsa UUID'yi
 * localStorage yerine buradan okur ve böylece tüm cihazlarda kalıcı
 * tek bir UUID kullanılır (tarayıcı temizliğinden bağımsız).
 */
contextBridge.exposeInMainWorld('cncMesTerminal', {
  /** Senkron-benzeri kullanılabilen Promise. UUID + meta. */
  getInfo: () => ipcRenderer.invoke('terminal:get-info'),

  /** Tam config — backendUrl dahil. Setup ekranı için. */
  getConfig: () => ipcRenderer.invoke('terminal:get-config'),

  /** Setup ekranı — backendUrl/name/autoLaunch kaydet. */
  saveConfig: (patch) => ipcRenderer.invoke('terminal:save-config', patch),

  /** Mevcut config'e göre frontend'i yeniden yükle. */
  reload: () => ipcRenderer.invoke('terminal:reload'),

  /** Offline ekranından setup'a dön. */
  openSetup: () => ipcRenderer.invoke('terminal:open-setup'),

  /** Uygulamayı tamamen yeniden başlat. */
  relaunch: () => ipcRenderer.invoke('terminal:relaunch'),

  /** Kapat (yalnız destek IPC'si — kapatma engelini bypass eder). */
  quit: () => ipcRenderer.invoke('terminal:quit'),

  /** Updater — opsiyonel. Frontend isterse "yeni sürüm hazır" rozeti gösterebilir. */
  checkForUpdates: () => ipcRenderer.invoke('terminal:check-updates'),
  getUpdateStatus: () => ipcRenderer.invoke('terminal:update-status'),
  installUpdate: () => ipcRenderer.invoke('terminal:install-update'),
  onUpdateStatus: (handler) => {
    if (typeof handler !== 'function') return () => {}
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('terminal:update-status', listener)
    return () => ipcRenderer.removeListener('terminal:update-status', listener)
  },

  /** Kabuk kimliği — frontend feature-detect için. */
  isElectronShell: true,
  shellVersion: process.env.npm_package_version || null,
})
