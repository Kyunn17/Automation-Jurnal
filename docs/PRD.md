# PRD: Web Pintu Masuk untuk Otomasi Jurnal PKL

Versi 2.0 (disederhanakan) · Untuk agentic AI. Baca seluruh dokumen sebelum menulis kode. Dokumen ini menggantikan versi sebelumnya.

## 1. Ringkasan

Web app ini **hanya pintu masuk**. Pengguna menempel tabel jurnal harian (hasil salin dari Google Sheets), web mengubahnya menjadi **JSON**, lalu mengirimkannya lewat **HTTP request ke workflow n8n**. Semua pekerjaan berat (validasi dengan AI, percabangan, notifikasi ke Telegram atau Discord) terjadi di n8n dan **bukan bagian dari proyek ini**.

```
[Web: tempel tabel] → ubah jadi JSON → POST ke n8n Webhook → (n8n: AI, validasi, Telegram/Discord)
```

Dipakai satu orang, berjalan lokal di Windows. Sederhana adalah tujuannya: jangan menambah fitur di luar dokumen ini.

## 2. Yang dibangun dan yang tidak

**Dibangun (v1)**
- Satu halaman dengan form.
- Parser: teks tabel menjadi JSON.
- Satu endpoint server `POST /api/submit` yang meneruskan JSON ke n8n.
- Mock n8n lokal untuk pengujian.
- README singkat.

**Tidak dibangun**
- Workflow n8n dan pemanggilan model AI (dibuat pemilik produk).
- Pembuatan file Word atau dokumen apa pun.
- Login, database, penyimpanan data, deploy ke internet.
- Pengiriman Telegram atau Discord.

## 3. Alur pengguna

1. Pengguna menempel tabel ke `textarea`.
2. (Opsional) mengisi **Alasan izin**, contoh: `mengikuti gladi TKA`.
3. Web menampilkan ringkasan hasil parsing: jumlah baris, rincian per status, dan baris bermasalah bila ada.
4. Pengguna menekan **Kirim**. Web mengirim JSON ke n8n.
5. Web menampilkan "Terkirim, hasil akan dikirim lewat Telegram" atau pesan error yang jelas.

## 4. Format input

Hasil salin dari Google Sheets: teks dengan kolom dipisah **tab**, baris dipisah newline.

```
October in 2026
Date	In	Out	Status	Topic	Report
05/10/2026	07.30	17.00	Presents	Swagger,scalar,docusaurus	learning how to use swagger,scalar, docusaurus
10/10/2026	Day Off				
12/10/2026	Permit				
29/10/2026	Sick				
```

Aturan parsing:
- Baris yang kolom pertamanya **bukan** `dd/mm/yyyy` diabaikan (judul "October in 2026", baris header, baris kosong).
- Jika kolom kedua berbentuk jam (`07.30` atau `07:30`), baris itu hari hadir: kolom 2 = jam masuk, 3 = jam pulang, 4 = status, 5 = topik, 6 = laporan.
- Jika kolom kedua **bukan jam**, kolom itu berisi status: `Day Off` → `LIBUR`, `Permit` → `IZIN`, `Sick` → `SAKIT` (tanpa memperhatikan huruf besar/kecil). Pada baris seperti ini kolom lain kosong.
- Hari hadir selalu berstatus `HADIR`, meskipun teks statusnya tertulis `Presents`, `presents`, atau variasi lain.
- Bersihkan spasi di awal dan akhir setiap sel. **Jangan mengubah, menerjemahkan, atau merapikan isi `topic` dan `report`** selain itu.
- Jam disimpan apa adanya dalam format `HH.MM` (ganti `:` menjadi `.` bila perlu).
- Baris bertanggal yang tidak bisa dikenali (status tidak jelas, tanggal tidak valid) dilaporkan sebagai masalah dengan nomor barisnya. Pengiriman diblokir sampai teks diperbaiki.
- Semua tanggal harus dalam satu bulan dan tahun yang sama. Jika bercampur, tampilkan error.
- Tanggal ganda ditolak.

## 5. Format JSON yang dikirim ke n8n

```json
{
  "period": { "month": 10, "year": 2026 },
  "izinReason": "mengikuti gladi TKA",
  "entries": [
    {
      "date": "2026-10-05",
      "status": "HADIR",
      "timeIn": "07.30",
      "timeOut": "17.00",
      "topic": "Swagger,scalar,docusaurus",
      "report": "learning how to use swagger,scalar, docusaurus"
    },
    { "date": "2026-10-10", "status": "LIBUR" },
    { "date": "2026-10-12", "status": "IZIN" },
    { "date": "2026-10-29", "status": "SAKIT" }
  ],
  "summary": { "total": 4, "hadir": 1, "izin": 1, "sakit": 1, "libur": 1 }
}
```

- `izinReason` bernilai `null` bila kolom dikosongkan. Jangan mengisinya dengan tebakan.
- `entries` terurut menurut tanggal naik. Baris `LIBUR`, `IZIN`, dan `SAKIT` hanya punya `date` dan `status`.
- Semua baris dikirim, termasuk `LIBUR`. Penyaringan dilakukan di n8n.

## 6. Endpoint `POST /api/submit`

- Berjalan di **server** supaya URL dan secret n8n tidak ada di browser.
- Body dari browser: JSON pada bagian 5 (validasi ulang bentuknya dengan `zod`).
- Meneruskan ke `N8N_WEBHOOK_URL` dengan header `x-webhook-secret: <N8N_WEBHOOK_SECRET>` dan `Content-Type: application/json`.
- n8n diasumsikan langsung membalas `202`. Teruskan hasilnya ke browser sebagai `{ "ok": true }`.
- Timeout 10 detik. Jika n8n mati atau menolak, balas `502` dengan pesan umum, **tanpa membocorkan URL atau secret**.
- Batas ukuran body: 200 KB.

## 7. Konfigurasi

`.env.local` (sediakan `.env.example` tanpa nilai):

| Nama | Fungsi |
|---|---|
| `N8N_WEBHOOK_URL` | Default lokal: `http://localhost:5678/webhook/jurnal-pkl` |
| `N8N_WEBHOOK_SECRET` | String acak buatan pemilik produk; nilai yang sama dipasang di n8n sebagai Header Auth |

n8n **belum terpasang** saat agent bekerja, jadi agent wajib menyediakan `scripts/mock-n8n`: server kecil di port 5678 yang menerima `POST /webhook/jurnal-pkl`, memeriksa header `x-webhook-secret`, membalas `202 {"status":"accepted"}`, dan mencetak ringkasan (jumlah entri dan status), bukan isi laporan. Mock dimatikan saat n8n sungguhan berjalan karena memakai port yang sama.

## 8. Teknologi

TypeScript, Next.js (App Router, satu halaman dan satu route handler), `zod`, `vitest`. Node.js 20 LTS atau lebih baru. Pengembangan di Windows: hindari skrip yang bergantung pada shell Unix. Fungsi parser ditulis sebagai fungsi murni yang terpisah (mis. `lib/parseTable.ts`) supaya mudah diuji dan dibaca.

## 9. Kriteria penerimaan

1. Dengan teks contoh di bagian 4, parser menghasilkan JSON yang sama dengan bagian 5 (4 entri; 1 hadir, 1 izin, 1 sakit, 1 libur).
2. Dengan tabel Oktober lengkap (`fixtures/sample-table.txt`, disediakan pemilik produk): **27 entri** = 15 HADIR + 4 IZIN + 1 SAKIT + 7 LIBUR.
3. Parser menangani: variasi huruf (`Presents`/`presents`), spasi di ujung sel, jam bertitik, baris judul, dan baris kosong.
4. Baris tidak dikenali dilaporkan dengan nomor baris dan menghalangi pengiriman.
5. `/api/submit` mengirim body dan header secret ke n8n (diuji dengan mock). Saat mock mati, browser menerima error `502` yang bersih.
6. Secret dan URL n8n tidak muncul di kode sisi browser maupun di respons.
7. `README.md` memuat cara menjalankan web, cara menjalankan mock, dan daftar env.

## 10. Tahapan kerja

1. **M0 Setup**: proyek Next.js, `.gitignore` (mencakup `.env*` dan `fixtures/`), skrip `dev` dan `test`.
2. **M1 Parser + tes**: `parseTable`, tes untuk kriteria 1 sampai 4.
3. **M2 Endpoint + mock**: `/api/submit` dan `scripts/mock-n8n` (kriteria 5, 6).
4. **M3 Halaman form + README**: textarea, alasan izin, ringkasan parsing, tombol kirim, status hasil (kriteria 7).

## 11. Aturan untuk agent

- Jangan menambah fitur di luar dokumen ini (tanpa Word, database, login, atau AI).
- Jangan membuat atau mengubah workflow n8n.
- Jangan mengubah isi laporan pengguna. Parser hanya memindahkan teks, bukan merapikannya.
- Jangan menulis secret atau isi laporan ke log, README, atau commit.
- Jika ada keputusan teknis yang tidak tercakup, pilih opsi paling sederhana dan catat di README bagian "Keputusan".
- Tulis kode yang sederhana dan mudah dibaca; pemilik produk memakainya untuk belajar.

## 12. Di luar scope sekarang (kemungkinan tahap lanjut)

Pembuatan tiga file Word (Daftar Hadir, Jurnal Kegiatan, Laporan Kerja Harian) dari hasil n8n. Tidak dikerjakan di versi ini.