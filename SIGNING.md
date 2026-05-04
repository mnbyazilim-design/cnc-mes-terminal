# Kod İmzalama (Code Signing)

> Bu doküman, terminal uygulamasını **Authenticode (Windows EV/OV) sertifikası** ile imzalamak için repo'da kurulu olan iskeleti açıklar. **Sertifika alındığında** GitHub Secrets'a iki değer eklemek dışında repo'da değişiklik yapmaya gerek yoktur.

---

## Neden imzalı build?

- **SmartScreen / Defender uyarıları kalkar** — operatör PC'sinde "bilinmeyen yayıncı" uyarısı çıkmaz.
- **electron-updater** kurulu sürümün imzasını yeni paketle karşılaştırır. İmzalı bir sürümden imzasız bir sürüme **downgrade** kabul edilmez. Bu yüzden imzalamaya geçildikten sonra tüm sonraki release'ler imzalı olmalıdır.
- Kurumsal ortamda WDAC / AppLocker beyaz listesine eklemek için imza zorunlu.

---

## Sertifika türü

| Tür   | SmartScreen | Maliyet | Saklama                  |
|-------|-------------|---------|--------------------------|
| **OV** (Organization Validation) | İlk birkaç yüz indirmede uyarır, "reputation" oluşturma süreci var | ~ $200/yıl | Yazılım anahtarı (.pfx) |
| **EV** (Extended Validation)     | Anında SmartScreen geçer | ~ $300+/yıl | HSM / USB token (Yubico FIPS, eToken) |

Önerilen: **EV** — saha PC'sinde tek seferlik kurulum, uyarısız geçer.

---

## Repo yapılandırması

`package.json` build bloğunda şu alanlar zaten tanımlı:

```json
"win": {
  "signingHashAlgorithms": ["sha256"],
  "signtoolOptions": {
    "signingHashAlgorithms": ["sha256"]
  }
}
```

electron-builder, build sırasında **iki ortam değişkeni** varsa `signtool.exe` ile otomatik imzalama yapar:

| Env var            | Değer                                                                |
|--------------------|----------------------------------------------------------------------|
| `CSC_LINK`         | `.pfx` dosyasının path'i, **https://** URL'si veya **base64** içeriği |
| `CSC_KEY_PASSWORD` | `.pfx` parolası                                                       |

Bu env değişkenleri yoksa build **sessizce imzasız** çıkar — geliştirme ve ilk dağıtım için sorunsuz. CI workflow'u (`.github/workflows/release.yml`) zaten her iki secret'ı da hazır okuyacak şekilde yapılandırılmış:

```yaml
env:
  CSC_LINK: ${{ secrets.CSC_LINK }}
  CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
```

---

## Sertifika alındığında yapılacaklar

### 1. .pfx dosyasını base64'e çevir

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\cert.pfx")) | Set-Clipboard
```

(Linux/macOS: `base64 -w0 cert.pfx | pbcopy`)

### 2. GitHub Secrets'a ekle

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

- `CSC_LINK` = base64 içeriği (yukarıda kopyaladığın)
- `CSC_KEY_PASSWORD` = .pfx parolası

### 3. Yeni tag at

```bash
git tag v0.2.0
git push origin v0.2.0
```

CI otomatik olarak imzalı build alır ve GitHub Release'e yayınlar.

### 4. Doğrulama

İndirilen `.exe`'yi sağ tık → **Properties → Digital Signatures**. "MNB Yazılım" sertifikası görünmeli, "OK" durumda olmalı.

```powershell
Get-AuthenticodeSignature "CNC-MES Terminal Setup 0.2.0.exe"
```

`Status: Valid` olmalı.

---

## EV (HSM/USB token) sertifikası ile imzalama

EV sertifikaları lokal makineden çıkartılamaz (HSM zorunlu). Bu durumda CI'da imzalama yapılamaz; iki seçenek var:

1. **Self-hosted runner** (HSM bağlı bir Windows makine) — runner'ı GitHub'a register edip CI workflow'da `runs-on: [self-hosted, windows]` kullan.
2. **Manuel imzalama** — CI imzasız build alır, lokal HSM bağlı PC'de `signtool sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /a "dist\*.exe"` çalıştırılır, dosyalar manuel olarak Release'e yüklenir.

Şu an OV ile başlamak en pratik yol; EV'ye geçince yukarıdaki self-hosted runner setup'ı yapılır.

---

## Sorun giderme

| Hata                                                  | Çözüm                                                         |
|-------------------------------------------------------|---------------------------------------------------------------|
| `Cannot find signtool.exe`                            | Windows SDK kurulu değil — CI'da windows-latest runner zaten içerir |
| `SignerSign failed (-2147024891 / 0x80070005)`        | .pfx parolası yanlış veya HSM kilitli                          |
| `Cannot find publish target`                          | `package.json` `build.publish` bloğunu kontrol et              |
| Updater "downgrade not allowed"                        | Yeni sürüm imzasız ya da farklı sertifika ile imzalanmış       |
