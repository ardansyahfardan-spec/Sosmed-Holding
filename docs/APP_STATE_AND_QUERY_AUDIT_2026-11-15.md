# Ghoustory Control Room — audit app_state dan query (15 November 2026)

## Ringkasan temuan live

Audit dilakukan dengan query baca-saja pada project Supabase produksi. Baris aplikasi yang diperiksa adalah `public.app_state.id = 'ghoustory'`.

| Ukuran | Hasil |
|---|---:|
| Jumlah baris app_state | 1 |
| Ukuran JSONB `data` | 6,269,057 byte (sekitar 6.27 MB) |
| Ukuran teks JSON | 6,265,905 byte |
| Ukuran total tabel + indeks | 7,168 KB |
| Jumlah key tingkat atas | 16 |

### Distribusi payload utama

| Key | Ukuran JSONB | Item |
|---|---:|---:|
| `segmenList` | 5,990,025 byte | 4 |
| `videoAnalyses` | 254,861 byte | 8 |
| `socialAnalytics` | 14,733 byte | 45 |
| `notulen` | 6,045 byte | 9 |
| Key lainnya | kecil | bervariasi |

Tiga logo segmen adalah Base64 data URI dan menjadi sumber pembengkakan utama:

| Segmen | Panjang logo Base64 |
|---|---:|
| `#KONCERITO` | 2,092,938 karakter |
| `#NGELENCER` (nama pada data live) | 2,032,318 karakter |
| `#TrickorStory` | 1,864,190 karakter |
| Item keempat | logo kosong |

Kesimpulan: payload besar terutama disebabkan media biner yang disimpan sebagai teks Base64 di JSON, bukan karena jumlah record aplikasi yang sangat banyak.

## Perbaikan yang sudah tersedia di branch

1. Logo baru dikompresi ke WebP, dimensi maksimum 512 px, kualitas 0.82.
2. Logo Base64 lama dimigrasikan saat aplikasi dibuka dan diunggah ke bucket Storage yang sudah ada, `arena-game-images`, pada folder `segments/`.
3. `app_state` menyimpan URL publik, bukan Base64. Logo lama tidak dihapus dari data sebelum URL baru berhasil disimpan.
4. Policy upload membatasi INSERT ke folder `segments` bagi authenticated Workspace Crew/admin; kebijakan public-read bucket yang sudah ada tetap dipakai.
5. RPC `ghoustory_patch_app_state` mengirim hanya key tingkat atas yang berubah dan memakai optimistic concurrency.

### Batasan yang masih ada

- Aplikasi masih membaca seluruh `data` dari `app_state` ketika sinkronisasi awal.
- `saveData()` masih membuat serialisasi snapshot penuh di browser untuk membandingkan perubahan.
- RPC patch tetap memperbarui satu dokumen JSONB besar di satu baris; ini mengurangi payload request dan mencegah snapshot identik dikirim, tetapi belum memecah lock/write contention per modul.
- Setelah tiga logo dipindahkan, `videoAnalyses` sekitar 255 KB akan menjadi payload terbesar berikutnya. Angka aktual harus diukur ulang setelah frontend branch dipublikasikan dan migrasi logo berjalan.

## Keputusan arsitektur yang disarankan

Jangan langsung memecah seluruh 16 key menjadi banyak tabel sebelum hasil migrasi logo diukur. Langkah paling hemat risiko:

1. **Tahap media:** setelah frontend yang berisi migrasi logo dipublikasikan, verifikasi bahwa ketiga logo menjadi URL dan ukuran `app_state` turun. Jangan menghapus file atau data lama secara manual.
2. **Tahap pengukuran:** bandingkan ukuran JSONB, waktu sinkronisasi awal, dan frekuensi request setelah migrasi. Tidak ada klaim penghematan sampai pengukuran pasca-migrasi tersedia.
3. **Tahap arsip besar:** bila `videoAnalyses` tetap tumbuh atau menjadi beban nyata, pindahkan arsip ini ke tabel khusus dengan RLS Workspace, pagination, dan pemuatan hanya saat halaman arsip dibuka.
4. **Tahap berikutnya:** pindahkan koleksi lain hanya berdasarkan pertumbuhan dan pola akses. `socialAnalytics` saat ini sekitar 15 KB; pemisahan sekarang belum memberi manfaat berarti.
5. **Kompatibilitas:** setiap pemisahan harus memiliki backfill idempoten, pembacaan fallback selama transisi, optimistic concurrency per koleksi, dan verifikasi jumlah record sebelum data legacy dihentikan.

## Status produksi dan batas perubahan

- Audit ukuran dan isi key dilakukan dengan SELECT baca-saja.
- Migrasi logo dan perubahan frontend masih berada di branch PR #2; belum dipublikasikan.
- RPC pencarian DM tambahan pada branch juga belum diterapkan ke project live.
- Tidak ada data `app_state` yang diubah atau dihapus dalam audit ini.
- Tidak ada permintaan Gemini yang dijalankan dan tidak ada Edge Function yang di-deploy.

## Optimasi DM di branch

- Inbox memakai satu RPC `ghoustory_dm_inbox()` dengan SECURITY INVOKER dan RLS tetap berlaku.
- Pencarian percakapan 1:1 menggunakan RPC `ghoustory_dm_find_conversation()` ketika migration tersedia; fallback lama dipertahankan untuk kompatibilitas sebelum migration.
- Event pesan, tanda baca, dan penghapusan kini memakai debounce refresh inbox 250 ms.
- Migration pencarian DM hanya tersimpan di branch; belum ada perubahan produksi dari migration tersebut.


## Hardening Edge Function AI (branch PR #2, 15 Nov 2026)

- Parsing body kini dibatasi dengan pembacaan stream maksimum 25 MiB sebelum JSON.parse; Content-Length yang melebihi batas ditolak dengan HTTP 413. Batas ini tetap kompatibel dengan jalur audio Base64 yang saat ini membatasi payload audio mentah sekitar 17 MB.
- Diagnostik `task=health` kini dijalankan setelah verifikasi JWT dan membership Crew; respons tidak lagi mengungkap apakah secret provider Gemini terpasang.
- Ditambahkan pembatas burst atomik per pengguna: maksimum 10 request AI per menit melalui RPC `ghoustory_ai_take_rate_limit()`. Jika RPC gagal diverifikasi, endpoint menolak pemrosesan AI dengan HTTP 503 (fail closed); jika kuota burst habis, HTTP 429 dan `Retry-After: 60`.
- Migration pembatas AI dan perubahan Edge Function hanya berada di branch PR #2. Tidak dijalankan ke Supabase live dan tidak ada request Gemini yang dikirim.
- GitHub Actions run #76 pada commit `16225fc2f4cd1d1dc4a3c024ba46f04fae21e438` lulus: validasi JavaScript Workspace, delapan skrip inline, dan `deno check` Edge Function.
- Pemeriksaan browser/E2E belum dilakukan. Sebelum merge/deploy, migration perlu diuji pada environment non-produksi, termasuk batas 10 request/menit, reset window, dan respons 503 saat RPC tidak tersedia.
- Temuan konfigurasi Auth yang tidak dapat diperbaiki melalui repository (perlindungan kata sandi bocor) tetap perlu diaktifkan melalui dashboard setelah persetujuan admin. Endpoint `ghoustory-character` di project live memakai `verify_jwt=false` untuk alur pairing Roblox publik; aksi yang mengubah akun tetap memvalidasi token atau kode pairing satu kali, dan alur publik perlu diuji ulang sebelum perubahan konfigurasi.


### Hardening hak TRUNCATE browser roles (15 Nov 2026)
- Audit ulang privilege live menemukan grant TRUNCATE langsung pada 26 tabel untuk role `anon` dan 27 tabel untuk `authenticated` (termasuk `app_state`). TRUNCATE adalah hak tingkat tabel dan tidak dibatasi oleh RLS seperti operasi baris.
- Ditambahkan migration `20261115051000_revoke_public_truncate_grants.sql` untuk mencabut TRUNCATE dari kedua role pada seluruh tabel schema public.
- Migration juga mengubah default privileges untuk role pembuat tabel `postgres` dan `supabase_admin`, agar tabel public baru tidak otomatis memberikan TRUNCATE kepada anon/authenticated.
- Migration ini branch-only dan belum dijalankan ke Supabase live. Perlu validasi pada project non-produksi sebelum dipertimbangkan untuk rilis.
- GitHub Actions run #84 pada commit `44f2f41d024a3890eae5bf73e8e2464ebc064603` lulus: validasi JavaScript Workspace, delapan skrip inline, dan pemeriksaan tipe Edge Function Deno. CI tidak mengeksekusi SQL migration.


### Uji regresi migration dan verifikasi lanjutan (15 Nov 2026)
- Pipeline CI kini menjalankan PostgreSQL 16 terisolasi, menyiapkan fixture kompatibel Supabase, menerapkan kedua migration baru, lalu menguji:
  - TRUNCATE tidak tersedia pada tabel publik yang sudah ada maupun tabel publik baru untuk `anon` dan `authenticated`.
  - Tabel private pembatas AI tidak dapat dibaca langsung oleh role browser.
  - RPC hanya dapat dieksekusi role `authenticated`, dan batasnya tepat 10 request berhasil per user per menit; request ke-11 ditolak.
- GitHub Actions run #91 lulus pada commit `7d3515b46f9dc18c80396d2511edc8c890166227`, termasuk kedua job `syntax` dan `database-migrations`.
- Pemeriksaan Supabase mengonfirmasi tabel `ghoustory_character_pair_codes` dan `ghoustory_roblox_links` tidak memberi grant langsung kepada `anon`/ `authenticated`; keduanya memang dilayani Edge Function menggunakan service role. Karena itu dua peringatan RLS tanpa policy pada tabel tersebut tidak berarti browser dapat mengakses tabel secara langsung. Tetap perlu menjaga pola service-role-only ini.
- Belum ada Supabase development branch pada project. Migration diuji pada PostgreSQL CI yang terisolasi, bukan pada database Supabase non-produksi.
- Uji browser login Crew/Admin belum berhasil dijalankan: saldo TinyFish tidak mencukupi dan situs GitHub Pages tidak dapat dibaca melalui pemeriksaan web. Tidak ada login atau perubahan data yang dilakukan.
- Leaked Password Protection masih nonaktif. Konektor Supabase yang tersedia tidak menyediakan operasi untuk mengubah pengaturan Auth ini; perlu diaktifkan di Dashboard Supabase > Authentication > Settings > Password Security.
- Semua migration baru tetap branch-only; tidak ada migration atau deployment baru ke produksi.
