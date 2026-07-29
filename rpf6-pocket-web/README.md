# RPF6 Enhanced Lab (PWA)

Workspace iPhone-first untuk inspeksi, diagnosis, patch raw yang aman, dan perencanaan **RDR Mobile Enhancement**. Semua pemrosesan berlangsung lokal di perangkat.

## Prinsip keselamatan

- Tidak ada upload, backend, telemetry, atau analytics.
- Tidak menyertakan kunci game, dekripsi, bypass DRM, jailbreak, exploit, atau akses ke container aplikasi lain.
- Arsip asli tidak pernah ditimpa; patch selalu diunduh sebagai salinan baru.
- File dengan TOC terenkripsi tetap dapat didiagnosis tanpa menafsirkan data terenkripsi sebagai entry.

## Fitur v2

### Archive Diagnostics

- Membaca header RPF6 big-endian.
- Menampilkan entry count, debug offset, encryption flag, ukuran TOC yang diharapkan, dan entropy sampel.
- Membuat fingerprint SHA-256 dari header, sampel TOC, tail, dan ukuran file.
- Ekspor laporan diagnostik JSON.
- Hex preview kecil tanpa membaca seluruh arsip ke RAM.

### Archive Browser — RPF6 tanpa enkripsi

- Struktur direktori/file, hash, path, offset, ukuran, resource type, compression, dan extended flags.
- Deteksi entry out-of-bounds.
- Import `names.txt` menggunakan lowercase JOAAT.
- Pencarian, filter, pagination, ekstraksi raw, dan patch slot berukuran sama/lebih kecil.
- Patch mempertahankan reserved bits pada field ukuran dan tidak mengalokasikan padding besar.

### Enhancement Studio

- Profil `iPhone 11 Balanced`, `Detail+`, dan `Cinematic`.
- Blueprint untuk texture, lighting, shader/material, environment, dan performance.
- Ekspor/impor project JSON yang dapat dipakai sebagai catatan riset dan input adapter mendatang.
- Status modular pipeline untuk archive rebuilder, texture adapter, lighting adapter, dan shader metadata adapter.

## Struktur

```text
rpf6-pocket-web/
├── app.js
├── index.html
├── styles.css
├── sw.js
├── manifest.webmanifest
├── modules/
│   ├── constants.js
│   ├── diagnostics.js
│   ├── format.js
│   ├── hash.js
│   ├── profiles.js
│   ├── project.js
│   └── rpf6.js
└── tests/
    ├── diagnostics.test.mjs
    ├── helpers.mjs
    ├── project.test.mjs
    └── rpf6.test.mjs
```

## Roadmap teknis

1. **Full Archive Rebuilder** untuk payload yang lebih besar, alignment, relayout offset, dan validasi hasil.
2. **Resource Fingerprinting** untuk mengelompokkan candidate texture, material, config, LUT, timecycle, dan shader metadata.
3. **Texture Adapter**: preview mipmap, ekspor/import, encode, dan size budget.
4. **Lighting Adapter**: exposure, ambient, shadow, fog, weather, LUT, atau timecycle bila format sah ditemukan.
5. **Shader Metadata Adapter**: inventaris material dan parameter yang dapat diedit tanpa injeksi kode aplikasi.
6. **iPhone 11 Validator**: budget memori, pertumbuhan arsip, thermal risk, mipmap, dan target 30 FPS.

## Menjalankan lokal

```bash
cd rpf6-pocket-web
python3 -m http.server 8080
```

Buka `http://localhost:8080/`.

## Pengujian

Memerlukan Node.js 20 atau lebih baru.

```bash
cd rpf6-pocket-web
npm run check
npm test
```

## GitHub Pages

Workflow Pages menerbitkan folder `rpf6-pocket-web` dari branch `main`. Cache service worker diberi versi berdasarkan commit deployment agar pembaruan tidak tertahan cache lama.
