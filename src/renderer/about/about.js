'use strict'

const $ = (id) => document.getElementById(id)

const STATUS_LABEL = {
  idle: ['Bekliyor', 'Henüz kontrol yapılmadı.'],
  checking: ['Kontrol ediliyor', 'Sunucudan en son sürüm sorgulanıyor…'],
  available: ['Yeni sürüm var', 'Arka planda indiriliyor.'],
  downloading: ['İndiriliyor', 'Yeni sürüm indiriliyor.'],
  downloaded: ['İndirildi', 'Yeni sürüm hazır. Yükle ve yeniden başlat.'],
  'up-to-date': ['Güncel', 'Mevcut sürüm en güncel sürümdür.'],
  error: ['Hata', 'Güncelleme sırasında bir hata oluştu.'],
  'disabled-dev': ['Devre dışı (dev)', 'Geliştirme modunda otomatik güncelleme kapalıdır.'],
}

function renderStatus(status) {
  const state = status?.state || 'idle'
  const [label, defaultDetail] = STATUS_LABEL[state] || STATUS_LABEL.idle
  const badge = $('update-badge')
  badge.textContent = label
  badge.className = 'badge ' + state

  let detail = defaultDetail
  if (state === 'available' && status.version) {
    detail = `Yeni sürüm: v${status.version} — arka planda indiriliyor.`
  }
  if (state === 'downloading' && typeof status.percent === 'number') {
    detail = `%${status.percent} indirildi…`
  }
  if (state === 'downloaded' && status.version) {
    detail = `v${status.version} hazır. "Yükle ve yeniden başlat" ile uygulanır.`
  }
  if (state === 'up-to-date' && status.version) {
    detail = `v${status.version} en güncel sürüm.`
  }
  if (state === 'error' && status.message) {
    detail = status.message
  }
  $('update-detail').textContent = detail

  // Install butonu sadece downloaded durumunda aktif
  $('install-update').disabled = state !== 'downloaded'

  // Check butonu çalışan bir kontrol sırasında pasif
  const checkBtn = $('check-updates')
  if (state === 'checking' || state === 'downloading') {
    checkBtn.disabled = true
  } else {
    checkBtn.disabled = false
  }
}

async function loadInfo() {
  if (!window.cncMesTerminal) {
    $('update-detail').textContent = 'Electron köprüsü yüklenmedi.'
    return
  }
  try {
    const info = await window.cncMesTerminal.getInfo()
    $('version').textContent = info.appVersion ? `v${info.appVersion}` : '—'
    $('name').textContent = info.name || 'Atanmamış'
    $('uuid').textContent = info.uuid || '—'
    $('hostname').textContent = info.hostname || '—'
    $('platform').textContent = info.platform || '—'
    $('autoLaunch').textContent = info.autoLaunch ? 'Açık' : 'Kapalı'
  } catch (err) {
    console.error('getInfo hatası:', err)
  }

  try {
    const status = await window.cncMesTerminal.getUpdateStatus()
    renderStatus(status)
  } catch (err) {
    console.error('getUpdateStatus hatası:', err)
  }

  // Canlı dinle
  if (window.cncMesTerminal.onUpdateStatus) {
    window.cncMesTerminal.onUpdateStatus(renderStatus)
  }
}

function closeWindow() {
  if (window.cncMesTerminal?.closeAbout) {
    window.cncMesTerminal.closeAbout()
  } else {
    window.close()
  }
}

document.addEventListener('DOMContentLoaded', loadInfo)

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeWindow()
})

$('close').addEventListener('click', closeWindow)

$('check-updates').addEventListener('click', async () => {
  const btn = $('check-updates')
  btn.disabled = true
  try {
    await window.cncMesTerminal.checkForUpdates()
  } catch (err) {
    $('update-detail').textContent = 'Kontrol başarısız: ' + (err?.message || err)
    btn.disabled = false
  }
})

$('install-update').addEventListener('click', async () => {
  if (!confirm('Uygulama yeniden başlatılarak yeni sürüm yüklenecek. Devam edilsin mi?')) return
  await window.cncMesTerminal.installUpdate()
})

$('setup').addEventListener('click', async () => {
  await window.cncMesTerminal.openSetup()
  closeWindow()
})

$('relaunch').addEventListener('click', async () => {
  if (!confirm('Uygulama kapatılıp yeniden açılacak. Devam edilsin mi?')) return
  await window.cncMesTerminal.relaunch()
})
