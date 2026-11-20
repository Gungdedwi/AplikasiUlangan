---
name: review-ulangan
description: Gunakan saat diminta memeriksa, mengaudit, atau memverifikasi aplikasi Ulangan Digital sebelum rilis – menjalankan checklist bug, keamanan, dan integrasi halaman, lalu memperbarui review_keamanan_kinerja_bug.md.
---

# Review Rilis – Aplikasi Ulangan Digital

1. Baca `review_keamanan_kinerja_bug.md` untuk temuan lama; verifikasi di kode/SQL bahwa yang berstatus "Selesai" benar-benar selesai (jangan percaya tabel status saja, terutama S1 RLS).
2. Syntax check: `for f in js/*.js; do node --check $f; done` dan periksa blok `<script>` tiap halaman.
3. Cek tiap halaman memuat script sesuai urutan dan memanggil guard role.
4. Jalankan skill `keamanan-ulangan`, `supabase-ulangan`, `exam-mode-ulangan` sebagai checklist.
5. Uji manual alur guru (buat soal → ujian → kode) dan siswa (kode → ujian → selesai → hasil di dashboard guru).
6. Catat temuan baru dengan ID (B/S/H/A), dampak, dan perbaikan; jangan menandai selesai tanpa verifikasi.
