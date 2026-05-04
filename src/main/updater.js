'use strict'

const { autoUpdater } = require('electron-updater')
const log = require('electron-log/main')

/**
 * Kiosk PC'lerde sessiz güncelleme stratejisi:
 *   1. App ready → 30-180sn random aralıkta ilk kontrol (jitter; toplu boot dalgasını yayar)
 *   2. Sonra her 60 dakikada bir tekrar
 *   3. Yeni sürüm bulunursa arka planda indirilir
 *   4. İndirme tamamlanınca uygulama bir sonraki normal kapanışta otomatik kurulum yapar
 *      (autoInstallOnAppQuit = true). Operatör akışını kesmez.
 *
 * Update feed: kullanıcının kendi Laravel backend'inde host edilir
 *   {backendUrl}/api/terminal-updates/{channel}
 * X-Terminal-Token header'ı her isteğe eklenir — backend terminal middleware ile auth eder.
 *
 * Renderer tarafına IPC olayları forward edilir.
 */

const FIRST_CHECK_MIN_MS = 30 * 1000
const FIRST_CHECK_MAX_MS = 180 * 1000
const PERIODIC_INTERVAL_MS = 60 * 60 * 1000
const DEFAULT_CHANNEL = 'stable'

let initialized = false
let lastStatus = { state: 'idle' }
let periodicTimer = null

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

function buildFeedUrl(backendUrl, channel) {
  const trimmed = String(backendUrl || '').trim().replace(/\/+$/, '')
  if (!trimmed) return null
  return `${trimmed}/api/terminal-updates/${channel}`
}

/**
 * @param {object} opts
 * @param {boolean} opts.isDev
 * @param {function} opts.forwardToRenderer
 * @param {string}  opts.backendUrl    — kullanıcının setup'ta verdiği backend host
 * @param {string}  opts.terminalUuid  — terminal.json'daki UUID (X-Terminal-Token)
 * @param {string} [opts.channel]      — release kanalı (default: stable)
 */
function init(opts = {}) {
  if (initialized) return
  initialized = true

  const { isDev, forwardToRenderer, backendUrl, terminalUuid } = opts
  const channel = opts.channel || DEFAULT_CHANNEL

  if (isDev) {
    log.info('[updater] dev modda devre dışı')
    lastStatus = { state: 'disabled-dev' }
    return
  }

  if (!backendUrl || !terminalUuid) {
    log.warn('[updater] backendUrl veya terminalUuid eksik — updater devre dışı')
    lastStatus = { state: 'disabled-no-feed' }
    return
  }

  const feedUrl = buildFeedUrl(backendUrl, channel)
  if (!feedUrl) {
    log.warn('[updater] feed URL üretilemedi — updater devre dışı')
    lastStatus = { state: 'disabled-no-feed' }
    return
  }

  setupLogger()

  // Kiosk için kritik ayarlar
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false

  // Generic feed + terminal token header — package.json'daki placeholder'ı override eder
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: feedUrl,
    channel,
    useMultipleRangeRequest: false,
    requestHeaders: {
      'X-Terminal-Token': terminalUuid,
      'Accept': 'application/octet-stream, text/yaml, */*',
    },
  })
  log.info('[updater] feed:', feedUrl, 'channel:', channel)

  bindEvents(forwardToRenderer)

  // Jitter: 30-180 sn random — 50+ terminal aynı anda boot etse bile dalga ezilmez
  const initialDelay =
    FIRST_CHECK_MIN_MS + Math.floor(Math.random() * (FIRST_CHECK_MAX_MS - FIRST_CHECK_MIN_MS))
  log.info('[updater] ilk kontrol', Math.round(initialDelay / 1000), 'sn sonra')

  setTimeout(() => triggerCheck('initial'), initialDelay)
  periodicTimer = setInterval(() => triggerCheck('periodic'), PERIODIC_INTERVAL_MS)
}

function triggerCheck(reason = 'manual') {
  if (!initialized) return Promise.resolve(null)
  if (lastStatus.state === 'disabled-dev' || lastStatus.state === 'disabled-no-feed') {
    return Promise.resolve(null)
  }
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
