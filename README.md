# Ghoustory Control Room

## Mengaktifkan Gemini AI (wajib satu kali)

Website memakai GitHub Pages dan menyimpan data aplikasi di Supabase. API Key Gemini **jangan** dimasukkan ke `index.html`, GitHub Pages, atau dibagikan di chat. Kunci disimpan sebagai Supabase Edge Function Secret.

### 1. Pasang secret Gemini di Supabase
1. Buka Supabase Dashboard project Ghoustory.
2. Masuk ke **Edge Functions → Secrets**.
3. Tambahkan secret dengan nama persis `GEMINI_API_KEY`.
4. Isi value dengan API key Gemini dari Google AI Studio, lalu simpan.

> Langganan Google AI Pro dan Gemini API adalah layanan/penagihan yang berbeda. Pastikan API key Google AI Studio aktif dan memiliki akses/kuota Gemini API. Jangan gunakan atau kirim key rahasia di GitHub.

### 2. Deploy Edge Function
Dari komputer yang sudah terpasang Supabase CLI, buka terminal di folder hasil clone repository ini, lalu jalankan:

```bash
supabase login
supabase link --project-ref xnbqckfbrrmdjiemfwqf
supabase functions deploy ghoustory-ai
```

Jika diminta database password, itu adalah password database project Supabase, bukan API key Gemini.

Function menggunakan verifikasi JWT Supabase. Pengguna harus login ke Ghoustory Control Room agar bisa memanggil AI.

### 3. Fitur Gemini yang terhubung
- Radar Mitos: riset awal, pemisahan fakta/rumor, pertanyaan wawancara, dan angle cerita.
- Peracik Naskah: naskah format penelusuran atau podcast.
- Notulen: merangkum transkrip rapat menjadi ringkasan, keputusan, tugas, dan tindak lanjut.
- Metadata YouTube: membaca metadata publik dasar via oEmbed, lalu membuat opsi judul, deskripsi, caption, tag, hashtag, dan placeholder timestamp dengan Gemini.

Metadata YouTube tidak dapat membaca isi/durasi/transkrip video hanya dari URL. Timestamp tidak akan dibuat-buat. Analisis isi video atau audio memerlukan proses unggah/transkripsi terpisah.

## Struktur
- `index.html`: aplikasi web.
- `supabase/config.toml`: konfigurasi Edge Function.
- `supabase/functions/ghoustory-ai/index.ts`: backend aman untuk panggilan Gemini.
