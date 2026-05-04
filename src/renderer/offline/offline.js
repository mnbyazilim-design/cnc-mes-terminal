'use strict'

const RETRY_SECONDS = 10

const params = new URLSearchParams(window.location.search)
const backendUrl = params.get('url') || ''
const errorCode = params.get('code') || ''
const errorDesc = params.get('desc') || ''

const $ = (id) => document.getElementById(id)
$('backend-url').textContent = backendUrl || '—'
$('error-code').textContent = errorCode || '—'
if (errorDesc) {
  $('error-desc').textContent = errorDesc
} else {
  $('error-desc-row').hidden = true
}
$('last-try').textContent = new Date().toLocaleTimeString('tr-TR')

let secondsLeft = RETRY_SECONDS
let retrying = false
const text = $('countdown-text')
const fill = $('bar-fill')
const retryBtn = $('retry')
const setupBtn = $('setup')

function tick() {
  if (retrying) return
  if (secondsLeft <= 0) {
    triggerRetry()
    return
  }
  text.textContent = `${secondsLeft} saniye sonra tekrar deneniyor…`
  fill.style.width = `${(secondsLeft / RETRY_SECONDS) * 100}%`
  secondsLeft -= 1
}

async function triggerRetry() {
  if (retrying) return
  retrying = true
  text.textContent = 'Yeniden bağlanıyor…'
  retryBtn.disabled = true
  retryBtn.textContent = 'Yeniden bağlanıyor…'
  fill.style.width = '0%'
  try {
    if (window.cncMesTerminal?.reload) {
      await window.cncMesTerminal.reload()
    }
  } catch (err) {
    retrying = false
    retryBtn.disabled = false
    retryBtn.textContent = 'Şimdi tekrar dene'
    text.textContent = 'Tekrar denenemedi: ' + (err?.message || 'bilinmeyen hata')
    secondsLeft = RETRY_SECONDS
  }
}

retryBtn.addEventListener('click', () => {
  secondsLeft = 0
  triggerRetry()
})

setupBtn.addEventListener('click', () => {
  if (window.cncMesTerminal?.openSetup) {
    window.cncMesTerminal.openSetup()
  }
})

tick()
setInterval(tick, 1000)

// Online olunca anında dene
window.addEventListener('online', () => {
  if (!retrying) {
    secondsLeft = 0
    triggerRetry()
  }
})
