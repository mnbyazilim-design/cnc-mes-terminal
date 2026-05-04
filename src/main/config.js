'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { app } = require('electron')

const CONFIG_FILENAME = 'terminal.json'
const SCHEMA_VERSION = 1

/**
 * userData içinde terminal.json:
 *   {
 *     "schemaVersion": 1,
 *     "uuid": "...",
 *     "backendUrl": "https://app.cnc-mes.com",
 *     "name": "TZG-12 Terminal",
 *     "createdAt": "...",
 *     "updatedAt": "..."
 *   }
 */

function getConfigPath() {
  return path.join(app.getPath('userData'), CONFIG_FILENAME)
}

function readConfig() {
  const file = getConfigPath()
  try {
    if (!fs.existsSync(file)) return null
    const raw = fs.readFileSync(file, 'utf-8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (err) {
    console.error('[config] terminal.json okunamadı:', err.message)
    return null
  }
}

function writeConfig(config) {
  const file = getConfigPath()
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const next = {
    schemaVersion: SCHEMA_VERSION,
    ...config,
    updatedAt: new Date().toISOString(),
  }
  fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf-8')
  return next
}

/**
 * UUID + temel alanlar yoksa oluşturur. backendUrl boş olabilir
 * (ilk açılışta setup ekranı doldurur). UUID asla değişmez.
 */
function ensureConfig() {
  const existing = readConfig()
  if (existing && existing.uuid) {
    // Şema upgrade yeri (ileride buradan)
    return existing
  }

  const fresh = {
    schemaVersion: SCHEMA_VERSION,
    uuid: crypto.randomUUID(),
    backendUrl: existing?.backendUrl || '',
    name: existing?.name || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  return writeConfig(fresh)
}

function updateConfig(patch) {
  const current = readConfig() || ensureConfig()
  return writeConfig({ ...current, ...patch })
}

function isConfigured(config) {
  return Boolean(config && config.uuid && config.backendUrl)
}

module.exports = {
  getConfigPath,
  readConfig,
  writeConfig,
  ensureConfig,
  updateConfig,
  isConfigured,
  SCHEMA_VERSION,
}
