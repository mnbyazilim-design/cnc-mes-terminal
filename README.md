# CNC-MES Terminal

CNC-MES'in operatör ekranını **kiosk modda** çalıştıran Electron tabanlı endüstriyel terminal kabuğu.
Her CNC tezgahının yanında bulunan dokunmatik PC'ye kurulur. Cihaz kalıcı bir UUID üretir,
sunucudaki MES yöneticisi bu UUID'yi ilgili tezgaha eşledikten sonra cihaz otomatik olarak
o tezgahın operatör ekranını açar.

> Bu repo `cnc-mes` ana frontend/backend monorepo'sundan **bağımsız** çalışır.

---

## Mimari

```
┌──────────────────────────┐         ┌────────────────────────┐
│  Electron Main Process   │  IPC →  │  Preload (contextBridge)│
│  - kiosk BrowserWindow   │         │  window.cncMesTerminal  │
│  - terminal.json yönetimi│         │   • getInfo()           │
│  - URL yönlendirme       │         │   • getConfig()         │
│  - kısayollar            │         │   • saveConfig()        │
└──────────────────────────┘         │   • reload/relaunch     │
                                     └────────────────────────┘
                                              │
                                              ▼
                                     ┌────────────────────────┐
                                     │  CNC-MES Frontend       │
                                     │  (uzak URL — backendUrl)│
                                     │  terminalStore Electron │
                                     │  UUID'yi ezerek alır    │
                                     └────────────────────────┘
```

İlk açılışta cihaz `terminal.json` dosyasını okur:
- Yoksa veya `backendUrl` eksikse **kurulum ekranı** (local HTML) gösterilir.
- Doluysa `backendUrl` doğrudan kiosk modda yüklenir.

---

## terminal.json

Konum (Windows): `%APPDATA%/CNC-MES Terminal/terminal.json`

```json
{
  "schemaVersion": 1,
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "backendUrl": "https://mes.firma.com",
  "name": "TZG-12 Terminal",
  "createdAt": "2026-05-04T12:00:00.000Z",
  "updatedAt": "2026-05-04T12:00:00.000Z"
}
```

- `uuid` — cihaz boyunca değişmez. Sunucuda `terminals.uuid` ile eşleşir.
- `backendUrl` — yüklenecek frontend adresi. Sonu `/` olmadan.
- `name` — opsiyonel, admin paneli için tanıtıcı.

---

## Geliştirme

```bash
cd cnc-mes-terminal
npm install

# CNC_MES_DEV=1 — fullscreen kapalı, frame açık, F12 = DevTools
npm run dev
```

Frontend'i lokal Vite sunucusunda çalıştırırken kurulum ekranında `http://localhost:5173`
gibi bir URL girin (sondaki / olmadan).

### Kısayollar (saha desteği)

| Kombinasyon                      | İşlev                            |
|----------------------------------|----------------------------------|
| `Ctrl + Shift + Alt + F12`       | DevTools aç/kapa                 |
| `Ctrl + Shift + Alt + R`         | Frontend'i yeniden yükle         |
| `Ctrl + Shift + Alt + S`         | Setup ekranını aç (URL değiştir) |
| `F12` *(dev modda)*              | DevTools                         |

Saha PC'sinde yetkisiz kişiler kazara çıkmasın diye 4'lü kombinasyon zorunlu.

---

## Build (Windows)

```bash
npm run build:win
```

Çıktılar `dist/` altına gelir:
- `CNC-MES Terminal Setup x.y.z.exe` — NSIS kurulumu (per-machine, masaüstü kısayolu).
- `CNC-MES Terminal x.y.z.exe` — taşınabilir tek dosya.

---

## Frontend Entegrasyonu

Frontend `terminalStore` (`frontend/src/store/terminalStore.js`) Electron köprüsünü algılar:

```js
if (window.cncMesTerminal?.isElectronShell) {
  const { uuid } = await window.cncMesTerminal.getInfo()
  // store.uuid native UUID ile ezilir; localStorage'dan bağımsız.
}
```

Bu sayede tarayıcı cache'i temizlense bile cihaz aynı UUID ile bağlanmaya devam eder.

---

## Faz 3 Yol Haritası

- ✅ **3a — Temel:** Electron kabuk, terminal.json, kiosk window, preload IPC, setup ekranı, frontend bridge
- ⏳ **3b — Operasyonel:** Auto-launch (Windows başlangıç), splash screen, offline retry ekranı, tek-instance kilit (✓), shortcut güçlendirme
- ⏳ **3c — Bakım:** electron-updater + GitHub Releases auto-update, build pipeline (CI), kod imzalama
