# Spesifikasi & Prompt Aplikasi Ulangan / Asesmen Digital

Bertindaklah sebagai **SOFTWARE DEVELOPER PROFESIONAL**, **UI/UX DESIGNER**, **AHLI SISTEM ASESMEN DIGITAL**, DAN **AHLI KEAMANAN APLIKASI PENDIDIKAN DI INDONESIA**. Buat aplikasi **ULANGAN/ASESMEN DIGITAL** berbasis web yang modern, responsif, ringan, aman, dan mudah digunakan guru serta siswa.

---

## 🚀 Fitur Utama

- **Login Guru & Siswa**:
  - Guru: dapat membuat ujian, bank soal (Pilihan Ganda, Isian, Benar-Salah, Uraian), mengatur durasi, jadwal, jumlah soal, KKM, nilai, dan pengaturan ujian.
  - Siswa: masuk menggunakan kode ujian / username / PIN.

- **Exam Mode / Kiosk Mode**:
  - Ketika siswa menekan **MULAI UJIAN**, aktifkan **FULLSCREEN**.
  - Cegah navigasi / perpindahan halaman.
  - Gunakan **Page Visibility API**, **blur/focus detection**, deteksi perpindahan tab/window dan keluar fullscreen.
  - Catat timestamp setiap pelanggaran, tampilkan peringatan, hitung jumlah pelanggaran, dan sediakan batas pelanggaran dengan tindakan otomatis.
  - *Catatan Keamanan*: Jangan langsung menghapus jawaban dan jangan menggunakan kamera/mikrofon atau mengambil data pribadi tanpa persetujuan.

- **Autosave & Synchronization**:
  - Simpan jawaban secara berkala.
  - Pulihkan jawaban saat koneksi terganggu.
  - Timer berdasarkan waktu server.
  - Ujian otomatis terkunci dan jawaban terkirim saat waktu habis.
  - Siswa tidak dapat membuka soal sebelum jadwal atau melihat hasil sebelum diizinkan guru.

- **Audit & Hasil**:
  - **Dashboard Guru**: menampilkan nilai, waktu pengerjaan, status selesai, statistik, serta audit log setiap pelanggaran.
  - **Halaman Siswa**: halaman instruksi, soal, timer, navigasi soal, konfirmasi, dan halaman selesai.

---

## 🔄 Alur Sistem

`LOGIN` ➔ `KODE UJIAN` ➔ `INSTRUKSI` ➔ `MULAI` ➔ `FULLSCREEN / EXAM MODE` ➔ `SOAL` ➔ `TIMER` ➔ `KIRIM` ➔ `KONFIRMASI` ➔ `SELESAI`

- Jika siswa keluar fullscreen / berpindah tab, tampilkan:
  > *"Terdeteksi aktivitas meninggalkan halaman ujian. Silakan kembali ke ujian"*
- Jika melewati batas pelanggaran, tampilkan:
  > *"Ujian Ditangguhkan"* (memerlukan verifikasi guru).

---

## 🎨 Desain & Arsitektur

- Halaman: Login, Dashboard, Bank Soal, Manajemen Ujian, Halaman Siswa, Hasil, Audit Log, Pengaturan Exam Mode, Instruksi, dan Selesai.
- Tema: Putih - Biru Modern, responsif di HP / tablet / komputer.
- Kualitas Kode: Modular / reusable, validasi, error handling, autentikasi, otorisasi role, proteksi XSS/CSRF, database aman. Aplikasi harus benar-benar berfungsi (bukan sekadar mockup).
- **Catatan Penguncian**: Web browser biasa tidak dapat menjamin penguncian perangkat 100%. Gunakan kiosk / managed device mode untuk penguncian tingkat perangkat.

---

## 🛠️ Cara Buat di Google AI Studio

1. Pilih AI pembuat aplikasi yang bisa menghasilkan aplikasi web dari prompt.
2. Copas prompt di atas ke AI tersebut.
3. Minta AI membuat versi pertama yang langsung bisa dijalankan, bukan sekadar desain.
4. Pastikan teknologi yang dibuat mendukung HTML/CSS/JavaScript + database + login guru/siswa.
5. **Pengujian Guru**: Buat ujian ➔ masukkan soal ➔ atur waktu ➔ buat kode ujian.
6. **Pengujian Siswa**: Login ➔ masukkan kode ➔ tekan Mulai Ujian ➔ aplikasi masuk Fullscreen/Exam Mode.
7. Uji siswa berpindah tab, keluar fullscreen, atau menekan tombol kembali (sistem mencatat pelanggaran & memberi peringatan).
8. Tambahkan autosave, timer server, pengiriman otomatis, hasil nilai, dan audit log.
9. Untuk penguncian lebih kuat, jalankan perangkat siswa dalam kiosk/managed-device mode.
10. Deploy ke hosting agar dapat diakses via HP, tablet, atau komputer.

---

## 📌 ADDENDUM UTAMA (WAJIB DIIKUTI)

Karena aplikasi ini 100% menggunakan arsitektur Frontend (HTML, CSS, Vanilla JS) dan akan di-host di GitHub Pages/Vercel, maka untuk fitur "Login Guru & Siswa", "Penyimpanan Bank Soal", "Autosave Jawaban", dan "Audit Log Pelanggaran", KAMU WAJIB MENGGUNAKAN SUPABASE (menggunakan Supabase JS Client via CDN).

Tolong implementasikan:
1. `js/auth.js`: Harus menggunakan Supabase Auth (untuk membedakan role guru dan siswa).
2. `js/storage.js`: Jangan gunakan localStorage untuk data utama. Gunakan query Supabase (`select`, `insert`, `update`) untuk memuat soal ke `ujian.html` dan mengirim hasil ujian dari `selesai.html` ke database cloud agar bisa dibaca oleh `dashboard-guru.html` dan `hasil.html`.
3. Berikan instruksi tabel apa saja (SQL DDL) yang harus saya buat di dashboard Supabase agar kode JS yang kamu buat ini singkron.
