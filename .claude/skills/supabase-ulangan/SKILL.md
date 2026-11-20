---
name: supabase-ulangan
description: Gunakan saat mengubah database Supabase, supabase_schema.sql, js/storage.js (objek DB), atau query/RLS untuk tabel users, soal, ujian, jawaban, hasil, audit_logs di aplikasi Ulangan Digital.
---

# Supabase – Aplikasi Ulangan Digital

## Arsitektur data
- Frontend statis (vanilla JS) + Supabase JS client via CDN. Semua akses data lewat objek `DB` di `js/storage.js`; jangan memanggil `supabase.from()` langsung dari halaman HTML.
- localStorage (prefix `ulangan_`) hanya cache/offline, bukan sumber data utama. Setelah sinkron, event `supabase-synced` dikirim; halaman cukup mendengarkan satu listener ini (jangan sync ganda).
- Konfigurasi lewat `window.SUPABASE_URL` / `window.SUPABASE_ANON_KEY`. Hanya anon key yang boleh ada di frontend; jangan pernah menaruh `service_role` key.

## Tabel (public)
`users`, `soal`, `ujian`, `jawaban` (id = `{ujian_id}_{siswa_id}`), `hasil`, `audit_logs`. ID bertipe `text` (UUID string). Kolom guru: `mapel`, `kelas_ampu`.

## Aturan saat mengubah skema
1. Ubah `supabase_schema.sql` secara idempoten (`create table if not exists`, `add column if not exists`, `drop policy if exists`).
2. Samakan nama kolom snake_case DB dengan camelCase di JS; mapping ada di `storage.js` — cek keduanya.
3. Semua operasi async harus di-`await` dan menangani `error` (tampilkan toast, jangan diam-diam gagal).
4. Autosave: `DB.saveJawaban()` mengembalikan `{ local, cloud }`; pertahankan serialisasi request (`_isSaving`/`_hasPendingSave`).
5. Gunakan `Utils.uuid()` untuk ID baru, bukan `crypto.randomUUID` langsung.

## RLS
Lihat skill `keamanan-ulangan`. Jangan menulis policy `using (true)` untuk `anon` pada operasi tulis.
