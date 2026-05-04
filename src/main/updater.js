'use strict'

const { autoUpdater } = require('electron-updater')
const log = require('electron-log/main')
const { app } = require('electron')

/**
 * Kiosk PC'lerde sessiz güncelleme stratejisi:
 *   1. App ready → 30sn sonra ilk kontrol (boot trafiğini etkilemesin diye)
 *   2. Sonra her 60 dakikada bir tekrar
 *   3. Yeni sürüm bulunursa arka planda indirilir
 *   4. İndirme tamamlanınca uygulama bir sonraki normal kapanışta otomatik kurulum yapar
 *      (autoInstallOnAppQuit = true). Operatör akışını kesmez.
 *
 * Renderer tarafına IPC olayları forward edilir — frontend isterse küçük bir
 * "yeni sürüm hazır" rozeti gösterebilir (şu an opsiyonel).
 */

const FIRST_CHECK_DELAY_MS = 30 * 1000
const PERIODIC_INTERVAL_MS = 60 * 60 * 1000

let initialized = false
let lastStatus = { state: 'idle' }

function setupLogger() {
  log.transports.file.level = 'info'
  log.transports.console.level = 'info'
  autoUpdater.logger = log
}

function bindEvents(forwardToRenderer) {
  const emit = (state, payload = {}) => {
    lastStatus = { state, ...payload, ts: Date.now() }
    log.info('[updater]', state, payload)
    forwardToRenderer?.('terminal:update-status', lastStatus)
  }

  autoUpdater.on('checking-for-update', () => emit('checking'))
  autoUpdater.on('update-available', (info) =>
    emit('available', { version: info?.version, releaseDate: info?.releaseDate })
  )
  autoUpdater.on('update-not-available', (info) =>
    emit('up-to-date', { version: info?.version })
  )
  autoUpdater.on('download-progress', (p) =>
    emit('downloading', {
      percent: Math.round(p?.percent || 0),
      transferred: p?.transferred,
      total: p?.total,
    })
  )
  autoUpdater.on('update-downloaded', (info) =>
    emit('downloaded', { version: info?.version })
  )
  autoUpdater.on('error', (err) =>
    emit('error', { message: err?.message || String(err) })
  )
}

function init({ isDev, forwardToRenderer } = {}) {
  if (initialized) return
  initialized = true

  if (isDev) {
    log.info('[updater] dev modda devre dışı')
    lastStatus = { state: 'disabled-dev' }
    return
  }

  setupLogger()

  // Kiosk için kritik ayarlar
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false

  bindEvents(forwardToRenderer)

  // Boot trafiğini bozmasın diye geciktirilmiş ilk kontrol
  setTimeout(() => triggerCheck('initial'), FIRST_CHECK_DELAY_MS)
  setInterval(() => triggerCheck('periodic'), PERIODIC_INTERVAL_MS)
}

function triggerCheck(reason = 'manual') {
  if (!initialized) return Promise.resolve(null)
  log.info('[updater] check tetiklendi:', reason)
  return autoUpdater.checkForUpdates().catch((err) => {
    log.error('[updater] check hatası:', err?.message)
    return null
  })
}

function getStatus() {
  return lastStatus
}

/**
 * Manuel kurulum tetikleyici (admin destek IPC'si). Operatör akışında kullanılmaz —
 * normal kapanışta zaten autoInstallOnAppQuit devreye girer.
 */
function quitAndInstall() {
  if (!initialized) return
  if (lastStatus.state !== 'downloaded') {
    log.warn('[updater] quitAndInstall çağrıldı ama indirilmiş paket yok')
    return
  }
  log.info('[updater] quitAndInstall')
  autoUpdater.quitAndInstall(false, true)
}

module.exports = {
  init,
  triggerCheck,
  getStatus,
  quitAndInstall,
}
