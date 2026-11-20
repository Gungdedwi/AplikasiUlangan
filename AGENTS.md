# AGENTS.md

## Project

- Aplikasi Ulangan / Asesmen Digital (guru & siswa), bahasa situs: id.
- Frontend statis: HTML, CSS, vanilla JS (tanpa framework, tanpa build step).
- Backend/database: Supabase (PostgreSQL + Auth) lewat `@supabase/supabase-js@2` via CDN. Skema ada di `supabase_schema.sql`.
- Spesifikasi awal ada di `PROMPT.md`; audit keamanan di `review_keamanan_kinerja_bug.md`; panduan server di `KEAMANAN_SERVER.md`.

## Development

- Buka `index.html` dengan Live Server atau F5; tidak ada kompilasi.
- Konfigurasi Supabase: `window.SUPABASE_URL` / `window.SUPABASE_ANON_KEY` atau pengaturan di halaman Pengaturan (disimpan di localStorage). Hanya anon key di frontend; jangan pernah memakai `service_role` key.
- Setelah mengubah skema, jalankan `supabase_schema.sql` di Supabase Dashboard → SQL Editor (skrip dibuat idempoten).
- Cek sintaks JS: `for f in js/*.js; do node --check $f; done`.

## File structure

- Halaman: `index.html` (login), `pages/`: `audit-log`, `bank-soal`, `dashboard-guru`, `dashboard-siswa`, `hasil`, `instruksi`, `login-guru`, `manajemen-ujian`, `pengaturan`, `selesai`, `ujian` (`.html`).
- CSS: `css/style.css`.
- JS:
  - `js/storage.js` — objek `DB`: klien Supabase, query, cache localStorage (prefix `ulangan_`), mapping snake_case ↔ camelCase.
  - `js/auth.js` — `Auth` (login, sesi, guard role) dan `Router`.
  - `js/exam.js` — `ExamEngine`: timer, autosave, deteksi pelanggaran, kirim jawaban.
  - `js/utils.js` — `Utils`: sanitasi, hash, UUID, penilaian (`hitungNilai`), cek jadwal.
  - `js/layout.js` — sidebar/header bersama.
- Tabel Supabase: `users`, `soal`, `ujian`, `jawaban`, `hasil`, `audit_logs`.
- Skill proyek di `.claude/skills/`: `supabase-ulangan`, `keamanan-ulangan`, `exam-mode-ulangan`, `ui-ulangan`, `review-ulangan`.

## Role

- `admin`, `guru`, `siswa`. Guru dibatasi oleh `mapel` dan `kelas_ampu`. Guard halaman: `Auth.requireRole([...])`.

## Key Conventions

- Akses data hanya lewat `DB`; jangan memanggil `supabase.from()` langsung dari halaman.
- Operasi async di-`await` dan error ditampilkan (toast); pakai `Utils.uuid()` untuk ID baru.
- Render data pengguna dengan escape/`textContent`; input lewat `Utils.sanitizeInput`.
- Asset lokal; CDN hanya supabase-js dan SheetJS kecuali sangat perlu.

## Security Architecture & Known Limitations

- RLS di `supabase_schema.sql` telah diperketat: izin open `FOR ALL TO anon USING (true)` telah dihapus di seluruh tabel.
- Kunci jawaban dilindungi: siswa hanya mengambil soal melalui view `soal_siswa` (tanpa kolom `jawaban`).
- Penilaian resmi dilakukan di server PostgreSQL lewat RPC `submit_ujian` (`SECURITY DEFINER`), sehingga siswa tidak dapat memalsukan skor/nilai melalui konsol browser.
- Kredensial default `admin123` pada seed SQL menggunakan `ON CONFLICT DO NOTHING` dan wajib diganti dengan password baru yang kuat sebelum aplikasi digunakan secara nyata.
- Guard role di sisi frontend (`Auth.requireRole`) dan sesi LocalStorage berfungsi sebagai pengontrol alur navigasi UX; otorisasi data mutlak berada di tingkat database/RPC Supabase.

## Comment style

- Jangan menaruh komentar di dua baris pertama file; mulai dengan deklarasi.
- Gunakan heading ringkas seperti `// ── Constants ──`.
- JSDoc hanya bila perlu menjelaskan API, maksud, edge case, atau batasan.

## Boundaries

- Jangan menambah build tool atau `package.json` kecuali diminta.
- Jangan memperkenalkan framework JavaScript.
