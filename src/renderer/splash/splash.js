'use strict'

if (window.cncMesTerminal?.getInfo) {
  window.cncMesTerminal
    .getInfo()
    .then((info) => {
      const v = document.getElementById('version')
      if (v && info?.appVersion) v.textContent = `v${info.appVersion}`
    })
    .catch(() => {})
}
