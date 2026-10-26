# Panduan Keamanan Server & Perlindungan dari Kerentanan PHP

Dokumen ini menjelaskan status keamanan aplikasi **Ulangan Digital** terhadap ancaman keamanan PHP (seperti CVE-2024-4577, webshell PHP, dan injeksi skrip server-side).

---

## 1. Apakah Aplikasi Ini Menggunakan PHP?

**TIDAK.** Aplikasi Ulangan Digital ini dibangun dengan arsitektur **Jamstack / Web Statis**:
- **Frontend:** Pure HTML5, CSS3, dan Vanilla JavaScript (ES6+).
- **Backend & Database:** Supabase Cloud (PostgreSQL + REST API).
- **Pemrosesan Data Excel:** Dilakukan 100% di browser siswa/guru (*client-side*) menggunakan library SheetJS dan JavaScript `FileReader`. File tidak pernah diunggah atau dieksekusi di server lokal.

Karena **tidak ada kode PHP satu baris pun** dalam aplikasi ini, kerentanan yang menyerang bahasa PHP (seperti *PHP CGI Remote Code Execution*, *PHP Object Injection*, fungsi berbahaya `eval()`, atau *PHP Deserialization*) **tidak dapat menyerang atau mengeksekusi kode di aplikasi ini**.

---

## 2. Langkah Pengamanan yang Telah Diterapkan

Meskipun aplikasi ini statis, server sekolah sering kali menggunakan **XAMPP, Apache, cPanel, atau Nginx** yang memiliki modul PHP aktif secara default. Untuk mencegah penyusup memanfaatkan server sekolah tersebut, proteksi berikut telah dipasang:

### A. File Konfigurasi `.htaccess` (Untuk Apache / XAMPP / LiteSpeed)
File [`.htaccess`](./.htaccess) telah ditambahkan di root proyek dengan fitur pengamanan:
1. **Mematikan Engine PHP:** `php_flag engine off` secara otomatis mematikan interpreter PHP pada direktori aplikasi.
2. **Menghapus Handler PHP:** Ekstensi `.php`, `.phtml`, `.php3` s/d `.php8`, `.cgi`, `.pl`, dan `.sh` dicabut izin eksekusinya.
3. **Blokir Request Skrip (403 Forbidden):** Setiap request HTTP ke file berekstensi skrip server-side langsung ditolak dengan status *403 Forbidden*.
4. **Proteksi File Sensitif:** File seperti `.sql`, `.env`, `.git`, `.log`, dan file konfigurasi diblokir dari akses publik.
5. **Anti Directory Browsing:** `Options -Indexes` mencegah pengguna melihat daftar isi folder jika file index tidak ada.
6. **HTTP Security Headers:** Menerapkan `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, dan `Referrer-Policy`.

### B. Validasi File Impor Siswa di Browser
Pada menu impor akun siswa ([`pages/pengaturan.html`](./pages/pengaturan.html)):
- File yang dipilih diperiksa ekstensinya secara ketat: **hanya `.xlsx`, `.xls`, dan `.csv`** yang diizinkan.
- Jika ada pengguna yang mencoba mengunggah file `.php`, `.phtml`, `.exe`, atau file skrip lainnya, sistem langsung menolak dan menampilkan pesan peringatan.
- Ukuran file dibatasi maksimal 10 MB untuk mencegah kehabisan memori browser (*Denial of Service*).

---

## 3. Rekomendasi Tambahan untuk Server Sekolah

Jika sekolah Anda menggunakan server lokal atau VPS sendiri:

### Jika Menggunakan XAMPP di Windows:
1. Berita kerentanan PHP terbaru (CVE-2024-4577) menyerang server Windows yang menjalankan PHP lewat mode CGI di Apache.
2. Karena aplikasi ini statis, Anda sebenarnya **tidak membutuhkan modul PHP di XAMPP**. Anda cukup menggunakan web server statis, atau pastikan XAMPP diperbarui ke versi PHP terbaru (PHP 8.1.29+, 8.2.20+, atau 8.3.8+).
3. Pastikan file `.htaccess` yang telah disediakan tetap berada di folder web Anda (`htdocs`).

### Jika Menggunakan Nginx:
Tambahkan aturan berikut di blok `server` Nginx Anda untuk mematikan eksekusi PHP pada direktori aplikasi:

```nginx
server {
    listen 80;
    server_name ujian.sekolah.sch.id;
    root /var/www/AplikasiUlangan;
    index index.html;

    # Blokir akses ke file tersembunyi (.git, .env, dll)
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    # Blokir akses ke file database dan konfigurasi
    location ~* \.(sql|md|log|ini|conf|env|bak)$ {
        deny all;
    }

    # Blokir eksekusi skrip PHP
    location ~* \.(php|phtml|php[0-9]|cgi|pl|sh)$ {
        deny all;
        return 403;
    }

    # Layani file statis secara langsung
    location / {
        try_files $uri $uri/ =404;
    }
}
```

### Opsi Hosting Paling Aman (100% Zero-Server Risk):
Karena aplikasi ini 100% statis, Anda dapat menghostingnya langsung secara **gratis, tanpa server PHP**, dan kebal dari serangan server-side menggunakan:
- **Cloudflare Pages** (Sangat cepat dan gratis)
- **Vercel** / **Netlify**
- **GitHub Pages** (Langsung dari repository GitHub Anda)

Dengan opsi ini, Anda tidak perlu mengelola server lokal, tidak ada PHP sama sekali, dan server sekolah Anda tidak bisa dibobol melalui celah PHP.
