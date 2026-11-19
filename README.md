# Otomasi Jurnal PKL (Web Pintu Masuk)

Web app lokal sederhana sebagai pintu masuk untuk otomasi jurnal PKL harian. Pengguna menempel tabel jurnal dari Google Sheets, web mem-parsing tabel tersebut menjadi JSON, lalu meneruskannya ke webhook n8n melalui endpoint server `POST /api/submit`.

Semua pemrosesan lanjutan (validasi AI, percabangan, dan pengiriman ke Telegram atau Discord) berjalan di workflow n8n dan berada di luar proyek ini.

## Prasyarat

- Node.js 20 LTS atau lebih baru (diuji di Windows).

## Konfigurasi Environment

Salin file `.env.example` menjadi `.env.local`, lalu isi nilainya secara lokal:

| Nama | Fungsi |
|---|---|
| `N8N_WEBHOOK_URL` | Alamat webhook n8n. Default lokal: `http://localhost:5678/webhook/jurnal-pkl` |
| `N8N_WEBHOOK_SECRET` | String acak rahasia yang dicocokkan dengan header `x-webhook-secret` di n8n |

> **Catatan keamanan:** Jangan pernah menuliskan nilai `N8N_WEBHOOK_SECRET` atau isi laporan jurnal ke kode, log, README, atau commit Git. File `.env*` sudah masuk `.gitignore`.

## Cara Menjalankan

1. Pasang dependensi proyek:
   ```powershell
   npm install
   ```

2. Jalankan server tiruan n8n (**mock**) di terminal pertama untuk pengujian lokal:
   ```powershell
   npm run mock-n8n
   ```
   Mock berjalan di `http://localhost:5678/webhook/jurnal-pkl`, memeriksa header `x-webhook-secret` (membaca dari environment atau `.env.local`), membalas `202 {"status":"accepted"}`, dan hanya mencetak ringkasan periode serta jumlah status tanpa mencetak isi laporan.

   > **Penting:** Matikan `mock-n8n` saat n8n sungguhan sedang dijalankan karena keduanya memakai port `5678`.

3. Jalankan aplikasi web di terminal kedua:
   ```powershell
   npm run dev
   ```
   Buka `http://localhost:3000` di browser.

4. Menjalankan seluruh tes otomatis:
   ```powershell
   npm test
   ```

## Keputusan

Bagian ini mencatat keputusan teknis di luar detail yang dikunci PRD:

1. **Setup proyek minimalis (tanpa package tambahan di luar PRD):** Hanya menggunakan `next`, `react`, `react-dom`, `zod`, `typescript`, dan `vitest` serta CSS murni di `app/globals.css` agar kode ringkas dan mudah dipelajari.
2. **Bentuk hasil `parseTable` (`{ ok, data, summary, errors }`):** Parser memproses semua baris hingga selesai dan mengumpulkan seluruh error beserta nomor barisnya (bukan berhenti pada error pertama), sehingga pengguna dapat langsung memperbaiki semua baris bermasalah sekaligus.
3. **Validasi kelengkapan baris `HADIR`:** Jika kolom kedua terdeteksi sebagai jam masuk, kolom jam pulang (`Out`), `Topic`, dan `Report` wajib terisi. Kolom yang kosong dilaporkan sebagai baris bermasalah dan memblokir pengiriman, sedangkan isi teks `Topic` dan `Report` yang tetap ada dikirim apa adanya tanpa dirapikan atau diterjemahkan.
4. **Parsing reaktif di browser:** `parseTable` langsung dijalankan saat teks ditempel atau diubah di `textarea` tanpa tombol "Cek" terpisah, sehingga ringkasan dan status validasi langsung terlihat sebelum menekan **Kirim**.
5. **Validasi ulang di server + `node:http` untuk mock:** Endpoint `POST /api/submit` memvalidasi ulang payload menggunakan skema `zod` (`lib/journalSchema.ts`) dan membatasi body maksimal 200 KB serta timeout 10 detik. Server tiruan `scripts/mock-n8n.js` ditulis memakai modul bawaan `node:http` pada `127.0.0.1:5678` tanpa library tambahan.
