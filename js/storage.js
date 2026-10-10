/**
 * STORAGE LAYER - LocalStorage ORM
 * Mengelola semua penyimpanan data aplikasi
 */
const DB = {
  // Prefix untuk semua key
  PREFIX: 'ulangan_',

  // === CORE CRUD ===
  get(key) {
    try {
      const val = localStorage.getItem(this.PREFIX + key);
      return val ? JSON.parse(val) : null;
    } catch { return null; }
  },
  set(key, val) {
    try {
      localStorage.setItem(this.PREFIX + key, JSON.stringify(val));
      return true;
    } catch { return false; }
  },
  remove(key) { localStorage.removeItem(this.PREFIX + key); },
  all() {
    const result = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(this.PREFIX)) {
        try { result[k.replace(this.PREFIX, '')] = JSON.parse(localStorage.getItem(k)); } catch {}
      }
    }
    return result;
  },

  // === USERS ===
  getUsers() { return this.get('users') || []; },
  setUsers(u) { return this.set('users', u); },
  addUser(user) {
    const users = this.getUsers();
    user.id = this._uid();
    user.createdAt = Date.now();
    users.push(user);
    this.setUsers(users);
    return user;
  },
  findUser(username, password) {
    return this.getUsers().find(u => u.username === username && u.password === password && u.active !== false);
  },
  findUserById(id) { return this.getUsers().find(u => u.id === id); },
  updateUser(id, data) {
    const users = this.getUsers().map(u => u.id === id ? { ...u, ...data } : u);
    this.setUsers(users);
  },
  deleteUser(id) { this.setUsers(this.getUsers().filter(u => u.id !== id)); },

  // === BANK SOAL ===
  getSoal() { return this.get('soal') || []; },
  setSoal(s) { return this.set('soal', s); },
  addSoal(soal) {
    const list = this.getSoal();
    soal.id = this._uid();
    soal.createdAt = Date.now();
    list.push(soal);
    this.setSoal(list);
    return soal;
  },
  updateSoal(id, data) {
    const list = this.getSoal().map(s => s.id === id ? { ...s, ...data, updatedAt: Date.now() } : s);
    this.setSoal(list);
  },
  deleteSoal(id) { this.setSoal(this.getSoal().filter(s => s.id !== id)); },
  getSoalById(id) { return this.getSoal().find(s => s.id === id); },

  // === UJIAN ===
  getUjian() { return this.get('ujian') || []; },
  setUjian(u) { return this.set('ujian', u); },
  addUjian(ujian) {
    const list = this.getUjian();
    ujian.id = this._uid();
    ujian.kode = this._generateCode();
    ujian.createdAt = Date.now();
    ujian.status = 'draft';
    list.push(ujian);
    this.setUjian(list);
    return ujian;
  },
  updateUjian(id, data) {
    const list = this.getUjian().map(u => u.id === id ? { ...u, ...data, updatedAt: Date.now() } : u);
    this.setUjian(list);
    return list.find(u => u.id === id);
  },
  deleteUjian(id) { this.setUjian(this.getUjian().filter(u => u.id !== id)); },
  getUjianById(id) { return this.getUjian().find(u => u.id === id); },
  getUjianByKode(kode) { return this.getUjian().find(u => u.kode === kode.toUpperCase()); },

  // === JAWABAN SISWA ===
  getJawaban(ujianId, siswaId) { return this.get(`jawaban_${ujianId}_${siswaId}`) || { answers: {}, flagged: [], startTime: null, violations: [] }; },
  saveJawaban(ujianId, siswaId, data) { return this.set(`jawaban_${ujianId}_${siswaId}`, { ...data, lastSaved: Date.now() }); },

  // === HASIL ===
  getHasil() { return this.get('hasil') || []; },
  setHasil(h) { return this.set('hasil', h); },
  addHasil(hasil) {
    const list = this.getHasil();
    hasil.id = this._uid();
    hasil.submittedAt = Date.now();
    list.push(hasil);
    this.setHasil(list);
    return hasil;
  },
  updateHasil(id, data) {
    const list = this.getHasil().map(h => h.id === id ? { ...h, ...data } : h);
    this.setHasil(list);
  },
  getHasilByUjian(ujianId) { return this.getHasil().filter(h => h.ujianId === ujianId); },
  getHasilBySiswa(siswaId) { return this.getHasil().filter(h => h.siswaId === siswaId); },
  getHasilBySiswaUjian(siswaId, ujianId) { return this.getHasil().find(h => h.siswaId === siswaId && h.ujianId === ujianId); },

  // === AUDIT LOG ===
  getLogs() { return this.get('audit_logs') || []; },
  addLog(log) {
    const logs = this.getLogs();
    log.id = this._uid();
    log.timestamp = Date.now();
    logs.unshift(log);
    if (logs.length > 5000) logs.pop();
    this.set('audit_logs', logs);
    return log;
  },
  getLogsByHasil(hasilId) { return this.getLogs().filter(l => l.hasilId === hasilId); },
  getLogsByUjian(ujianId) { return this.getLogs().filter(l => l.ujianId === ujianId); },

  // === SESSION ===
  getSession() { return this.get('session'); },
  setSession(data) { return this.set('session', { ...data, loginAt: Date.now() }); },
  clearSession() { this.remove('session'); },

  // === SETTINGS ===
  getSettings() {
    return this.get('settings') || {
      maxViolations: 3,
      autosaveInterval: 30,
      allowReview: true,
      showScoreImmediately: false,
      requireFullscreen: true,
      allowFlagQuestion: true,
    };
  },
  saveSettings(s) { return this.set('settings', s); },

  // === UTILS ===
  _uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
  _generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  },

  // === SEED DATA ===
  seed() {
    // Cek apakah sudah pernah di-seed
    if (this.get('seeded')) return;

    // Guru default
    this.addUser({ username: 'guru1', password: 'guru123', name: 'Pak Budi Santoso', role: 'guru', email: 'guru@sekolah.id', active: true });
    this.addUser({ username: 'guru2', password: 'guru123', name: 'Bu Sri Wulandari', role: 'guru', email: 'guru2@sekolah.id', active: true });

    // Siswa default
    this.addUser({ username: 'siswa1', password: '12345', name: 'Ahmad Fauzi', role: 'siswa', kelas: 'XI IPA 1', no_absen: '01', active: true });
    this.addUser({ username: 'siswa2', password: '12345', name: 'Budi Raharjo', role: 'siswa', kelas: 'XI IPA 1', no_absen: '02', active: true });
    this.addUser({ username: 'siswa3', password: '12345', name: 'Citra Dewi', role: 'siswa', kelas: 'XI IPA 1', no_absen: '03', active: true });
    this.addUser({ username: 'siswa4', password: '12345', name: 'Diana Putri', role: 'siswa', kelas: 'XI IPA 2', no_absen: '01', active: true });

    // Contoh soal
    const guru = this.getUsers().find(u => u.role === 'guru');
    if (guru) {
      const soalData = [
        {
          tipe: 'pg', mapel: 'Matematika', kelas: 'XI', bab: 'Aljabar',
          pertanyaan: 'Jika f(x) = 2x + 3, maka nilai f(5) adalah...',
          pilihan: ['10', '11', '13', '15', '16'], jawaban: 'C',
          bobot: 1, tingkat: 'mudah', pembuatId: guru.id,
        },
        {
          tipe: 'pg', mapel: 'Matematika', kelas: 'XI', bab: 'Aljabar',
          pertanyaan: 'Hasil dari (2x + 3)(x - 1) adalah...',
          pilihan: ['2x² + x - 3', '2x² - x + 3', '2x² + x + 3', '2x² - 2x - 3', '2x² + 2x - 3'],
          jawaban: 'A', bobot: 1, tingkat: 'sedang', pembuatId: guru.id,
        },
        {
          tipe: 'pg', mapel: 'Matematika', kelas: 'XI', bab: 'Trigonometri',
          pertanyaan: 'Nilai sin 30° + cos 60° adalah...',
          pilihan: ['0', '½', '1', '√3/2', '√2'],
          jawaban: 'C', bobot: 1, tingkat: 'mudah', pembuatId: guru.id,
        },
        {
          tipe: 'pg', mapel: 'Matematika', kelas: 'XI', bab: 'Trigonometri',
          pertanyaan: 'Persamaan tan x = √3 mempunyai penyelesaian x = ...',
          pilihan: ['30°', '45°', '60°', '90°', '120°'],
          jawaban: 'C', bobot: 1, tingkat: 'sedang', pembuatId: guru.id,
        },
        {
          tipe: 'bs', mapel: 'Matematika', kelas: 'XI', bab: 'Aljabar',
          pertanyaan: 'Bilangan prima antara 10 dan 20 berjumlah 4 bilangan.',
          jawaban: 'Benar', bobot: 1, tingkat: 'mudah', pembuatId: guru.id,
        },
        {
          tipe: 'isian', mapel: 'Matematika', kelas: 'XI', bab: 'Aljabar',
          pertanyaan: 'Jika 3x - 6 = 12, maka nilai x adalah...',
          jawaban: '6', bobot: 2, tingkat: 'mudah', pembuatId: guru.id,
        },
        {
          tipe: 'uraian', mapel: 'Matematika', kelas: 'XI', bab: 'Aljabar',
          pertanyaan: 'Jelaskan langkah-langkah menyelesaikan persamaan kuadrat ax² + bx + c = 0 menggunakan rumus kuadrat (abc)!',
          jawaban: 'Rumus kuadrat: x = (-b ± √(b²-4ac)) / 2a. Langkah: 1) Identifikasi nilai a, b, c 2) Hitung diskriminan D = b²-4ac 3) Substitusi ke rumus 4) Hitung nilai x',
          bobot: 5, tingkat: 'sulit', pembuatId: guru.id,
        },
      ];
      soalData.forEach(s => this.addSoal(s));

      // Contoh ujian
      const soalList = this.getSoal();
      const ujianContoh = this.addUjian({
        judul: 'Ujian Matematika Kelas XI Semester 1',
        mapel: 'Matematika',
        kelas: 'XI IPA 1',
        guru: guru.name,
        guruId: guru.id,
        durasi: 90,
        kkm: 75,
        jumlahSoal: 7,
        soalIds: soalList.map(s => s.id),
        jadwalMulai: new Date(Date.now() - 3600000).toISOString(),
        jadwalSelesai: new Date(Date.now() + 86400000 * 30).toISOString(),
        instruksi: 'Kerjakan soal dengan teliti. Dilarang bekerjasama. Pastikan jawaban sudah benar sebelum mengirim.',
        acakSoal: true,
        acakJawaban: false,
        tampilkanHasil: true,
        maxPelanggaran: 3,
      });
      this.updateUjian(ujianContoh.id, { status: 'aktif' });
    }

    this.set('seeded', true);
  }
};
