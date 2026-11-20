---
name: exam-mode-ulangan
description: Gunakan saat mengubah alur ujian siswa – js/exam.js, pages/ujian.html, instruksi, selesai, timer, autosave, fullscreen, deteksi pelanggaran, penilaian (Utils.hitungNilai).
---

# Exam Mode – Aplikasi Ulangan Digital

Alur: login → kode ujian (`dashboard-siswa`) → `instruksi` → `ujian` (fullscreen) → kirim → `selesai`.

## Aturan
- Siswa tidak boleh memulai sebelum jadwal / setelah ditutup: validasi `Utils.isUjianAktif(ujian)` di `ujian.html`.
- Pelanggaran (Page Visibility, blur/focus, keluar fullscreen) dicatat dengan timestamp ke `violations` dan `audit_logs`; peringatan: "Terdeteksi aktivitas meninggalkan halaman ujian. Silakan kembali ke ujian". Melewati `max_pelanggaran` → status `ditangguhkan` ("Ujian Ditangguhkan", perlu verifikasi guru). Jangan menghapus jawaban saat pelanggaran. Jangan memakai kamera/mikrofon.
- Timer memakai waktu server dan `startTime` yang di-clamp; waktu habis → kirim otomatis.
- Autosave berkala ke `jawaban`; pemulihan membandingkan `last_saved`/`start_time` cloud vs lokal.
- `Utils.hitungNilai`: `bobot = 0` dan `kkm = 0` valid (cek `!== undefined && !== null`); uraian bertanda `menungguPenilaian`; hitung "dijawab" tanpa nilai kosong.
- `onSuspended()` harus `await ExamEngine.submit('suspended')`.
- Browser biasa tidak menjamin penguncian perangkat; sebutkan keterbatasan ini di UI/dokumen, rekomendasikan kiosk mode.

## Uji manual
Pindah tab, keluar fullscreen, tombol back, refresh saat ujian, offline lalu online, waktu habis, buka sebelum jadwal.
