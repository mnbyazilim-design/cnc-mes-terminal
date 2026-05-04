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

  /** Setup ekranı — backendUrl/name kaydet. */
  saveConfig: (patch) => ipcRenderer.invoke('terminal:save-config', patch),

  /** Mevcut config'e göre frontend'i yeniden yükle. */
  reload: () => ipcRenderer.invoke('terminal:reload'),

  /** Uygulamayı tamamen yeniden başlat. */
  relaunch: () => ipcRenderer.invoke('terminal:relaunch'),

  /** Kapat. */
  quit: () => ipcRenderer.invoke('terminal:quit'),

  /** Kabuk kimliği — frontend feature-detect için. */
  isElectronShell: true,
  shellVersion: process.env.npm_package_version || null,
})
