'use strict'

const $ = (id) => document.getElementById(id)
const errorEl = $('error')
const submitBtn = $('submit')
const form = $('setup-form')

function showError(msg) {
  errorEl.textContent = msg
  errorEl.hidden = false
}
function clearError() {
  errorEl.textContent = ''
  errorEl.hidden = true
}

function isValidUrl(value) {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

async function loadInfo() {
  if (!window.cncMesTerminal) {
    showError('Electron köprüsü yüklenmedi. Uygulamayı yeniden başlatın.')
    submitBtn.disabled = true
    return
  }
  try {
    const [info, cfg] = await Promise.all([
      window.cncMesTerminal.getInfo(),
      window.cncMesTerminal.getConfig(),
    ])
    $('uuid').textContent = info.uuid || '—'
    $('hostname').textContent = info.hostname || '—'
    $('version').textContent = info.appVersion || '—'

    if (cfg?.backendUrl) $('backendUrl').value = cfg.backendUrl
    if (cfg?.name) $('name').value = cfg.name
    // autoLaunch default true; sadece açıkça false ise işaretle kaldır
    $('autoLaunch').checked = cfg?.autoLaunch !== false
  } catch (err) {
    showError('Bilgiler okunamadı: ' + err.message)
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  clearError()

  const backendUrl = $('backendUrl').value.trim().replace(/\/+$/, '')
  const name = $('name').value.trim()
  const autoLaunch = $('autoLaunch').checked

  if (!backendUrl) {
    showError('Sunucu adresi zorunludur.')
    return
  }
  if (!isValidUrl(backendUrl)) {
    showError('Geçerli bir URL girin (https://... veya http://...).')
    return
  }

  submitBtn.disabled = true
  submitBtn.textContent = 'Kaydediliyor…'

  try {
    await window.cncMesTerminal.saveConfig({ backendUrl, name, autoLaunch })
    submitBtn.textContent = 'Yeniden başlatılıyor…'
    await window.cncMesTerminal.relaunch()
  } catch (err) {
    showError('Kayıt başarısız: ' + err.message)
    submitBtn.disabled = false
    submitBtn.textContent = 'Kaydet ve Bağlan'
  }
})

$('quit').addEventListener('click', () => {
  if (window.cncMesTerminal) window.cncMesTerminal.quit()
})

document.addEventListener('DOMContentLoaded', loadInfo)
