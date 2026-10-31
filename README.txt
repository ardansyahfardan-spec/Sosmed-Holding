# Social Media Hub V1 — Prototype

## Cara menjalankan
1. Ekstrak ZIP ini.
2. Buka folder `social_media_hub_v1`.
3. Klik dua kali `index.html` untuk membukanya di Chrome atau Edge.

## Isi V1
- Overview dashboard dengan angka simulasi.
- Form persiapan multi-upload untuk Facebook, TikTok, dan YouTube.
- Caption Manager berbasis template (belum AI sungguhan).
- Analytics per platform dan tabel ranking (data simulasi).
- Riwayat draft yang disimpan di browser dan dibatasi 7 hari.

## Batasan penting
Ini adalah prototype frontend, belum terhubung ke akun media sosial, API, AI lokal, atau sistem upload otomatis. File video tidak diunggah ke server/platform. Jangan masukkan password akun di prototype ini.

## Rencana berikutnya
V2: backend Python FastAPI, ekstraksi audio, Faster-Whisper, lalu integrasi model bahasa lokal untuk transkrip, terjemahan Jawa-Indonesia, dan draft caption.
Sebelum memilih ukuran model AI, pastikan model GPU RTX dan kapasitas VRAM (misalnya RTX 3050 6GB, RTX 3060 12GB, RTX 4060 8GB).
