const DB = {
  PREFIX: 'ulangan_',

  // ── Supabase Configuration & Client ──
  client: null,
  isConnected: false,

  getSupabaseConfig() {
    try {
      const stored = localStorage.getItem(this.PREFIX + 'supabase_config');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.url) parsed.url = parsed.url.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
        return parsed;
      }
    } catch (e) {}
    return {
      url: (window.SUPABASE_URL || 'https://dxjrpicfzdxuooyqyosf.supabase.co').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
      anonKey: window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4anJwaWNmemR4dW9veXF5b3NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MzIwMjEsImV4cCI6MjEwNzIwODAyMX0.Mu1q2kCamE03Sklp6az9BqAbt4mROrNsFtG7yKctuGM'
    };
  },

  setSupabaseConfig(cfg) {
    try {
      if (cfg && cfg.url) {
        cfg.url = cfg.url.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
      }
      localStorage.setItem(this.PREFIX + 'supabase_config', JSON.stringify(cfg));
      this.init();
      return true;
    } catch (e) {
      return false;
    }
  },

  init() {
    const config = this.getSupabaseConfig();
    if (window.supabase && config.url && config.anonKey) {
      try {
        const cleanUrl = config.url.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
        this.client = window.supabase.createClient(cleanUrl, config.anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        });
        this.isConnected = true;
        // Background sync dari cloud HANYA jika ada sesi aktif (mencegah delay di halaman login)
        if (this.getSession()) {
          this.syncFromSupabase().catch(err => {
            console.warn('Initial Supabase sync error:', err);
          });
        }
      } catch (err) {
        console.warn('Gagal inisialisasi Supabase client:', err);
        this.isConnected = false;
      }
    } else {
      this.isConnected = false;
    }

    // Sinkronisasi antar-tab via Storage Event (Menjaga konsistensi multi-tab)
    if (typeof window !== 'undefined' && !this._storageListenerAttached) {
      this._storageListenerAttached = true;
      window.addEventListener('storage', (e) => {
        if (e.key && e.key.startsWith(this.PREFIX)) {
          const stripped = e.key.replace(this.PREFIX, '');
          window.dispatchEvent(new CustomEvent('storage-updated', { detail: { key: stripped } }));
          if (stripped === 'session' && !e.newValue) {
            window.location.reload();
          }
        }
      });
    }

    return this.isConnected;
  },

  async testConnection() {
    if (!this.client) {
      this.init();
      if (!this.client) return { success: false, error: 'URL atau Anon Key Supabase belum diatur' };
    }
    try {
      const { data, error } = await this.client.from('users').select('id').limit(1);
      if (error) {
        if (error.code === 'PGRST205' || (error.message && error.message.includes('Could not find the table'))) {
          return {
            success: false,
            needSchema: true,
            error: "Koneksi ke Supabase berhasil! Namun tabel 'users' belum dibuat. Silakan jalankan skrip di SQL Editor Supabase."
          };
        }
        return { success: false, error: error.message };
      }
      this.isConnected = true;
      return { success: true, count: data ? data.length : 0 };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  // ── Data Mapping Helpers (Postgres Snake <-> JS Camel) ──
  _toCamelUser(u) {
    if (!u) return null;
    return {
      id: u.id,
      username: u.username,
      password: u.password,
      name: u.name,
      role: u.role,
      email: u.email || '',
      kelas: u.kelas || '',
      no_absen: u.no_absen || '',
      noAbsen: u.no_absen || '',
      mapel: u.mapel || '',
      kelasAmpu: u.kelas_ampu || u.kelasAmpu || '',
      active: u.active !== false,
      createdAt: u.created_at ? new Date(u.created_at).getTime() : Date.now()
    };
  },

  _toSnakeUser(u) {
    const row = {
      id: u.id,
      username: u.username,
      password: u.password,
      name: u.name,
      role: u.role,
      email: u.email || null,
      kelas: u.kelas || null,
      no_absen: u.noAbsen || u.no_absen || null,
      active: u.active !== false
    };
    if (u.mapel !== undefined) row.mapel = u.mapel || null;
    if (u.kelasAmpu !== undefined || u.kelas_ampu !== undefined) {
      row.kelas_ampu = u.kelasAmpu || u.kelas_ampu || null;
    }
    return row;
  },

  _toCamelSoal(s) {
    if (!s) return null;
    return {
      id: s.id,
      tipe: s.tipe,
      mapel: s.mapel,
      kelas: s.kelas || '',
      bab: s.bab || '',
      pertanyaan: s.pertanyaan,
      pilihan: Array.isArray(s.pilihan) ? s.pilihan : (typeof s.pilihan === 'string' ? JSON.parse(s.pilihan || '[]') : []),
      jawaban: s.jawaban || '',
      bobot: Number(s.bobot) || 1,
      tingkat: s.tingkat || 'sedang',
      pembuat_id: s.pembuat_id || '',
      pembuatId: s.pembuat_id || '',
      createdAt: s.created_at ? new Date(s.created_at).getTime() : Date.now(),
      updatedAt: s.updated_at ? new Date(s.updated_at).getTime() : Date.now()
    };
  },

  _toSnakeSoal(s) {
    return {
      id: s.id,
      tipe: s.tipe,
      mapel: s.mapel,
      kelas: s.kelas || null,
      bab: s.bab || null,
      pertanyaan: s.pertanyaan,
      pilihan: s.pilihan || [],
      jawaban: s.jawaban || '',
      bobot: Number(s.bobot) || 1,
      tingkat: s.tingkat || 'sedang',
      pembuat_id: s.pembuatId || s.pembuat_id || null,
      updated_at: new Date().toISOString()
    };
  },

  _toCamelUjian(u) {
    if (!u) return null;
    return {
      id: u.id,
      kode: (u.kode || '').toUpperCase(),
      judul: u.judul,
      mapel: u.mapel,
      kelas: u.kelas || '',
      guru: u.guru || '',
      guru_id: u.guru_id || '',
      guruId: u.guru_id || '',
      durasi: Number(u.durasi) || 90,
      kkm: Number(u.kkm) || 75,
      jumlah_soal: Number(u.jumlah_soal) || 0,
      jumlahSoal: Number(u.jumlah_soal) || 0,
      soal_ids: Array.isArray(u.soal_ids) ? u.soal_ids : (typeof u.soal_ids === 'string' ? JSON.parse(u.soal_ids || '[]') : []),
      soalIds: Array.isArray(u.soal_ids) ? u.soal_ids : (typeof u.soal_ids === 'string' ? JSON.parse(u.soal_ids || '[]') : []),
      jadwal_mulai: u.jadwal_mulai,
      jadwalMulai: u.jadwal_mulai,
      jadwal_selesai: u.jadwal_selesai,
      jadwalSelesai: u.jadwal_selesai,
      instruksi: u.instruksi || '',
      acak_soal: u.acak_soal !== false,
      acakSoal: u.acak_soal !== false,
      acak_jawaban: !!u.acak_jawaban,
      acakJawaban: !!u.acak_jawaban,
      tampilkan_hasil: u.tampilkan_hasil !== false,
      tampilkanHasil: u.tampilkan_hasil !== false,
      max_pelanggaran: Number(u.max_pelanggaran) || 3,
      maxPelanggaran: Number(u.max_pelanggaran) || 3,
      status: u.status || 'draft',
      createdAt: u.created_at ? new Date(u.created_at).getTime() : Date.now(),
      updatedAt: u.updated_at ? new Date(u.updated_at).getTime() : Date.now()
    };
  },

  _toSnakeUjian(u) {
    return {
      id: u.id,
      kode: (u.kode || '').toUpperCase(),
      judul: u.judul,
      mapel: u.mapel,
      kelas: u.kelas || null,
      guru: u.guru || null,
      guru_id: u.guruId || u.guru_id || null,
      durasi: Number(u.durasi) || 90,
      kkm: Number(u.kkm) || 75,
      jumlah_soal: Number(u.jumlahSoal || u.jumlah_soal) || 0,
      soal_ids: u.soalIds || u.soal_ids || [],
      jadwal_mulai: u.jadwalMulai || u.jadwal_mulai || null,
      jadwal_selesai: u.jadwalSelesai || u.jadwal_selesai || null,
      instruksi: u.instruksi || null,
      acak_soal: u.acakSoal !== false && u.acak_soal !== false,
      acak_jawaban: !!(u.acakJawaban || u.acak_jawaban),
      tampilkan_hasil: u.tampilkanHasil !== false && u.tampilkan_hasil !== false,
      max_pelanggaran: Number(u.maxPelanggaran || u.max_pelanggaran) || 3,
      status: u.status || 'draft',
      updated_at: new Date().toISOString()
    };
  },

  _toCamelHasil(h) {
    if (!h) return null;
    return {
      id: h.id,
      siswa_id: h.siswa_id,
      siswaId: h.siswa_id,
      siswa_name: h.siswa_name,
      siswaName: h.siswa_name,
      ujian_id: h.ujian_id,
      ujianId: h.ujian_id,
      ujian_judul: h.ujian_judul,
      ujianJudul: h.ujian_judul,
      guru_id: h.guru_id || '',
      guruId: h.guru_id || '',
      status: h.status || 'berlangsung',
      nilai: h.nilai !== null ? Number(h.nilai) : null,
      lulus: !!h.lulus,
      scoring: typeof h.scoring === 'object' && h.scoring ? h.scoring : {},
      waktu_pengerjaan: Number(h.waktu_pengerjaan) || 0,
      waktuPengerjaan: Number(h.waktu_pengerjaan) || 0,
      violation_count: Number(h.violation_count) || 0,
      violationCount: Number(h.violation_count) || 0,
      violations: Array.isArray(h.violations) ? h.violations : [],
      submit_reason: h.submit_reason || '',
      submitReason: h.submit_reason || '',
      answers: typeof h.answers === 'object' && h.answers ? h.answers : {},
      submitted_at: h.submitted_at,
      submittedAt: h.submitted_at ? new Date(h.submitted_at).getTime() : Date.now()
    };
  },

  _toSnakeHasil(h) {
    return {
      id: h.id,
      siswa_id: h.siswaId || h.siswa_id,
      siswa_name: h.siswaName || h.siswa_name,
      ujian_id: h.ujianId || h.ujian_id,
      ujian_judul: h.ujianJudul || h.ujian_judul,
      guru_id: h.guruId || h.guru_id || null,
      status: h.status || 'berlangsung',
      nilai: h.nilai !== null && h.nilai !== undefined ? Number(h.nilai) : null,
      lulus: typeof h.lulus === 'boolean' ? h.lulus : (h.nilai !== null ? Number(h.nilai) >= 75 : null),
      scoring: h.scoring || {},
      waktu_pengerjaan: Number(h.waktuPengerjaan || h.waktu_pengerjaan) || 0,
      violation_count: Number(h.violationCount || h.violation_count) || 0,
      violations: h.violations || [],
      submit_reason: h.submitReason || h.submit_reason || 'manual',
      answers: h.answers || {},
      submitted_at: h.submitted_at || (h.submittedAt ? new Date(h.submittedAt).toISOString() : new Date().toISOString())
    };
  },

  _toCamelLog(l) {
    if (!l) return null;
    return {
      id: l.id,
      type: l.type,
      category: l.category || 'exam',
      hasil_id: l.hasil_id || '',
      hasilId: l.hasil_id || '',
      ujian_id: l.ujian_id || '',
      ujianId: l.ujian_id || '',
      actor: l.actor || '',
      actor_id: l.actor_id || '',
      actorId: l.actor_id || '',
      detail: l.detail || '',
      icon: l.icon || 'ℹ️',
      severity: l.severity || 'info',
      violation_num: l.violation_num || null,
      violationNum: l.violation_num || null,
      timestamp: l.timestamp ? new Date(l.timestamp).getTime() : Date.now()
    };
  },

  _toSnakeLog(l) {
    return {
      id: l.id,
      type: l.type,
      category: l.category || 'exam',
      hasil_id: l.hasilId || l.hasil_id || null,
      ujian_id: l.ujianId || l.ujian_id || null,
      actor: l.actor || null,
      actor_id: l.actorId || l.actor_id || null,
      detail: l.detail || null,
      icon: l.icon || null,
      severity: l.severity || 'info',
      violation_num: l.violationNum || l.violation_num || null,
      timestamp: l.timestamp ? new Date(l.timestamp).toISOString() : new Date().toISOString()
    };
  },

  // ── Cloud Synchronization (Supabase Select Queries) ──
  async syncFromSupabase() {
    if (!this.client) return false;
    try {
      const [uRes, sRes, jRes, hRes, lRes] = await Promise.all([
        this.client.from('users').select('*').limit(100),
        this.client.from('soal').select('*').order('created_at', { ascending: false }).limit(100),
        this.client.from('ujian').select('*').order('created_at', { ascending: false }).limit(50),
        this.client.from('hasil').select('*').order('submitted_at', { ascending: false }).limit(100),
        this.client.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(100)
      ]);

      if (uRes.data && uRes.data.length > 0) {
        this.set('users', uRes.data.map(u => this._toCamelUser(u)));
      }
      if (sRes.data && sRes.data.length > 0) {
        this.set('soal', sRes.data.map(s => this._toCamelSoal(s)));
      }
      if (jRes.data && jRes.data.length > 0) {
        this.set('ujian', jRes.data.map(u => this._toCamelUjian(u)));
      }
      if (hRes.data) {
        this.set('hasil', hRes.data.map(h => this._toCamelHasil(h)));
      }
      if (lRes.data) {
        this.set('audit_logs', lRes.data.map(l => this._toCamelLog(l)));
      }

      window.dispatchEvent(new CustomEvent('supabase-synced', {
        detail: {
          users: uRes.data?.length || 0,
          soal: sRes.data?.length || 0,
          ujian: jRes.data?.length || 0,
          hasil: hRes.data?.length || 0,
          logs: lRes.data?.length || 0
        }
      }));

      return true;
    } catch (err) {
      console.warn('Sync from Supabase failed, using cache:', err);
      return false;
    }
  },

  // ── Core Cache Layer (Local fallback & instant render) ──
  pruneCache() {
    try {
      const logs = this.get('audit_logs');
      if (Array.isArray(logs) && logs.length > 25) {
        this.set('audit_logs', logs.slice(0, 25));
      }
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(this.PREFIX + 'jawaban_temp_')) {
          localStorage.removeItem(k);
        }
      }
    } catch (e) {}
  },

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
    } catch (e) {
      console.warn('LocalStorage limit reached, pruning old cache...', e);
      try {
        this.pruneCache();
        localStorage.setItem(this.PREFIX + key, JSON.stringify(val));
        return true;
      } catch (retryErr) {
        console.error('LocalStorage write failed after pruning:', retryErr);
        return false;
      }
    }
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

  // ── Users (Supabase Select, Insert, Update, Delete) ──
  getUsers() { return this.get('users') || []; },
  setUsers(u) { return this.set('users', u); },

  async fetchUsers() {
    if (this.client) {
      const { data, error } = await this.client.from('users').select('*');
      if (!error && data) {
        const camelList = data.map(u => this._toCamelUser(u));
        this.setUsers(camelList);
        return camelList;
      }
    }
    return this.getUsers();
  },

  // ── Verifikasi & Enkripsi Password SHA-256 ──
  async _verifyPassword(plainPassword, storedPassword) {
    if (!plainPassword || !storedPassword) return false;
    if (storedPassword === plainPassword) return true;
    if (typeof Utils !== 'undefined' && Utils.hashPassword) {
      const hashed = await Utils.hashPassword(plainPassword);
      if (storedPassword === hashed) return true;
    }
    return false;
  },

  async _upgradeUserPassword(userId, plainPassword) {
    if (!userId || !plainPassword || typeof Utils === 'undefined' || !Utils.hashPassword) return;
    try {
      const hashed = await Utils.hashPassword(plainPassword);
      if (this.client) {
        await this.client.from('users').update({ password: hashed }).eq('id', userId);
      }
      const users = this.getUsers().map(u => u.id === userId ? { ...u, password: hashed } : u);
      this.setUsers(users);
    } catch (e) {
      console.warn('Auto-upgrade password failed:', e);
    }
  },

  async addUser(user) {
    const users = this.getUsers().filter(u => u.id !== user.id);
    user.id = user.id || this._uid();
    user.createdAt = user.createdAt || Date.now();
    if (user.password && user.password.length !== 64 && typeof Utils !== 'undefined' && Utils.hashPassword) {
      user.password = await Utils.hashPassword(user.password);
    }
    users.push(user);
    this.setUsers(users);

    if (this.client) {
      try {
        const row = this._toSnakeUser(user);
        const { error } = await this.client.from('users').upsert([row], { onConflict: 'id' });
        if (error && (error.message?.includes('mapel') || error.message?.includes('kelas_ampu'))) {
          delete row.mapel;
          delete row.kelas_ampu;
          await this.client.from('users').upsert([row], { onConflict: 'id' });
        }
      } catch (e) {
        console.error('Supabase addUser error:', e);
      }
    }
    return user;
  },

  async findUser(username, password) {
    const cleanUsername = (username || '').trim();
    if (!cleanUsername || !password) return null;

    if (this.client) {
      try {
        // Query Supabase dengan batas waktu 4 detik agar tidak menggantung jika jaringan lambat
        const queryPromise = this.client
          .from('users')
          .select('*')
          .ilike('username', cleanUsername)
          .eq('active', true)
          .maybeSingle();

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout')), 4000)
        );

        const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
        if (!error && data) {
          const passValid = await this._verifyPassword(password, data.password);
          if (passValid) {
            // Jika akun masih password plaintext lama, upgrade otomatis ke SHA-256
            if (data.password === password) {
              this._upgradeUserPassword(data.id, password).catch(() => {});
            }
            return this._toCamelUser(data);
          }
        }
      } catch (e) {
        console.warn('Supabase findUser query error/timeout, fallback ke cache:', e);
      }
    }

    // Fallback ke cache lokal
    const cachedUsers = this.getUsers();
    for (const u of cachedUsers) {
      if (u.username && u.username.toLowerCase() === cleanUsername.toLowerCase() && u.active !== false) {
        const passValid = await this._verifyPassword(password, u.password);
        if (passValid) return u;
      }
    }
    return null;
  },

  getUserById(id) {
    if (!id) return null;
    return this.getUsers().find(u => u.id === String(id)) || null;
  },

  async findUserById(id) {
    if (this.client) {
      try {
        const { data, error } = await this.client.from('users').select('*').eq('id', id).maybeSingle();
        if (!error && data) return this._toCamelUser(data);
      } catch (e) {}
    }
    return this.getUserById(id);
  },

  async updateUser(id, data) {
    if (!id) return;
    const existing = this.getUserById(id) || {};
    const updateData = { ...existing, ...data };

    if (data.password) {
      if (data.password.length !== 64 && typeof Utils !== 'undefined' && Utils.hashPassword) {
        updateData.password = await Utils.hashPassword(data.password);
      }
    } else {
      updateData.password = existing.password;
    }

    const users = this.getUsers().map(u => u.id === id ? { ...u, ...updateData } : u);
    this.setUsers(users);

    if (this.client) {
      try {
        const row = this._toSnakeUser({ ...updateData, id });
        if (!data.password && !row.password) {
          delete row.password;
        }
        const { error } = await this.client.from('users').update(row).eq('id', id);
        if (error) {
          console.error('Supabase updateUser error:', error);
          if (error.message?.includes('mapel') || error.message?.includes('kelas_ampu')) {
            delete row.mapel;
            delete row.kelas_ampu;
            await this.client.from('users').update(row).eq('id', id);
          }
        }
      } catch (e) {
        console.error('Supabase updateUser error:', e);
      }
    }
  },

  // ── Helper Filter Guru (Mapel & Kelas Ampuan) ──
  getGuruMapels(userOrSession) {
    if (!userOrSession || !userOrSession.mapel) return [];
    return userOrSession.mapel.split(',').map(m => m.trim()).filter(Boolean);
  },

  getGuruKelas(userOrSession) {
    if (!userOrSession || !userOrSession.kelasAmpu) return [];
    return userOrSession.kelasAmpu.split(',').map(k => k.trim()).filter(Boolean);
  },

  isGuruMatch(userOrSession, mapel, kelas) {
    if (!userOrSession) return false;
    if (userOrSession.role === 'admin') return true;
    if (userOrSession.role !== 'guru') return false;

    const teacherMapels = this.getGuruMapels(userOrSession).map(m => m.toLowerCase());
    const teacherKelas = this.getGuruKelas(userOrSession).map(k => k.toLowerCase());

    const mapelMatch = teacherMapels.length === 0 || (mapel && teacherMapels.includes(mapel.trim().toLowerCase()));
    const kelasMatch = teacherKelas.length === 0 || !kelas || teacherKelas.includes(kelas.trim().toLowerCase());

    return mapelMatch && kelasMatch;
  },

  async deleteUser(id) {
    this.setUsers(this.getUsers().filter(u => u.id !== id));
    if (this.client) {
      try {
        await this.client.from('users').delete().eq('id', id);
      } catch (e) {
        console.error('Supabase deleteUser error:', e);
      }
    }
  },

  // ── Bank Soal (Supabase Select, Insert, Update, Delete) ──
  getSoal() { return this.get('soal') || []; },
  setSoal(s) { return this.set('soal', s); },

  async fetchSoal() {
    if (this.client) {
      const { data, error } = await this.client.from('soal').select('*').order('created_at', { ascending: false });
      if (!error && data) {
        const camelList = data.map(s => this._toCamelSoal(s));
        this.setSoal(camelList);
        return camelList;
      }
    }
    return this.getSoal();
  },

  getSoalById(id) {
    return this.getSoal().find(s => s.id === id) || null;
  },

  async fetchSoalById(id) {
    if (this.client) {
      try {
        const { data, error } = await this.client.from('soal').select('*').eq('id', id).maybeSingle();
        if (!error && data) {
          const item = this._toCamelSoal(data);
          const list = this.getSoal().filter(s => s.id !== id);
          list.push(item);
          this.setSoal(list);
          return item;
        }
      } catch (e) {}
    }
    return this.getSoalById(id);
  },

  async addSoal(soal) {
    const list = this.getSoal();
    soal.id = soal.id || this._uid();
    soal.createdAt = Date.now();
    list.push(soal);
    this.setSoal(list);

    if (this.client) {
      try {
        await this.client.from('soal').insert([this._toSnakeSoal(soal)]);
      } catch (e) {
        console.error('Supabase addSoal error:', e);
      }
    }
    return soal;
  },

  async updateSoal(id, data) {
    const list = this.getSoal().map(s => s.id === id ? { ...s, ...data, updatedAt: Date.now() } : s);
    this.setSoal(list);

    if (this.client) {
      try {
        await this.client.from('soal').update(this._toSnakeSoal({ id, ...data })).eq('id', id);
      } catch (e) {
        console.error('Supabase updateSoal error:', e);
      }
    }
  },

  async deleteSoal(id) {
    this.setSoal(this.getSoal().filter(s => s.id !== id));
    if (this.client) {
      try {
        await this.client.from('soal').delete().eq('id', id);
      } catch (e) {
        console.error('Supabase deleteSoal error:', e);
      }
    }
  },

  // ── Manajemen Ujian (Supabase Select, Insert, Update, Delete) ──
  getUjian() { return this.get('ujian') || []; },
  setUjian(u) { return this.set('ujian', u); },

  async fetchUjian() {
    if (this.client) {
      const { data, error } = await this.client.from('ujian').select('*').order('created_at', { ascending: false });
      if (!error && data) {
        const camelList = data.map(u => this._toCamelUjian(u));
        this.setUjian(camelList);
        return camelList;
      }
    }
    return this.getUjian();
  },

  getUjianById(id) {
    return this.getUjian().find(u => u.id === id) || null;
  },

  async fetchUjianById(id) {
    if (this.client) {
      try {
        const { data, error } = await this.client.from('ujian').select('*').eq('id', id).maybeSingle();
        if (!error && data) {
          const item = this._toCamelUjian(data);
          const list = this.getUjian().map(u => u.id === id ? item : u);
          if (!list.find(u => u.id === id)) list.push(item);
          this.setUjian(list);
          return item;
        }
      } catch (e) {}
    }
    return this.getUjianById(id);
  },

  getUjianByKode(kode) {
    const cleanKode = (kode || '').toUpperCase();
    return this.getUjian().find(u => (u.kode || '').toUpperCase() === cleanKode) || null;
  },

  async fetchUjianByKode(kode) {
    const cleanKode = (kode || '').toUpperCase();
    if (this.client) {
      try {
        const { data, error } = await this.client.from('ujian').select('*').eq('kode', cleanKode).maybeSingle();
        if (!error && data) {
          const item = this._toCamelUjian(data);
          const list = this.getUjian().map(u => u.id === item.id ? item : u);
          if (!list.find(u => u.id === item.id)) list.push(item);
          this.setUjian(list);
          return item;
        }
      } catch (e) {}
    }
    return this.getUjianByKode(kode);
  },

  async addUjian(ujian) {
    const list = this.getUjian();
    ujian.id = ujian.id || this._uid();
    ujian.kode = ujian.kode || this._generateCode();
    ujian.createdAt = Date.now();
    ujian.status = ujian.status || 'draft';
    list.push(ujian);
    this.setUjian(list);

    if (this.client) {
      try {
        await this.client.from('ujian').insert([this._toSnakeUjian(ujian)]);
      } catch (e) {
        console.error('Supabase addUjian error:', e);
      }
    }
    return ujian;
  },

  async updateUjian(id, data) {
    const list = this.getUjian().map(u => u.id === id ? { ...u, ...data, updatedAt: Date.now() } : u);
    this.setUjian(list);
    const updated = list.find(u => u.id === id);

    if (this.client) {
      try {
        await this.client.from('ujian').update(this._toSnakeUjian({ id, ...data })).eq('id', id);
      } catch (e) {
        console.error('Supabase updateUjian error:', e);
      }
    }
    return updated;
  },

  async deleteUjian(id) {
    this.setUjian(this.getUjian().filter(u => u.id !== id));
    if (this.client) {
      try {
        await this.client.from('ujian').delete().eq('id', id);
      } catch (e) {
        console.error('Supabase deleteUjian error:', e);
      }
    }
  },

  // ── Autosave Jawaban Siswa (Supabase Upsert & Select) ──
  getJawaban(ujianId, siswaId) {
    return this.get(`jawaban_${ujianId}_${siswaId}`) || { answers: {}, flagged: [], startTime: null, violations: [] };
  },

  async fetchJawaban(ujianId, siswaId) {
    const pairId = `${ujianId}_${siswaId}`;
    if (this.client) {
      try {
        const { data, error } = await this.client.from('jawaban').select('*').eq('id', pairId).maybeSingle();
        if (!error && data) {
          const item = {
            answers: data.answers || {},
            flagged: data.flagged || [],
            violations: data.violations || [],
            startTime: data.start_time
          };
          this.set(`jawaban_${ujianId}_${siswaId}`, item);
          return item;
        }
      } catch (e) {}
    }
    return this.getJawaban(ujianId, siswaId);
  },

  async saveJawaban(ujianId, siswaId, data) {
    const payloadCache = { ...data, lastSaved: Date.now() };
    this.set(`jawaban_${ujianId}_${siswaId}`, payloadCache);

    if (this.client) {
      try {
        const row = {
          id: `${ujianId}_${siswaId}`,
          ujian_id: ujianId,
          siswa_id: siswaId,
          answers: data.answers || {},
          flagged: data.flagged || [],
          violations: data.violations || [],
          start_time: data.startTime || null,
          last_saved: new Date().toISOString()
        };
        const { error } = await this.client.from('jawaban').upsert(row);
        if (error) console.warn('Supabase saveJawaban error:', error);
        return !error;
      } catch (e) {
        console.warn('Supabase saveJawaban network exception:', e);
      }
    }
    return true;
  },

  // ── Hasil & Nilai Ujian Siswa (Supabase Select, Insert, Update) ──
  getHasil() { return this.get('hasil') || []; },
  setHasil(h) { return this.set('hasil', h); },

  async fetchHasil() {
    if (this.client) {
      const { data, error } = await this.client.from('hasil').select('*').order('submitted_at', { ascending: false });
      if (!error && data) {
        const camelList = data.map(h => this._toCamelHasil(h));
        this.setHasil(camelList);
        return camelList;
      }
    }
    return this.getHasil();
  },

  async getHasilById(id) {
    if (this.client) {
      try {
        const { data, error } = await this.client.from('hasil').select('*').eq('id', id).maybeSingle();
        if (!error && data) {
          const item = this._toCamelHasil(data);
          const list = this.getHasil().map(h => h.id === id ? item : h);
          if (!list.find(h => h.id === id)) list.push(item);
          this.setHasil(list);
          return item;
        }
      } catch (e) {}
    }
    return this.getHasil().find(h => h.id === id);
  },

  async addHasil(hasil) {
    const list = this.getHasil();
    hasil.id = hasil.id || this._uid();
    hasil.submittedAt = Date.now();
    list.push(hasil);
    this.setHasil(list);

    if (this.client) {
      try {
        await this.client.from('hasil').insert([this._toSnakeHasil(hasil)]);
      } catch (e) {
        console.error('Supabase addHasil error:', e);
      }
    }
    return hasil;
  },

  async updateHasil(id, data) {
    const list = this.getHasil().map(h => h.id === id ? { ...h, ...data } : h);
    this.setHasil(list);
    const updated = list.find(h => h.id === id);

    if (this.client) {
      try {
        await this.client.from('hasil').update(this._toSnakeHasil({ id, ...data })).eq('id', id);
      } catch (e) {
        console.error('Supabase updateHasil error:', e);
      }
    }
    return updated;
  },

  getHasilByUjian(ujianId) { return this.getHasil().filter(h => h.ujianId === ujianId); },
  getHasilBySiswa(siswaId) { return this.getHasil().filter(h => h.siswaId === siswaId); },
  getHasilBySiswaUjian(siswaId, ujianId) { return this.getHasil().find(h => h.siswaId === siswaId && h.ujianId === ujianId); },

  async fetchHasilBySiswaUjian(siswaId, ujianId) {
    if (this.client) {
      try {
        const { data, error } = await this.client
          .from('hasil')
          .select('*')
          .eq('siswa_id', siswaId)
          .eq('ujian_id', ujianId)
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!error && data) {
          const item = this._toCamelHasil(data);
          const list = this.getHasil().filter(h => h.id !== item.id);
          list.push(item);
          this.setHasil(list);
          return item;
        }
      } catch (e) {
        console.warn('fetchHasilBySiswaUjian query error:', e);
      }
    }
    return this.getHasilBySiswaUjian(siswaId, ujianId);
  },

  async fetchKunciJawaban(soalIds = []) {
    if (!this.client || soalIds.length === 0) {
      const map = {};
      const localSoal = this.getSoal();
      soalIds.forEach(id => {
        const found = localSoal.find(s => s.id === id);
        if (found) map[id] = found.jawaban;
      });
      return map;
    }
    try {
      const { data, error } = await this.client
        .from('soal')
        .select('id, jawaban')
        .in('id', soalIds);
      if (!error && data) {
        const map = {};
        data.forEach(item => { map[item.id] = item.jawaban; });
        return map;
      }
    } catch (e) {
      console.warn('fetchKunciJawaban error:', e);
    }
    const map = {};
    const localSoal = this.getSoal();
    soalIds.forEach(id => {
      const found = localSoal.find(s => s.id === id);
      if (found) map[id] = found.jawaban;
    });
    return map;
  },

  // ── Audit Log & Pelanggaran (Supabase Select & Insert) ──
  getLogs() { return this.get('audit_logs') || []; },

  async fetchLogs() {
    if (this.client) {
      const { data, error } = await this.client.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(500);
      if (!error && data) {
        const camelList = data.map(l => this._toCamelLog(l));
        this.set('audit_logs', camelList);
        return camelList;
      }
    }
    return this.getLogs();
  },

  async addLog(log) {
    const logs = this.getLogs();
    log.id = log.id || this._uid();
    log.timestamp = Date.now();
    logs.unshift(log);
    if (logs.length > 5000) logs.pop();
    this.set('audit_logs', logs);

    if (this.client) {
      try {
        await this.client.from('audit_logs').insert([this._toSnakeLog(log)]);
      } catch (e) {
        console.error('Supabase addLog error:', e);
      }
    }
    return log;
  },

  getLogsByHasil(hasilId) { return this.getLogs().filter(l => l.hasilId === hasilId); },
  getLogsByUjian(ujianId) { return this.getLogs().filter(l => l.ujianId === ujianId); },

  // ── Sesi Pengguna ──
  getSession() { return this.get('session'); },
  setSession(data) { return this.set('session', { ...data, loginAt: Date.now() }); },
  clearSession() { this.remove('session'); },

  // ── Pengaturan Sistem ──
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

  // ── Utility Identitas & Kode ──
  _uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
  _generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  },

  // ── Seed Data Awal (Jika Cloud Kosong / Mode Demo) ──
  async seed() {
    if (this.get('seeded')) return;

    // Guru default
    await this.addUser({ id: 'u-guru-1', username: 'guru1', password: 'guru123', name: 'Pak Budi Santoso', role: 'guru', email: 'guru1@sekolah.id', active: true });
    await this.addUser({ id: 'u-guru-2', username: 'guru2', password: 'guru123', name: 'Bu Sri Wulandari', role: 'guru', email: 'guru2@sekolah.id', active: true });

    // Siswa default
    await this.addUser({ id: 'u-siswa-1', username: 'siswa1', password: '12345', name: 'Ahmad Fauzi', role: 'siswa', kelas: 'XI IPA 1', no_absen: '01', active: true });
    await this.addUser({ id: 'u-siswa-2', username: 'siswa2', password: '12345', name: 'Budi Raharjo', role: 'siswa', kelas: 'XI IPA 1', no_absen: '02', active: true });
    await this.addUser({ id: 'u-siswa-3', username: 'siswa3', password: '12345', name: 'Citra Dewi', role: 'siswa', kelas: 'XI IPA 1', no_absen: '03', active: true });
    await this.addUser({ id: 'u-siswa-4', username: 'siswa4', password: '12345', name: 'Diana Putri', role: 'siswa', kelas: 'XI IPA 2', no_absen: '01', active: true });

    // Soal default
    const guru = this.getUsers().find(u => u.role === 'guru') || { id: 'u-guru-1', name: 'Pak Budi Santoso' };
    const soalData = [
      {
        id: 's-1', tipe: 'pg', mapel: 'Matematika', kelas: 'XI', bab: 'Aljabar',
        pertanyaan: 'Jika f(x) = 2x + 3, maka nilai f(5) adalah...',
        pilihan: ['10', '11', '13', '15', '16'], jawaban: 'C',
        bobot: 1, tingkat: 'mudah', pembuatId: guru.id,
      },
      {
        id: 's-2', tipe: 'pg', mapel: 'Matematika', kelas: 'XI', bab: 'Aljabar',
        pertanyaan: 'Hasil dari (2x + 3)(x - 1) adalah...',
        pilihan: ['2x² + x - 3', '2x² - x + 3', '2x² + x + 3', '2x² - 2x - 3', '2x² + 2x - 3'],
        jawaban: 'A', bobot: 1, tingkat: 'sedang', pembuatId: guru.id,
      },
      {
        id: 's-3', tipe: 'pg', mapel: 'Matematika', kelas: 'XI', bab: 'Trigonometri',
        pertanyaan: 'Nilai sin 30° + cos 60° adalah...',
        pilihan: ['0', '½', '1', '√3/2', '√2'],
        jawaban: 'C', bobot: 1, tingkat: 'mudah', pembuatId: guru.id,
      },
      {
        id: 's-4', tipe: 'pg', mapel: 'Matematika', kelas: 'XI', bab: 'Trigonometri',
        pertanyaan: 'Persamaan tan x = √3 mempunyai penyelesaian x = ...',
        pilihan: ['30°', '45°', '60°', '90°', '120°'],
        jawaban: 'C', bobot: 1, tingkat: 'sedang', pembuatId: guru.id,
      },
      {
        id: 's-5', tipe: 'bs', mapel: 'Matematika', kelas: 'XI', bab: 'Aljabar',
        pertanyaan: 'Bilangan prima antara 10 dan 20 berjumlah 4 bilangan.',
        jawaban: 'Benar', bobot: 1, tingkat: 'mudah', pembuatId: guru.id,
      },
      {
        id: 's-6', tipe: 'isian', mapel: 'Matematika', kelas: 'XI', bab: 'Aljabar',
        pertanyaan: 'Jika 3x - 6 = 12, maka nilai x adalah...',
        jawaban: '6', bobot: 2, tingkat: 'mudah', pembuatId: guru.id,
      },
      {
        id: 's-7', tipe: 'uraian', mapel: 'Matematika', kelas: 'XI', bab: 'Aljabar',
        pertanyaan: 'Jelaskan langkah-langkah menyelesaikan persamaan kuadrat ax² + bx + c = 0 menggunakan rumus kuadrat (abc)!',
        jawaban: 'Rumus kuadrat: x = (-b ± √(b²-4ac)) / 2a. Langkah: 1) Identifikasi nilai a, b, c 2) Hitung diskriminan D = b²-4ac 3) Substitusi ke rumus 4) Hitung nilai x',
        bobot: 5, tingkat: 'sulit', pembuatId: guru.id,
      },
    ];

    for (const s of soalData) {
      await this.addSoal(s);
    }

    const soalList = this.getSoal();
    const ujianContoh = await this.addUjian({
      id: 'u-sample-1',
      kode: 'MATH11',
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
      status: 'aktif'
    });

    this.set('seeded', true);
  }
};
