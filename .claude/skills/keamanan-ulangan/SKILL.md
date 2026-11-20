---
name: keamanan-ulangan
description: Gunakan saat meninjau atau memperbaiki keamanan aplikasi Ulangan Digital – RLS Supabase, autentikasi/role, hash password, XSS, CSRF, kunci jawaban, session, .htaccess.
---

# Keamanan – Aplikasi Ulangan Digital

Checklist yang harus dicek setiap ada perubahan terkait data/auth:

## Supabase & RLS
- Policy harus berbasis `auth.uid()` dan role dari tabel profil/JWT, bukan `to anon using (true)`.
- Siswa: hanya boleh baca/tulis `jawaban` dan `hasil` miliknya; tidak boleh baca `soal.jawaban` (kunci) sebelum selesai.
- Guru: hanya `soal`/`ujian` sesuai `mapel` dan `kelas_ampu` miliknya; admin boleh semua.
- Kolom `password` tidak boleh dapat dibaca role `anon`/`authenticated` biasa. Gunakan Supabase Auth, bukan tabel `users.password`.
- Skor akhir sebaiknya dihitung server-side (RPC/Edge Function), bukan dipercaya dari client.

## Client
- Semua input pengguna melewati `Utils.sanitizeInput`; saat render ke DOM gunakan `textContent` atau escape, hindari `innerHTML` dengan data pengguna.
- Role tidak boleh ditentukan dari localStorage/session client saja; verifikasi ulang ke server.
- Setiap halaman guru/admin wajib memanggil guard role di awal; halaman hasil memeriksa `hasil.siswaId === session.userId`.
- Token CSRF di `Auth._csrfToken` disimpan di sessionStorage.
- Upload impor siswa: hanya `.xlsx/.xls/.csv`, maks 10 MB.

## Server
- Pertahankan `.htaccess` (blokir PHP/skrip, `.sql`, `.git`, `Options -Indexes`, security headers). Lihat `KEAMANAN_SERVER.md`.
- `supabase_schema.sql` memuat seed admin dengan password default; ganti sebelum produksi dan jangan sebarkan file SQL ke hosting publik.
