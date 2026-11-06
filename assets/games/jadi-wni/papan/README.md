# Aset Papan — JADI WNI

Papan permainan dibuat sebagai komponen terpisah dan responsif, bukan satu gambar papan utuh. Dengan begitu posisi, kepemilikan petak, status, dan tampilan tiap babak dapat berubah mengikuti jalannya permainan.

## Gaya visual
- Nuansa arsip sejarah Indonesia: kertas krem kusam, tinta hitam, aksen merah tua dan biru tua.
- Bentuk papan modern dan mudah dibaca di layar ponsel.
- Ornamen arsip digunakan secukupnya agar informasi petak tetap jelas.
- Jangan menambahkan teks penting ke dalam tekstur latar; teks permainan ditampilkan oleh antarmuka agar tetap tajam dan mudah diterjemahkan.

## Struktur aset
- `background/`: tekstur/latar papan.
- `petak/`: ilustrasi tiap jenis petak.
- `ornamen/`: cap arsip, potongan koran, stempel, dan elemen dekoratif.
- `penanda-babak/`: penanda periode atau babak sejarah.

## Daftar aset yang direncanakan
### Latar
- `background/papan-arsip.webp`

### Petak
- `petak/tanah.webp`
- `petak/industri.webp`
- `petak/transportasi.webp`
- `petak/media.webp`
- `petak/pendidikan.webp`
- `petak/kesehatan.webp`
- `petak/pajak.webp`
- `petak/penjara.webp`
- `petak/dana-umum.webp`
- `petak/kesempatan.webp`
- `petak/start.webp`
- `petak/bebas.webp`

### Ornamen
- `ornamen/cap-arsip.webp`
- `ornamen/potongan-koran.webp`
- `ornamen/stempel-merah.webp`

### Penanda babak
- `penanda-babak/1965.webp`
- `penanda-babak/orde-baru.webp`
- `penanda-babak/krisis-1997.webp`
- `penanda-babak/reformasi-1998.webp`
- `penanda-babak/epilog-2004.webp`

## Pedoman teknis
- Utamakan WebP untuk gambar raster; gunakan PNG bila membutuhkan transparansi yang lebih bersih.
- Ilustrasi petak sebaiknya punya ruang aman dan komposisi konsisten agar tidak terpotong saat dipakai pada ukuran layar berbeda.
- Aset dekoratif tidak boleh menutupi nama petak, harga, ikon, atau informasi permainan.
- File gambar akan ditambahkan setelah aset visual final tersedia.
