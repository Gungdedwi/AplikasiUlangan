---
name: ui-ulangan
description: Gunakan saat mengedit tampilan, CSS, layout sidebar, atau halaman HTML di aplikasi Ulangan Digital agar konsisten dengan tema putih-biru, responsif, dan aturan proyek vanilla.
---

# UI & Konvensi Kode – Aplikasi Ulangan Digital

- Stack: HTML/CSS/vanilla JS saja. Dilarang menambah framework, `package.json`, atau build tool kecuali diminta. Hindari CDN baru kecuali perlu (saat ini: supabase-js, SheetJS).
- Gaya di `css/style.css`; pakai variabel/kelas yang ada sebelum membuat yang baru. Tema putih–biru modern.
- Layout/sidebar dirender oleh `js/layout.js`; halaman baru ikut pola halaman yang ada (urutan script: supabase CDN → storage → utils → auth → layout/exam).
- Responsif 320px–desktop. Navigasi mobile ujian memakai `.btn-mobile-nav`; jangan memakai `display:none` inline untuk elemen yang perlu tampil di mobile.
- Modal dipasang ke `body` dengan z-index tinggi agar tidak terpotong sidebar.
- Deklarasikan variabel state di awal script halaman (hindari TDZ ReferenceError).
- Bahasa UI: Indonesia.
- Komentar: tidak di dua baris pertama file; gunakan heading ringkas `// ── Nama ──`; JSDoc hanya bila perlu.
- Setelah mengubah file JS, naikkan query version (`?v=`) di tag script bila halaman memakainya agar cache browser diperbarui.
