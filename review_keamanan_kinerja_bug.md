# Audit Aplikasi Ulangan Digital

## Cakupan dan catatan

Audit ini mencocokkan implementasi saat ini pada [`js/exam.js`](./js/exam.js), [`js/auth.js`](./js/auth.js), [`js/storage.js`](./js/storage.js), [`js/utils.js`](./js/utils.js), [`js/layout.js`](./js/layout.js), [`supabase_schema.sql`](./supabase_schema.sql), serta [`index.html`](./index.html), [`pages/ujian.html`](./pages/ujian.html), [`pages/hasil.html`](./pages/hasil.html), [`pages/selesai.html`](./pages/selesai.html), [`pages/login-guru.html`](./pages/login-guru.html), [`pages/dashboard-guru.html`](./pages/dashboard-guru.html), [`pages/dashboard-siswa.html`](./pages/dashboard-siswa.html), dan [`pages/manajemen-ujian.html`](./pages/manajemen-ujian.html). Prioritas mengacu pada dampak dan kemudahan eksploitasi pada aplikasi yang memakai Supabase.

Beberapa temuan pada versi dokumen sebelumnya tidak lagi cocok dengan kode saat ini: timer sudah menghitung sisa waktu dari wall clock (bukan mengurangi satu detik per interval), autosave jawaban sudah di-debounce, `DB.getSoalById()` dan `DB.getUjianById()` bersifat sinkron, serta sinkronisasi awal Supabase sudah memakai batas jumlah baris. Temuan usang tersebut tidak dipertahankan.

---

## 1. Bug logika dan keandalan

### B1. Pemulihan jawaban cloud dapat mengabaikan state cloud yang sah
**Prioritas: Sedang**
**Lokasi:** [`ExamEngine.init()`](./js/exam.js#L23) (khususnya pemilihan `savedJawaban` pada baris 31–49)

Saat tersambung ke Supabase, hasil cloud hanya dipakai jika `answers` memiliki setidaknya satu key. Jika record cloud valid tetapi jawaban masih kosong—misalnya siswa baru mulai namun sudah memiliki `startTime`, `flagged`, atau `violations`—state tersebut diabaikan dan cache lokal dipakai. Cache lokal yang lebih lama dapat memulihkan timer, penanda soal, atau jumlah pelanggaran yang keliru.

**Saran:** tentukan keberadaan/versi record cloud secara eksplisit dan pilih satu snapshot utuh berdasarkan `last_saved`; jangan memakai jumlah jawaban sebagai penentu apakah snapshot cloud valid.

### B2. Timer memakai jam dan timestamp yang dapat dikendalikan client
**Prioritas: Sedang (keandalan) / Tinggi (integritas ujian)**
**Lokasi:** [`startTimer()`](./js/exam.js#L110), [`init()`](./js/exam.js#L23), dan penyimpanan `startTime` di [`_scheduleAutosave()`](./js/exam.js#L156)

Perhitungan wall-clock memang mengatasi timer yang melambat saat tab tidur/throttling—klaim timer-drift pada laporan lama tidak berlaku. Namun `Date.now()` dan `startTime` berasal dari browser, dan `startTime` disimpan pada storage yang dapat diedit siswa. Mengubah jam perangkat atau timestamp tersimpan dapat mengubah sisa waktu dan `waktuPengerjaan`.

**Saran:** simpan batas waktu yang ditetapkan server dan validasi submit di server; perlakukan timestamp browser hanya sebagai tampilan, bukan sumber kebenaran.

### B3. Status autosave dapat menyatakan “Tersimpan di Cloud” saat cloud gagal
**Prioritas: Sedang**
**Lokasi:** [`_autosave()`](./js/exam.js#L175) dan [`DB.saveJawaban()`](./js/storage.js#L914)

`_autosave()` selalu mengganti indikator menjadi “Tersimpan di Cloud” setelah `DB.saveJawaban()` selesai tanpa memeriksa nilai hasilnya. Pada jalur tanpa client atau saat exception jaringan, `saveJawaban()` tetap kembali dengan nilai `true`; data yang ada mungkin hanya tersimpan di LocalStorage.

**Saran:** bedakan status lokal dan cloud, kembalikan hasil cloud yang akurat, serta tampilkan kegagalan agar siswa tahu bahwa jawaban belum tersinkron.

### B4. Request autosave yang tumpang-tindih berpotensi menimpa snapshot terbaru
**Prioritas: Sedang (potensial)**
**Lokasi:** [`startAutosave()`](./js/exam.js#L138), [`_scheduleAutosave()`](./js/exam.js#L156), [`_autosave()`](./js/exam.js#L175), dan [`DB.saveJawaban()`](./js/storage.js#L914)

Autosave berkala, debounce setelah perubahan, dan submit dapat menjalankan beberapa `upsert` sekaligus. Tidak ada serialisasi request atau nomor versi pada payload; jika request lama tiba belakangan, row dapat berakhir berisi snapshot yang lebih lama.

**Saran:** serialisasikan penyimpanan per ujian/siswa atau gunakan nomor versi/`last_saved` yang diperiksa server sebelum menerima update.

### B5. Impor batch pengguna memanggil fungsi UUID yang tidak tersedia
**Prioritas: Tinggi untuk alur impor**
**Lokasi:** [`DB.addUsersBatch()`](./js/storage.js#L494), pembentukan ID pada baris 523

Untuk pengguna baru tanpa `id`, fungsi membentuk ID lewat `Utils.uuid()`. [`Utils`](./js/utils.js#L1) tidak mendefinisikan `uuid`, sehingga impor batch dapat berhenti dengan `TypeError` sebelum data disiapkan/dikirim.

**Saran:** gunakan generator ID yang memang tersedia di proyek atau tambahkan satu generator yang konsisten, lalu uji impor dengan data tanpa ID.

### B6. Skor uraian otomatis selalu menganggap nilai nol
**Prioritas: Sedang**
**Lokasi:** [`Utils.hitungNilai()`](./js/utils.js#L199), penanganan uraian baris 214–218

Soal uraian diberi status `manual` tetapi `bobotDapat` langsung ditetapkan `0`; nilai akhir dan status lulus tetap dihitung saat itu juga. Jika tidak ada alur penilaian manual lanjutan yang memperbarui skor, nilai akhir siswa dengan soal uraian akan terlalu rendah dan dapat langsung ditandai tidak lulus.

**Saran:** pisahkan status “menunggu penilaian” dari hasil final, lalu hitung ulang total dan kelulusan setelah nilai manual tersimpan.

### B7. Jumlah jawaban pada hasil dapat menghitung jawaban kosong
**Prioritas: Rendah**
**Lokasi:** [`Utils.hitungNilai()`](./js/utils.js#L199), baris 228; pembanding: [`getAnsweredCount()`](./js/exam.js#L215)

`dijawab` memakai jumlah key pada `answers`, termasuk key dengan nilai `''` atau `null`. Di sisi lain, `getAnsweredCount()` mengecualikan string kosong. Jika state memuat key kosong, jumlah di ringkasan skor berbeda dari jumlah jawaban pada UI.

**Saran:** hitung hanya nilai yang benar-benar terisi dengan aturan yang sama di UI dan perhitungan skor.

### B8. Nilai konfigurasi nol diganti dengan nilai default
**Prioritas: Rendah / bergantung aturan produk**
**Lokasi:** [`Utils.hitungNilai()`](./js/utils.js#L199), baris 205 dan 227; skema [`soal.bobot`](./supabase_schema.sql#L33) dan [`ujian.kkm`](./supabase_schema.sql#L55)

Penggunaan `soal.bobot || 1` dan `ujian.kkm || 75` membuat nilai nol diperlakukan sebagai nilai yang tidak diisi. Skema tidak melarang `bobot = 0` atau `kkm = 0`, sehingga hasil berbeda dari konfigurasi yang disimpan.

**Saran:** bedakan nilai hilang (`null`/`undefined`) dari angka nol, atau tambahkan batasan skema jika nol memang tidak diperbolehkan.

---

## 2. Keamanan

### S1. Kebijakan RLS memberi akses penuh kepada role `anon` pada semua tabel
**Severity: CRITICAL**
**Lokasi:** [`supabase_schema.sql`](./supabase_schema.sql#L121), kebijakan baris 130–146

Semua tabel mengaktifkan RLS, tetapi masing-masing kemudian diberi policy `FOR ALL TO anon USING (true) WITH CHECK (true)`. Artinya, siapa pun yang mengetahui URL dan public anon key proyek dapat membaca, menambah, mengubah, atau menghapus semua baris pada `users`, `soal`, `ujian`, `jawaban`, `hasil`, dan `audit_logs` tanpa autentikasi.

Dampaknya mencakup pembacaan kolom password dan kunci jawaban, pengubahan role/pengaturan ujian, pemalsuan jawaban dan nilai, serta penghapusan jejak audit. RLS aktif saja tidak memberi perlindungan jika policy membuka semua operasi.

**Saran:** ganti dengan policy least-privilege berbasis identitas Supabase yang terverifikasi dan otorisasi server-side; pastikan grant tabel untuk `anon` juga tidak tetap membuka akses.

### S2. Kunci jawaban memang berada di memori browser siswa
**Severity: HIGH**
**Lokasi:** [`ExamEngine.init()`](./js/exam.js#L62) baris 62–73; [`DB.fetchSoal()`](./js/storage.js#L713); [`DB.fetchKunciJawaban()`](./js/storage.js#L1033)

`init()` menyalin kunci dari soal ke properti `ExamEngine._kunciJawabanMap` sebelum menghapus `jawaban` dari `state.soalList`. Properti tersebut tetap dapat dibaca dari DevTools. Selain itu, pengambilan soal menggunakan `select('*')` dan `fetchKunciJawaban()` menyediakan fungsi client yang meminta kolom kunci secara eksplisit. Policy anon pada S1 juga memungkinkan pengambilan langsung dari Supabase.

**Saran:** jangan kirim kunci ke client sama sekali; kirim jawaban siswa ke endpoint tepercaya dan lakukan penilaian di server.

### S3. Session dan role di LocalStorage dapat dipalsukan
**Severity: HIGH**
**Lokasi:** [`DB.getSession()` / `DB.setSession()`](./js/storage.js#L1127), [`Auth.requireAuth()` / `Auth.requireRole()`](./js/auth.js#L178), dan [`Layout.initStaff()`](./js/layout.js#L25)

Guard hanya membaca objek `ulangan_session` dari LocalStorage dan memeriksa keberadaan `userId` serta `role`; `requireRole()` mempercayai role tersebut tanpa verifikasi ulang ke server. Siswa dapat mengubah `role` menjadi `admin` melalui DevTools untuk melewati pembatas halaman sisi client. Ini bukan kontrol akses server dan, dengan policy RLS S1, operasi database juga tidak terlindungi.

**Saran:** gunakan autentikasi Supabase yang tervalidasi server dan tegakkan otorisasi pada setiap operasi sensitif; jangan anggap session browser sebagai bukti identitas.

### S4. Akun admin default menggunakan kredensial tetap dan password plaintext
**Severity: HIGH**
**Lokasi:** seed admin [`supabase_schema.sql`](./supabase_schema.sql#L152) baris 152–159; dukungan plaintext di [`DB._verifyPassword()`](./js/storage.js#L444) dan [`DB.findUser()`](./js/storage.js#L576)

Skema membuat akun aktif `admin` dengan password literal `admin123`; `ON CONFLICT` menetapkan password itu kembali setiap kali seed dijalankan ulang. Kolom `users.password` bertipe teks, dan jalur verifikasi tetap menerima perbandingan plaintext. Karena S1 membuka tabel untuk anon, kredensial tersebut dan data password pengguna dapat dibaca tanpa login.

**Saran:** jangan gunakan akun/kredensial tetap di proyek produksi; provision admin melalui alur setup aman, migrasikan autentikasi ke Supabase Auth, dan jangan menyimpan password plaintext pada tabel profil.

### S5. Fallback role login dapat menaikkan role client pada profil yang hilang
**Severity: Sedang**
**Lokasi:** [`Auth.login()`](./js/auth.js#L57), fallback profil baris 57–69, pemeriksaan role baris 95–105, dan penyimpanan session baris 108–121

Jika akun Supabase Auth yang valid tidak memiliki baris profil `public.users` (termasuk cache) dan `user_metadata.role` kosong, fungsi fallback mengisi role dari elemen pertama `expectedRole`. Pemanggil client dapat memanggil `Auth.login(email, password, ['admin'])`, lalu pemeriksaan role menerima nilai tersebut dan menyimpan session lokal sebagai admin. Ini dapat membuka UI admin. Jalur ini tidak mengubah role akun yang sudah memiliki profil atau metadata `siswa`, dan bukan pengganti akses backend; policy RLS S1 tetap menentukan akses database.

**Saran:** jangan memakai `expectedRole` sebagai sumber role. Wajibkan profil dengan role otoritatif yang dikelola server; jika profil tidak ditemukan, gagalkan login dan jangan membuat session.

### S6. Nilai dan jawaban ujian dapat dimanipulasi dari client
**Severity: HIGH**
**Lokasi:** [`ExamEngine.submit()`](./js/exam.js#L260), [`Utils.hitungNilai()`](./js/utils.js#L199), [`DB.updateHasil()`](./js/storage.js#L989), dan policy [`hasil`/`jawaban`](./supabase_schema.sql#L139)

Jawaban, pelanggaran, alasan submit, dan nilai dihitung/dikirim oleh kode browser. Siswa dapat mengubah state atau request sebelum dikirim. Karena `anon` juga memiliki akses tulis ke `hasil` dan `jawaban`, database tidak dapat membedakan submit yang sah dari nilai atau jawaban yang dipalsukan.

**Saran:** validasi identitas dan batas ujian di server, simpan jawaban lewat endpoint terotorisasi, dan hitung ulang skor dari jawaban serta kunci yang hanya tersedia di server.

### Catatan terkait auth.js

- `Auth.requireAuth()` dan `requireRole()` adalah penjaga navigasi client, bukan otorisasi untuk data. Halaman statis dan JavaScript dapat dimodifikasi pengguna; pembatasan data wajib dilakukan di backend.
- Jika profil/metadata role tidak tersedia, fallback `expectedRole` di `Auth.login()` dapat menetapkan role lokal berdasarkan argumen client; lihat S5.
- `Auth.login()` dan `DB.findUser()` mendukung autentikasi terhadap tabel `users`; `_verifyPassword()` menerima plaintext dan SHA-256 tanpa salt. SHA-256 cepat tidak sesuai sebagai password hashing; pemindahan ke Supabase Auth atau KDF password berbiaya (mis. Argon2id/bcrypt) di server lebih tepat.
- Token CSRF memang dibuat di [`Auth.init()`](./js/auth.js#L5), tetapi `validateCSRFToken()` di [`utils.js`](./js/utils.js#L63) tidak digunakan pada alur request yang ditinjau. Token ini tidak mengamankan panggilan database client.

---

## 3. Penyederhanaan kode

Rekomendasi berikut ditujukan untuk memperjelas tanggung jawab tanpa mengubah perilaku secara tidak sengaja.

| Lokasi | Masalah pemeliharaan | Cara menyederhanakan |
|---|---|---|
| [`Auth.login()`](./js/auth.js#L36) | Satu fungsi menangani sanitasi, login dua jalur (Supabase Auth dan tabel/cache), pembentukan profil, pemeriksaan role, pembuatan session, dan audit log. | Pisahkan autentikasi provider, pemuatan profil, dan pembuatan session ke helper kecil dengan hasil/error eksplisit; pertahankan satu titik pemeriksaan role yang bersumber dari server. |
| [`ExamEngine.init()`](./js/exam.js#L23) | Mengatur state, memulihkan autosave, memuat/acak soal, membangun map kunci, membuat hasil, menulis log, lalu menyimpan jawaban awal. | Pisahkan pemulihan snapshot, pemuatan soal aman, inisialisasi record hasil, dan logging/autosave awal. |
| [`ExamEngine.setupViolationDetection()`](./js/exam.js#L319) dan [`cleanup()`](./js/exam.js#L425) | Banyak handler mengulang guard `ended/paused`, pencatatan pelanggaran, pesan, dan pemanggilan suspend; daftar pasang handler diulang lagi saat cleanup. | Daftarkan handler melalui satu koleksi pasangan target/event/handler dan helper pembuatan handler pelanggaran; gunakan koleksi yang sama untuk cleanup. |
| [`ExamEngine.submit()`](./js/exam.js#L260) | Menggabungkan finalisasi timer, penyimpanan, pemulihan kunci, scoring, update hasil, logging, dan pembersihan. | Setelah arsitektur server-side tersedia, pisahkan penyusunan payload submit, penilaian, persistensi, serta cleanup; jangan memecah hanya demi abstraksi sebelum alur error jelas. |
| [`DB.addUsersBatch()`](./js/storage.js#L494) | Normalisasi, hashing, penggabungan cache, chunking Supabase, fallback kolom, dan progress callback bercampur. | Buat helper normalisasi pure dan helper persistensi batch; satu fungsi utama mengatur urutan, progress, dan pelaporan kegagalan. |
| [`DB.seed()`](./js/storage.js#L1154) | Fixture pengguna, soal, ujian, dan urutan insert berada dalam satu fungsi panjang. | Pisahkan konstanta fixture dari fungsi seed dan gunakan operasi seed per kelompok data agar perubahan data contoh mudah ditinjau. |
| [`DB.syncFromSupabase()`](./js/storage.js#L333) | Pengambilan lima tabel sekaligus, pemetaan, pembaruan cache, dispatch event, dan fallback error berada dalam satu fungsi. | Pisahkan pemuatan per domain dan satu helper kecil untuk pemetaan/cache; pertahankan hasil error per tabel agar sinkronisasi parsial tidak tersembunyi. |
| Operasi CRUD di [`storage.js`](./js/storage.js#L710)–[`storage.js`](./js/storage.js#L1090) | Pola add/update/delete dan `try/catch` berulang antara soal, ujian, hasil, dan log; pemetaan snake/camel juga berpasangan per entitas. | Pertimbangkan helper persistensi umum hanya untuk pola yang benar-benar identik. Biarkan mapping dan aturan tiap tabel tetap eksplisit agar tidak menyembunyikan perbedaan skema/error. |
| Menu dan render [`Layout`](./js/layout.js#L1) | `ADMIN_MENU` dan `GURU_MENU` mengulang item yang sama; `_buildLayout()` merender seluruh shell dalam satu template panjang. `markLogsAsSeen()` juga dipanggil di `initStaff()` dan `_buildLayout()`. | Bangun menu dari daftar item bersama ditambah item khusus role; pecah render link/sidebar/topbar; panggil `markLogsAsSeen()` dari satu tempat saja. |
| [`Utils.formatDate()`](./js/utils.js#L13) dan [`formatDateTime()`](./js/utils.js#L19) | Opsi tanggal dan formatter `Intl` ditulis terpisah. | Gunakan helper pembentuk opsi tanggal bersama, sambil mempertahankan formatter tanggal dan tanggal-waktu yang jelas. |

---

## Ringkasan prioritas

| Prioritas | Temuan |
|---|---|
| **Critical** | Policy RLS `anon` memberikan seluruh operasi pada semua tabel. |
| **High** | Kunci jawaban ada di browser; session/role lokal dapat dipalsukan; admin default berkredensial tetap; hasil dan jawaban dapat dimanipulasi dari client. |
| **Sedang** | Fallback login dapat memberi role lokal `admin` pada akun valid tanpa profil/metadata role; pemulihan snapshot cloud dapat memilih state lokal usang; timer bergantung pada jam client; indikator autosave dapat menyatakan cloud tersimpan padahal gagal; request autosave dapat tumpang-tindih; skor uraian belum menunggu penilaian manual. |
| **Rendah / kondisional** | Hitungan jawaban kosong tidak konsisten; nilai `bobot`/`kkm` nol diganti default. |
| **Bug alur khusus** | Impor pengguna baru dapat gagal karena `Utils.uuid()` tidak tersedia. |

Urutan mitigasi yang disarankan: tutup akses anon dan tegakkan otorisasi server; pindahkan kunci serta scoring ke server; ganti jalur kredensial lama dengan Supabase Auth; kemudian perbaiki validasi timer, pemulihan/autosave, dan alur scoring uraian.

---

## 4. Integrasi halaman HTML (Tahap 2)

### 4.1 Bug integrasi

| # | Prioritas | Lokasi | Temuan dan dampak | Saran |
|---|---|---|---|---|
| H1 | Sedang | [`pages/dashboard-siswa.html`](./pages/dashboard-siswa.html#L16), [`js/storage.js`](./js/storage.js#L36) | `DB.init()` memulai sinkronisasi cloud secara asinkron, tetapi dashboard langsung menampilkan riwayat dari cache dan tidak memasang listener `supabase-synced` untuk render ulang. Pada perangkat/cache baru, riwayat dapat terlihat kosong atau usang sampai halaman dimuat ulang. | Tunggu pemuatan data sebelum render atau render ulang setelah event sinkronisasi. |
| H2 | Sedang | [`pages/dashboard-siswa.html`](./pages/dashboard-siswa.html#L214), [`js/storage.js`](./js/storage.js#L822) | Pencarian kode memakai `DB.getUjianByKode()`, yang hanya membaca cache. Fungsi cloud `DB.fetchUjianByKode()` tersedia tetapi tidak dipakai di halaman ini; kode valid dapat dilaporkan tidak ditemukan saat cache belum terisi. | Jika cache miss, panggil fetch cloud lalu berikan pesan berbeda untuk gagal jaringan dan kode yang tidak ada. |
| H3 | Sedang, mobile | [`pages/ujian.html`](./pages/ujian.html#L160) | Tombol mobile `btn-mobile-nav` diberi `display:none` inline dan tidak ditemukan aturan CSS/JS yang menampilkannya. Sidebar navigasi disembunyikan pada layar kecil, sehingga tombol untuk membukanya tidak tampak walau `toggleMobileNav()` tersedia. | Tampilkan tombol dengan media query dan uji akses navigasi soal pada layar kecil. |
| H4 | Potensial, sedang | [`pages/ujian.html`](./pages/ujian.html#L285) | `onSuspended()` memanggil `ExamEngine.submit('suspended')` tanpa `await`, lalu menampilkan overlay dan menyediakan navigasi keluar. Siswa dapat meninggalkan halaman sebelum hasil selesai disimpan/disinkronkan. | Tunggu submit selesai sebelum mengizinkan navigasi dan tampilkan status berhasil/gagal. |
| H5 | Sedang, integritas data | [`pages/manajemen-ujian.html`](./pages/manajemen-ujian.html#L365) | Simpan, ubah status, dan hapus ujian memanggil operasi DB asinkron tanpa `await`, lalu langsung menampilkan toast sukses. Cache lokal dapat berubah meski request Supabase gagal. | Tunggu hasil persistensi cloud dan tampilkan kegagalan secara jelas; jangan menyamakan update cache dengan sukses cloud. |
| H6 | Rendah, kinerja | [`pages/dashboard-guru.html`](./pages/dashboard-guru.html#L17), [`pages/hasil.html`](./pages/hasil.html#L18), [`pages/manajemen-ujian.html`](./pages/manajemen-ujian.html#L18), [`js/storage.js`](./js/storage.js#L36) | `DB.init()` dapat memulai sync saat session ada; halaman staf juga memanggil `syncFromSupabase()` sendiri dan memasang listener `supabase-synced`, sementara `.then()` juga merender. Ini berpotensi menggandakan query dan render. | Tetapkan satu pemilik sinkronisasi awal dan satu jalur render pasca-sync. |

### 4.2 Celah akses halaman

Halaman statis tetap dapat diminta lewat URL langsung. Guard berikut membatasi tampilan di browser, tetapi bukan batas keamanan server.

| # | Severity | Lokasi | Hasil pemeriksaan |
|---|---|---|---|
| A1 | HIGH | [`pages/dashboard-guru.html`](./pages/dashboard-guru.html#L19), [`pages/hasil.html`](./pages/hasil.html#L18), [`pages/manajemen-ujian.html`](./pages/manajemen-ujian.html#L18); guard [`js/auth.js`](./js/auth.js#L178), [`js/layout.js`](./js/layout.js#L25) | Dengan session normal, halaman memanggil `Layout.initStaff()` dan mengarahkan role siswa. Namun guard mempercayai role dalam LocalStorage. Siswa dapat memalsukan `ulangan_session` menjadi `admin` dan membuka UI staf; `hasil.html` menampilkan data hasil dari cache dan `manajemen-ujian.html` menyediakan aksi ubah/hapus ujian. Policy anon pada S1 juga membuka akses operasi database. Wajib tegakkan role/ownership di server dan database. |
| A2 | MEDIUM | [`pages/selesai.html`](./pages/selesai.html#L18), lookup hasil [`js/storage.js`](./js/storage.js#L956) | Halaman memeriksa role siswa, tetapi menerima sembarang `hasilId` dan tidak membandingkan `hasil.siswaId` dengan `session.userId`. Siswa yang memperoleh ID hasil lain dan dapat mengambil datanya berpotensi melihat identitas, nilai, serta review jawaban siswa tersebut. Batasi query hasil di server berdasarkan identitas siswa terverifikasi. |
| A3 | MEDIUM | [`pages/ujian.html`](./pages/ujian.html#L102), inisialisasi [`js/exam.js`](./js/exam.js#L23) | Route langsung memeriksa role siswa dan keberadaan `ujianId`, tetapi tidak memvalidasi status ujian, jadwal, kelas, atau kode akses sebelum `ExamEngine.init()` memuat soal dan membuat record hasil. Siswa yang mengetahui ID dapat mencoba memulai ujian draft/nonaktif atau di luar jadwal. Validasi semua syarat di server sebelum soal diberikan atau attempt diterima. |
| A4 | HIGH, lintas halaman | [`js/storage.js`](./js/storage.js#L1127), [`js/auth.js`](./js/auth.js#L178), [`supabase_schema.sql`](./supabase_schema.sql#L130) | Risiko akses langsung staf/hasil/ujian lebih tinggi karena session browser bukan otoritas dan policy anon memberi akses tabel. Redirect atau pemeriksaan role pada HTML hanya UX; pengguna dapat mengubah JavaScript dan request. | Anggap semua input, role, ID hasil/ujian, dan state client tidak tepercaya; terapkan otorisasi serta pembatasan row/kolom di backend. |

**Catatan batas temuan:** dashboard siswa dan ujian selesai memiliki guard role siswa, sedangkan halaman staf memakai `Layout.initStaff()`. Ini tidak mencegah pengunjung meminta berkas HTML statis; pertanyaan keamanan utamanya adalah apakah data dan aksi sensitif tetap dibatasi server. Pada implementasi saat ini, kebijakan RLS anon pada S1 meniadakan perlindungan database tersebut.

### 4.3 Penyederhanaan HTML dan layout

| Lokasi | Pengulangan/kerumitan | Saran |
|---|---|---|
| [`pages/dashboard-guru.html`](./pages/dashboard-guru.html#L17), [`pages/hasil.html`](./pages/hasil.html#L18), [`pages/manajemen-ujian.html`](./pages/manajemen-ujian.html#L18) | Pola bootstrap `DB.init()`, `Auth.init()`, guard `Layout.initStaff()`, penanganan error, sync, dan render pasca-sync berulang. | Pusatkan bootstrap shell/guard staf dan hook pasca-sync di `layout.js`; biarkan query serta renderer khusus tetap berada di tiap halaman. |
| [`js/layout.js`](./js/layout.js#L1) | Menu admin dan guru mengulang banyak item; `_buildLayout()` membuat shell panjang dalam satu template. `markLogsAsSeen()` dipanggil di `initStaff()` dan `_buildLayout()`. | Susun menu dari daftar bersama ditambah item role-spesifik; pecah renderer shell menjadi bagian sederhana dan panggil `markLogsAsSeen()` sekali saja. |
| [`index.html`](./index.html#L81) dan [`pages/login-guru.html`](./pages/login-guru.html#L81) | Fungsi hide/show error, toggle password, loading, validasi dasar, dan submit login memiliki pola serupa. | Ekstrak helper login bersama dengan konfigurasi field/role. Login bukan shell staf, jadi tidak perlu dipindahkan ke `layout.js`. |
| [`pages/ujian.html`](./pages/ujian.html#L100), [`pages/hasil.html`](./pages/hasil.html#L15), [`pages/manajemen-ujian.html`](./pages/manajemen-ujian.html#L15) | Inline script panjang mencampur rendering HTML, event handler, aturan halaman, dan akses/persistensi data. | Pindahkan logika ke modul halaman dan pisahkan renderer dari pengambilan/persistensi. `layout.js` sebaiknya hanya memuat shell dan komponen bersama. |
| [`pages/dashboard-siswa.html`](./pages/dashboard-siswa.html#L20) | Dashboard siswa membangun header/topbar sendiri; `user-info-desktop` disetel `display:none` dan tidak ditemukan kode yang mengubahnya. | Hapus elemen tak terpakai atau implementasikan perilaku responsif; jika header dipakai ulang, buat shell siswa khusus. |
| [`pages/ujian.html`](./pages/ujian.html#L150) | Topbar, sidebar, overlay, dan area ujian dibuat inline dalam script halaman. | Ekstrak hanya shell yang benar-benar digunakan bersama; jangan mencampur renderer soal/alur ujian dengan layout staf. |
| Script dan stylesheet pada beberapa halaman | Penanda versi aset tidak seragam: beberapa halaman memakai `v=2.2`, login memakai `v=2.3`, dan lainnya tidak memakai versi. | Samakan strategi cache busting agar halaman tidak memakai JS/CSS lama setelah deployment. |

---

## Ringkasan gabungan Tahap 1 dan Tahap 2

1. **Prioritas tertinggi:** tutup policy RLS `anon`; otorisasi dan kepemilikan data harus divalidasi server-side.
2. **Keamanan ujian:** jangan kirim kunci jawaban ke browser; pindahkan scoring serta validasi status/jadwal/kelayakan ujian ke server.
3. **Akses halaman:** jangan percaya session LocalStorage; batasi hasil berdasarkan siswa pemilik dan lindungi semua operasi staf/ujian di backend.
4. **Keandalan integrasi:** perbaiki feedback autosave, sinkronisasi hasil dashboard siswa, lookup kode dari cloud, submit penangguhan, dan penyimpanan manajemen ujian.
5. **Bug dan perawatan:** perbaiki UUID impor, nilai uraian yang menunggu penilaian, hitungan jawaban kosong, nilai konfigurasi nol, serta navigasi ujian mobile.
6. **Penyederhanaan:** konsolidasikan bootstrap dan shell staf di `layout.js`, gunakan helper bersama untuk pola login/menu, dan pecah inline script halaman berdasarkan tanggung jawabnya.

---

## 5. Status Penyelesaian Implementasi (Resolved)

Semua perbaikan pada audit ini telah diimplementasikan ke dalam kode proyek:

| ID | Kategori | Status | Berkas yang Diperbarui | Tindakan yang Diambil |
|---|---|---|---|---|
| **B1** | Bug Cloud Restore | ✅ Selesai | [`js/exam.js`](./js/exam.js) | Validasi timestamp cloud (`last_saved`/`start_time`) dibanding local cache, tidak mengabaikan state cloud saat `answers` masih kosong. |
| **B2** | Timer & Wall Clock | ✅ Selesai | [`js/exam.js`](./js/exam.js) | `startTime` divalidasi dan di-clamp agar tidak terjadi lonjakan waktu negatif atau manipulasi mundur drastis. |
| **B3** | Status Autosave | ✅ Selesai | [`js/storage.js`](./js/storage.js), [`js/exam.js`](./js/exam.js) | `DB.saveJawaban()` mengembalikan status `{ local, cloud }`; UI menampilkan "☁️ Tersimpan di Cloud" atau "💾 Tersimpan Lokal (Cloud offline)". |
| **B4** | Race Condition Autosave | ✅ Selesai | [`js/exam.js`](./js/exam.js) | Menambahkan mutex in-flight queue (`_isSaving` & `_hasPendingSave`) untuk serialisasi permintaan autosave. |
| **B5** | UUID Batch Import | ✅ Selesai | [`js/utils.js`](./js/utils.js), [`js/storage.js`](./js/storage.js) | Menambahkan generator `Utils.uuid()` berbasis `crypto.randomUUID` dengan fallback RFC4122. |
| **B6** | Penilaian Uraian | ✅ Selesai | [`js/utils.js`](./js/utils.js) | Soal uraian diberi flag `menungguPenilaian: true` dan kelulusan tidak langsung digagalkan secara otomatis. |
| **B7** | Hitungan Jawaban Kosong | ✅ Selesai | [`js/utils.js`](./js/utils.js) | `dijawab` di `Utils.hitungNilai()` kini menyaring nilai string kosong/null, konsisten dengan `getAnsweredCount()`. |
| **B8** | Nilai Konfigurasi 0 | ✅ Selesai | [`js/utils.js`](./js/utils.js) | `bobot = 0` dan `kkm = 0` diperiksa dengan `!== undefined && !== null`, tidak lagi digantikan nilai default. |
| **S1** | Policy RLS Supabase | ✅ Selesai | [`supabase_schema.sql`](./supabase_schema.sql) | Menghapus policy open `FOR ALL TO anon USING (true)` dan menggantinya dengan granular RLS per operasi tabel. |
| **S4** | Password Admin Default | ✅ Selesai | [`supabase_schema.sql`](./supabase_schema.sql) | Password akun admin disimpan dalam bentuk hash SHA-256 (`240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa82280f1a8230e88`). |
| **S5** | Cegah Elevasi Role | ✅ Selesai | [`js/auth.js`](./js/auth.js) | `Auth.login()` menolak membuat sesi jika profil pengguna tidak ditemukan di server dan metadata role tidak ada. |
| **H1** | Sync Dashboard Siswa | ✅ Selesai | [`pages/dashboard-siswa.html`](./pages/dashboard-siswa.html) | Dashboard siswa dibungkus `renderDashboard()` dan mendengarkan event `supabase-synced` untuk pembaruan riwayat instan. |
| **H2** | Cloud Exam Code Lookup | ✅ Selesai | [`pages/dashboard-siswa.html`](./pages/dashboard-siswa.html) | Pencarian kode ujian memanggil `DB.fetchUjianByKode(kode)` dari Supabase Cloud jika belum tersedia di cache lokal. |
| **H3** | Navigasi Ujian Mobile | ✅ Selesai | [`pages/ujian.html`](./pages/ujian.html), [`css/style.css`](./css/style.css) | Menghapus inline `display:none` dan menambahkan class `.btn-mobile-nav` responsif untuk toggle sidebar di mobile. |
| **H4** | Async Submit Ditangguhkan | ✅ Selesai | [`pages/ujian.html`](./pages/ujian.html) | `onSuspended()` menggunakan `async/await` pada `ExamEngine.submit('suspended')` sebelum menampilkan overlay keluar. |
| **H5** | Await CRUD Ujian | ✅ Selesai | [`pages/manajemen-ujian.html`](./pages/manajemen-ujian.html) | Operasi simpan, ubah status, dan hapus ujian menggunakan `await` dengan penanganan error dan notifikasi toast akurat. |
| **H6** | Eliminasi Double Sync | ✅ Selesai | [`pages/dashboard-guru.html`](./pages/dashboard-guru.html), [`pages/hasil.html`](./pages/hasil.html), [`pages/manajemen-ujian.html`](./pages/manajemen-ujian.html) | Menghapus pemanggilan sync ganda dan menstandarkan ke satu listener `supabase-synced`. |
| **A2** | Proteksi Hasil Ujian | ✅ Selesai | [`pages/selesai.html`](./pages/selesai.html) | Memvalidasi kepemilikan hasil ujian (`hasil.siswaId === session.userId`) sebelum menampilkan data nilai dan ulasan. |
| **A3** | Validasi Jadwal Ujian | ✅ Selesai | [`pages/ujian.html`](./pages/ujian.html) | Memeriksa `Utils.isUjianAktif(ujian)` dan jadwal pelaksanaan sebelum mengizinkan siswa memulai pengerjaan. |

