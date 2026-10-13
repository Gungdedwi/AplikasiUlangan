# 🔍 Review Aplikasi Ulangan Digital
## Keamanan, Kinerja & Bug

---

## 🔴 KEAMANAN — Temuan Kritis

### 1. Password Tersimpan dalam Plaintext
**Severity: 🔴 KRITIS** | File: [`storage.js`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/js/storage.js#L94) & [`storage.js`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/js/storage.js#L438)

Password user disimpan **apa adanya** (plaintext) di tabel `users` Supabase dan `localStorage`. Siapapun yang membuka DevTools → Application → Local Storage langsung bisa melihat semua password.

```js
// storage.js L94 — password dikembalikan apa adanya
password: u.password,

// storage.js L438 — password dikirim ke Supabase tanpa hashing
.eq('password', password)
```

> [!CAUTION]
> Ini adalah kerentanan paling serius. Jika data Supabase bocor, semua kredensial langsung terekspos.

**Rekomendasi:**
- Hash password menggunakan **bcrypt** di backend (Supabase Edge Function / RLS policy).
- Di sisi client, kirim password ke Supabase Auth `signInWithPassword()` saja — bukan query plaintext ke tabel.

---

### 2. Hardcoded Default Admin Credential (Backdoor)
**Severity: 🔴 KRITIS** | File: [`storage.js`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/js/storage.js#L450-L466)

Fungsi `findUser()` memiliki **failsafe backdoor** yang membolehkan login `admin` / `admin123` kapan saja, bahkan jika admin sudah mengganti password-nya.

```js
// storage.js L450-L466
if (username === 'admin' && password === 'admin123') {
  const defaultAdmin = { ... role: 'admin' ... };
  return defaultAdmin;  // Selalu berhasil!
}
```

Hal yang sama terjadi di [`seed()`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/js/storage.js#L872-L881) — akun `admin123` dibuat ulang setiap kali seed berjalan.

> [!CAUTION]
> Siapapun yang tahu kode sumber ini bisa login sebagai Administrator kapan saja. Ini membatalkan semua kontrol akses.

**Rekomendasi:**
- Hapus blok failsafe di `findUser()`.
- Setelah setup awal, **paksa admin mengganti password** dan hapus blok default di `seed()`.

---

### 3. Supabase Anon Key Ter-hardcode di Source Code Publik
**Severity: 🟠 TINGGI** | File: [`storage.js`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/js/storage.js#L19)

```js
anonKey: window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIs...'
```

Anon key ini di-commit ke GitHub. Meskipun anon key dirancang untuk digunakan di client, **tanpa Row Level Security (RLS)** yang ketat, siapapun bisa:
- Membaca seluruh data tabel `users` (termasuk password plaintext)
- Menghapus atau memodifikasi data ujian

**Rekomendasi:**
- Aktifkan **RLS policies** di semua tabel Supabase
- Pindahkan URL/key ke environment variable atau konfigurasi dinamis (sudah ada `setSupabaseConfig`, jadikan ini satu-satunya cara)

---

### 4. Session Hanya di localStorage — Mudah Dipalsukan
**Severity: 🟠 TINGGI** | File: [`storage.js`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/js/storage.js#L831-L833)

```js
getSession() { return this.get('session'); },
setSession(data) { return this.set('session', { ...data, loginAt: Date.now() }); },
```

Session disimpan di `localStorage` sebagai JSON biasa. Siswa bisa membuka console dan menjalankan:

```js
// Menjadi admin dalam 1 baris:
localStorage.setItem('ulangan_session', JSON.stringify({
  userId: 'fake', role: 'admin', name: 'Hacker'
}));
```

**Rekomendasi:**
- Verifikasi session terhadap **Supabase Auth session** (`getSession()` → cek JWT)
- Atau tambahkan signed token / HMAC check pada session data

---

### 5. Scoring Dilakukan Sepenuhnya di Client-Side
**Severity: 🟠 TINGGI** | File: [`utils.js`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/js/utils.js#L182-L213) & [`exam.js`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/js/exam.js#L226)

```js
// exam.js L226 — penilaian terjadi di browser siswa
const scoring = Utils.hitungNilai(ujian, { answers: this.state.answers }, this.state.soalList);
```

Siswa yang mahir bisa:
1. Memodifikasi `this.state.answers` di console
2. Mengubah `scoring.nilai` sebelum dikirim ke Supabase
3. Langsung memanggil `DB.updateHasil()` dengan nilai palsu

**Rekomendasi:**
- Pindahkan penilaian ke **Supabase Edge Function** atau **database trigger (PL/pgSQL)** yang menghitung ulang scoring dari data `jawaban` dan `soal` yang tersimpan di server.

---

### 6. Kunci Jawaban Dikirim ke Browser Siswa
**Severity: 🟠 TINGGI** | File: [`exam.js`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/js/exam.js#L52-L57)

```js
// Soal di-load beserta jawaban benarnya
soalList = soalIds.map(id => DB.getSoalById(id)).filter(Boolean);
```

Objek `soal` memiliki field `jawaban` (kunci jawaban) yang dikirim utuh ke browser. Siswa bisa melihatnya melalui DevTools → Console → `ExamEngine.state.soalList`.

**Rekomendasi:**
- Buat **Supabase view** atau **RPC function** yang mengembalikan soal **tanpa kolom `jawaban`** untuk role siswa
- Kunci jawaban hanya diakses server-side saat scoring

---

### 7. CSRF Token Tidak Digunakan
**Severity: 🟡 SEDANG** | File: [`auth.js`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/js/auth.js#L6-L7)

```js
this._csrfToken = sessionStorage.getItem('csrf') || Utils.generateCSRFToken();
sessionStorage.setItem('csrf', this._csrfToken);
```

Token CSRF di-generate tapi **tidak pernah diperiksa** di manapun. Ini hanya memberikan ilusi keamanan.

---

## 🟡 KINERJA — Temuan Optimasi

### 8. `syncFromSupabase()` Mengunduh SEMUA Data Sekaligus
**Severity: 🟡 SEDANG** | File: [`storage.js`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/js/storage.js#L310-L366)

```js
const [uRes, sRes, jRes, hRes, lRes] = await Promise.all([
  this.client.from('users').select('*'),       // SEMUA users
  this.client.from('soal').select('*'),         // SEMUA soal
  this.client.from('ujian').select('*'),        // SEMUA ujian
  this.client.from('hasil').select('*'),        // SEMUA hasil
  this.client.from('audit_logs').select('*'),   // 200 logs
]);
```

Fungsi ini dipanggil saat `init()` dan mengunduh **seluruh isi database**. Untuk sekolah dengan 500+ siswa dan 1000+ soal, ini akan:
- Memakan bandwidth 5-10 MB per page load
- Memperlambat Time to Interactive secara signifikan
- Memakan `localStorage` (batas ±5 MB)

**Rekomendasi:**
- Paginate: `select('*').range(0, 100)`
- Filter berdasarkan konteks: siswa hanya butuh ujian yang aktif, bukan semua data
- Lazy-load: jangan unduh `hasil` dan `audit_logs` kecuali di halaman yang membutuhkannya

---

### 9. Autosave Terlalu Agresif — Setiap Klik = Network Request
**Severity: 🟡 SEDANG** | File: [`exam.js`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/js/exam.js#L157-L159)

```js
setAnswer(soalId, value) {
  this.state.answers[soalId] = value;
  this._autosave();  // Dipanggil setiap kali user memilih jawaban
}
```

Setiap kali siswa mengklik pilihan jawaban, `_autosave()` langsung dipanggil, menghasilkan request `upsert` ke Supabase. Untuk ujian 50 soal, jika siswa mengubah pikiran, bisa terjadi **100+ request** dalam satu sesi.

**Rekomendasi:**
- Debounce `_autosave()` dengan delay 3-5 detik
- Biarkan `startAutosave(30)` menangani sync periodik
- `setAnswer` cukup simpan ke memori dan localStorage saja

---

### 10. `localStorage` Bisa Overflow untuk Data Besar
**Severity: 🟡 SEDANG** | File: [`storage.js`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/js/storage.js#L375-L380)

```js
set(key, val) {
  try {
    localStorage.setItem(this.PREFIX + key, JSON.stringify(val));
    return true;
  } catch { return false; }  // Error ditelan diam-diam!
}
```

Saat `localStorage` penuh (±5 MB), `catch` mengabaikan error **tanpa notifikasi**. Data bisa hilang tanpa diketahui user atau admin.

**Rekomendasi:**
- Log warning atau tampilkan toast saat `catch` terpicu
- Implementasikan strategi eviction (hapus data lama)

---

## 🐛 BUG — Temuan Bug & Edge Case

### 11. Timer Drift saat Browser Sleep/Hibernate
**Severity: 🔴 KRITIS** | File: [`exam.js`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/js/exam.js#L98-L108)

```js
this.state.timerInterval = setInterval(() => {
  this.state.timerSeconds--;
  // ...
}, 1000);
```

`setInterval(1000)` **tidak reliable** saat:
- Laptop masuk sleep/hibernate
- Tab di-throttle oleh browser (Chrome mengurangi timer di background tab)

Contoh: siswa punya 60 menit, menutup laptop 30 menit → timer hanya berkurang beberapa detik.

**Rekomendasi:**
```js
// Gunakan wall-clock time, bukan countdown
const endTime = this.state.startTime + (ujian.durasi * 60 * 1000);
setInterval(() => {
  const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
  this.state.timerSeconds = remaining;
  // ...
}, 1000);
```

---

### 12. Race Condition: `cleanup()` lalu `submit()` 
**Severity: 🟠 TINGGI** | File: [`ujian.html`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/pages/ujian.html#L550-L554)

```js
async function submitUjian(reason) {
  ExamEngine.cleanup();        // Menghapus semua event listeners + stop timer
  const result = await ExamEngine.submit(reason);  // Masih butuh autosave!
}
```

`cleanup()` menghentikan timer dan autosave **sebelum** `submit()` dipanggil. Dalam `submit()`, ada `await this._autosave()` yang bergantung pada state yang mungkin sudah dibersihkan.

**Rekomendasi:**
- Panggil `cleanup()` **setelah** `submit()` selesai, bukan sebelumnya

---

### 13. `DB.getSoalById()` adalah Synchronous tapi Dipanggil Tanpa Await
**Severity: 🟠 TINGGI** | File: [`exam.js`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/js/exam.js#L53)

```js
let soalList = soalIds.map(id => DB.getSoalById(id)).filter(Boolean);
```

[`DB.getSoalById()`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/js/storage.js#L530-L538) adalah **async function** yang mengembalikan Promise. Tetapi di sini dipanggil **tanpa `await`**, sehingga hasilnya adalah array of Promises, bukan array of soal. `filter(Boolean)` meloloskan semua Promise (truthy).

Ini berarti jika soal belum ada di localStorage cache, soalList akan berisi Promise objects, bukan data soal.

**Rekomendasi:**
```js
let soalList = await Promise.all(soalIds.map(id => DB.getSoalById(id)));
soalList = soalList.filter(Boolean);
```

> [!NOTE]
> Bug ini mungkin tidak terasa karena `getSoalById` juga membaca dari localStorage cache (sync path), tapi akan gagal saat cache kosong dan harus fetch dari Supabase.

---

### 14. Ujian Bisa Diulang — Tidak Ada Pengecekan "Sudah Pernah Submit"
**Severity: 🟡 SEDANG** | File: [`ujian.html`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/pages/ujian.html#L143-L147)

```js
const existingHasil = DB.getHasilBySiswaUjian(session.userId, ujianId);
if (existingHasil && existingHasil.status === 'selesai') {
  window.location.href = `selesai.html?hasilId=${existingHasil.id}`;
  return;
}
```

Pengecekan hanya membaca dari **localStorage cache**. Jika siswa membuka browser lain atau menghapus cache, mereka bisa mengulang ujian karena `getHasilBySiswaUjian` membaca dari `this.getHasil()` (localStorage), bukan dari Supabase.

**Rekomendasi:**
- Tambahkan `await DB.fetchHasil()` sebelum pengecekan, atau query langsung ke Supabase:
```js
const { data } = await DB.client.from('hasil')
  .select('id, status')
  .eq('siswa_id', session.userId)
  .eq('ujian_id', ujianId)
  .maybeSingle();
```

---

### 15. `DB.seed()` Dipanggil di Setiap Halaman Login
**Severity: 🟡 SEDANG** | File: [`index.html`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/index.html#L83) & [`login-guru.html`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/pages/login-guru.html#L83)

```js
DB.init();
Auth.init();
DB.seed();  // Setiap kali halaman login dibuka!
```

`seed()` menjalankan pengecekan admin dan pembersihan akun demo setiap page load. Ini menambah latency login page (melakukan insert ke Supabase jika admin belum ada).

**Rekomendasi:**
- Pindahkan `seed()` ke fungsi setup awal yang hanya dipanggil sekali (saat setup pertama atau di halaman pengaturan)

---

### 16. Multi-Tab Bisa Menyebabkan Data Corruption
**Severity: 🟡 SEDANG** | File: [`storage.js`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/js/storage.js#L394-L396)

```js
getUsers() { return this.get('users') || []; },
setUsers(u) { return this.set('users', u); },
```

Jika admin membuka 2 tab dan menambahkan user di masing-masing tab:
1. Tab A: baca users → [alice], tambah bob → simpan [alice, bob]
2. Tab B: baca users → [alice] (masih cache lama), tambah carol → simpan [alice, carol]
3. **Bob hilang!** Tab B menimpa data Tab A

**Rekomendasi:**
- Gunakan `window.addEventListener('storage', ...)` untuk mendeteksi perubahan dari tab lain
- Atau gunakan read-then-write atomic di Supabase saja

---

### 17. `getUjianById()` pada Exam Init adalah Synchronous Call pertama
**Severity: 🟡 SEDANG** | File: [`ujian.html`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/pages/ujian.html#L132-L135)

```js
ujian = DB.getUjianById(ujianId);       // Async tapi tanpa await!
if (!ujian && DB.client) {
  ujian = await DB.getUjianById(ujianId); // Await kedua kali
}
```

Baris pertama memanggil `async getUjianById()` **tanpa `await`**. Hasilnya adalah Promise, yang truthy, sehingga `if (!ujian)` selalu false dan Supabase fetch tidak pernah terjadi.

**Fix:**
```js
ujian = await DB.getUjianById(ujianId);
```

---

### 18. Router.PAGES untuk Guru Tidak Menyertakan Semua Menu
**Severity: 🟡 INFO** | File: [`auth.js`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/js/auth.js#L232-L235)

```js
guru: {
  dashboard: 'pages/dashboard-guru.html',
  'bank-soal': 'pages/bank-soal.html'    // Hanya 2 halaman!
},
```

Router PAGES untuk guru hanya mendaftarkan 2 halaman, tapi sidebar `GURU_MENU` di [`layout.js`](file:///c:/Users/Gungde/Documents/AplikasiUlangan/js/layout.js#L14-L21) sudah menyertakan 4 halaman (dashboard, manajemen-ujian, bank-soal, hasil). Ini bisa membingungkan developer di masa depan.

---

## 📊 Ringkasan Temuan

| # | Kategori | Severity | Temuan |
|---|----------|----------|--------|
| 1 | 🔒 Security | 🔴 Kritis | Password plaintext di DB & localStorage |
| 2 | 🔒 Security | 🔴 Kritis | Hardcoded admin backdoor `admin123` |
| 3 | 🔒 Security | 🟠 Tinggi | Supabase anon key hardcoded + no RLS |
| 4 | 🔒 Security | 🟠 Tinggi | Session localStorage mudah dipalsukan |
| 5 | 🔒 Security | 🟠 Tinggi | Client-side scoring bisa dimanipulasi |
| 6 | 🔒 Security | 🟠 Tinggi | Kunci jawaban terkirim ke browser siswa |
| 7 | 🔒 Security | 🟡 Sedang | CSRF token tidak digunakan |
| 8 | ⚡ Performance | 🟡 Sedang | Sync mengunduh semua data sekaligus |
| 9 | ⚡ Performance | 🟡 Sedang | Autosave terlalu agresif (setiap klik) |
| 10 | ⚡ Performance | 🟡 Sedang | localStorage overflow ditelan diam-diam |
| 11 | 🐛 Bug | 🔴 Kritis | Timer drift saat sleep/hibernate |
| 12 | 🐛 Bug | 🟠 Tinggi | Race condition cleanup → submit |
| 13 | 🐛 Bug | 🟠 Tinggi | `getSoalById` async tanpa await |
| 14 | 🐛 Bug | 🟡 Sedang | Ujian bisa diulang via browser lain |
| 15 | 🐛 Bug | 🟡 Sedang | `seed()` dipanggil setiap page load |
| 16 | 🐛 Bug | 🟡 Sedang | Multi-tab data corruption |
| 17 | 🐛 Bug | 🟡 Sedang | `getUjianById` tanpa await |
| 18 | 🐛 Bug | 🟡 Info | Router.PAGES tidak sinkron dengan menu |

---

## ✅ Hal yang Sudah Baik

| Aspek | Detail |
|-------|--------|
| 🛡️ XSS Prevention | `Utils.escapeHtml()` digunakan secara konsisten di semua render HTML |
| 🖥️ Kiosk Mode | Deteksi pelanggaran komprehensif (visibility, blur, fullscreen, keyboard, context menu, back button) |
| 💾 Offline Resilience | LocalStorage fallback + network event listeners + autosave |
| 📊 Audit Logging | Setiap aksi penting (login, pelanggaran, submit) dicatat ke audit_logs |
| 🧹 Cleanup Handlers | Event listeners dibersihkan dengan benar di `ExamEngine.cleanup()` |
| ✅ Input Validation | Form validation dengan `Utils.validate()` dan `sanitizeInput()` |
| 🎨 UX/UI | Toast notifications, loading states, responsive design |

---

## 🎯 Prioritas Perbaikan (Urutan yang Direkomendasikan)

1. **Fix Bug Kritis** → Timer drift (#11), `getSoalById` tanpa await (#13), `getUjianById` tanpa await (#17)
2. **Tutup Backdoor** → Hapus hardcoded admin credential (#2)
3. **Amankan Password** → Implementasi hashing (#1) + aktifkan Supabase RLS (#3)
4. **Server-Side Scoring** → Pindahkan penilaian ke backend (#5, #6)
5. **Session Security** → Verifikasi session terhadap Supabase Auth (#4)
6. **Performance** → Debounce autosave (#9), paginate sync (#8)
7. **Edge Cases** → Multi-tab sync (#16), duplikasi ujian (#14)
