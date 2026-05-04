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
  "schemaVersion": 2,
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "backendUrl": "https://mes.firma.com",
  "name": "TZG-12 Terminal",
  "autoLaunch": true,
  "createdAt": "2026-05-04T12:00:00.000Z",
  "updatedAt": "2026-05-04T12:00:00.000Z"
}
```

- `uuid` — cihaz boyunca değişmez. Sunucuda `terminals.uuid` ile eşleşir.
- `backendUrl` — yüklenecek frontend adresi. Sonu `/` olmadan.
- `name` — opsiyonel, admin paneli için tanıtıcı.
- `autoLaunch` — Windows boot'unda otomatik başlasın mı (default `true`). Setup ekranındaki checkbox ile değiştirilir.

> v1 → v2 geçişi otomatiktir; mevcut kurulumlarda `autoLaunch` ilk açılışta `true` olarak yazılır.

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
| `Ctrl + Shift + Alt + I`         | Hakkında / bilgi paneli (sürüm, UUID, güncelleme) |
| `Ctrl + Shift + Alt + Q`         | Uygulamayı kapat (kapatma engelini bypass eder) |
| `F12` *(dev modda)*              | DevTools                         |

Saha PC'sinde yetkisiz kişiler kazara çıkmasın diye 4'lü kombinasyon zorunlu.

### Üretim modunda engellenen kısayollar

Operatör kazara sayfayı kırmasın diye aşağıdakiler **üretim modunda** disabled:

- `Alt + F4`, `Ctrl + W` — pencere kapatma
- `F5`, `Ctrl + R`, `Ctrl + Shift + R` — yeniden yükleme
- `F12`, `Ctrl + Shift + I`, `Ctrl + Shift + J` — DevTools
- Ana pencere `close` event'i de `preventDefault` edilir; kapatma yalnız `terminal:quit` IPC veya 4'lü kombinasyon ile mümkündür.

Dev modda (`CNC_MES_DEV=1`) engelleme tamamen kapalıdır.

---

## Build (Windows)

```bash
npm run build:win
```

Çıktılar `dist/` altına gelir:
- `CNC-MES Terminal Setup x.y.z.exe` — NSIS kurulumu (per-machine, masaüstü kısayolu).
- `CNC-MES Terminal x.y.z.exe` — taşınabilir tek dosya.

### Otomatik release (CI)

`.github/workflows/release.yml` tag push ile tetiklenir:

```bash
npm version patch     # package.json'u 0.1.1'e bumpla + tag oluşturur
git push --follow-tags
```

GitHub Actions Windows runner otomatik olarak:
1. `npm ci` + `npm run release:win` çalıştırır
2. NSIS + portable EXE üretir
3. `latest.yml` ile birlikte GitHub Releases'e publish eder
4. Sahadaki kurulu terminaller `electron-updater` aracılığıyla yeni sürümü algılar, sessizce indirir, **bir sonraki kapanışta** otomatik kurar (operatör akışı kesilmez).

`workflow_dispatch` ile manuel tetikleyince publish edilmeden artifact üretilir.

### Kod imzalama

Sertifika alındığında detaylı rehber: [`SIGNING.md`](./SIGNING.md). Özetle GitHub Secrets'a `CSC_LINK` (.pfx base64) ve `CSC_KEY_PASSWORD` eklemek yeterli — CI workflow zaten okumaya hazır.

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
- ✅ **3b — Operasyonel:** Auto-launch (Windows başlangıç + setup checkbox), splash screen, offline retry ekranı (TR + geri sayım + auto-recover), tek-instance kilit, shortcut & kapatma engeli
- ✅ **3c — Bakım:** electron-updater (sessiz indirme + autoInstallOnAppQuit), GitHub Actions release pipeline, kod imzalama iskeleti (`SIGNING.md`)
