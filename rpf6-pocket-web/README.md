# RPF6 Pocket Lab (PWA)

Web app/PWA untuk membaca dan mempatch **salinan RPF6 milik pengguna** langsung di browser iPhone.

## Privasi dan arsitektur

- Seluruh pemrosesan terjadi di perangkat lewat `File`, `Blob`, `DataView`, dan `File.slice()`.
- Tidak ada upload file, backend, telemetry, atau analytics.
- Header dan TOC dibaca terpisah agar penggunaan RAM lebih rendah pada iPhone 11.
- Salinan patched disusun sebagai komposisi `Blob`; arsip asli tidak diubah.

## Fitur

- Parser RPF6 big-endian.
- Daftar direktori/file, hash, path, offset, ukuran, resource, dan compressed flag.
- Pencarian dan filter.
- Import `names.txt` menggunakan lowercase JOAAT.
- Ekstrak entry raw.
- Replace raw jika ukuran pengganti tidak melebihi slot lama.
- PWA/offline cache.

## Batasan

- TOC terenkripsi ditolak; tidak ada kunci game atau bypass DRM.
- Tidak dapat mengakses data aplikasi/game lain karena sandbox iOS.
- Tidak melakukan dekompresi, encoding tekstur, atau rebuild penuh.
- Replacement harus sudah berformat internal benar dan berukuran sama/lebih kecil.
- Arsip besar masih membutuhkan ruang penyimpanan untuk file hasil.

## Menjalankan lokal

Karena service worker memerlukan HTTP/HTTPS, jalankan server statis:

```bash
python3 -m http.server 8080
```

Lalu buka `http://localhost:8080/rpf6-pocket-web/`.

## GitHub Pages

Workflow di `.github/workflows/rpf6-pocket-web-pages.yml` menerbitkan folder ini ke GitHub Pages setelah perubahan di-merge ke `main`. Pada pertama kali, buka **Settings → Pages → Source: GitHub Actions**.

## iPhone

1. Buka URL GitHub Pages melalui Safari.
2. Tekan tombol Bagikan.
3. Pilih **Tambahkan ke Layar Utama**.
4. Buka aplikasi dari Home Screen dan pilih salinan `.rpf` melalui Files.
