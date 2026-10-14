const Auth = {
  _csrfToken: null,

  // ── Inisialisasi & Supabase Auth Listener ──
  init() {
    this._csrfToken = sessionStorage.getItem('csrf') || Utils.generateCSRFToken();
    sessionStorage.setItem('csrf', this._csrfToken);

    if (DB.client) {
      DB.client.auth.getSession().then(({ data: { session } }) => {
        if (session && session.user) {
          const meta = session.user.user_metadata || {};
          const current = DB.getSession();
          if (!current && meta.role) {
            DB.setSession({
              userId: session.user.id,
              username: meta.username || session.user.email?.split('@')[0],
              name: meta.name || session.user.email,
              role: meta.role,
              kelas: meta.kelas || '',
              email: session.user.email
            });
          }
        }
      }).catch(() => {});

      DB.client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
          DB.clearSession();
        }
      });
    }
  },

  // ── Supabase Auth Login & Role Verification ──
  async login(identifier, password, expectedRole) {
    identifier = Utils.sanitizeInput(identifier || '');
    password = Utils.sanitizeInput(password || '');

    if (!identifier || !password) {
      return { success: false, error: 'Username/Email dan password harus diisi' };
    }

    let authUser = null;
    const isEmail = identifier.includes('@');

    // 1. Coba login langsung via Supabase Auth jika input adalah email
    if (isEmail && DB.client) {
      try {
        const { data, error } = await DB.client.auth.signInWithPassword({
          email: identifier,
          password: password
        });

        if (!error && data?.user) {
          const userMeta = data.user.user_metadata || {};
          let profile = await DB.findUserById(data.user.id);
          if (!profile) {
            profile = {
              id: data.user.id,
              username: userMeta.username || identifier.split('@')[0],
              name: userMeta.name || identifier.split('@')[0],
              role: userMeta.role || (Array.isArray(expectedRole) ? expectedRole[0] : expectedRole) || 'siswa',
              email: data.user.email,
              kelas: userMeta.kelas || '',
              active: true
            };
          }
          authUser = profile;
        }
      } catch (err) {
        console.warn('Supabase Auth signIn failed, fallback to users table:', err);
      }
    }

    // 2. Jika login username atau email auth belum selesai, cek tabel users di Supabase/Cache
    if (!authUser) {
      const user = await DB.findUser(identifier, password);
      if (user) {
        authUser = user;
        // Sinkronisasi ke Supabase Auth di background (non-blocking)
        if (DB.client && user.email) {
          DB.client.auth.signInWithPassword({
            email: user.email,
            password: password
          }).catch(() => {});
        }
      }
    }

    if (!authUser) {
      return { success: false, error: 'Username atau password salah' };
    }

    // 3. Verifikasi Role (Mendukung String tunggal maupun Array Role)
    if (expectedRole) {
      const allowed = Array.isArray(expectedRole) ? expectedRole : [expectedRole];
      if (!allowed.includes(authUser.role)) {
        const roleLabel = authUser.role === 'siswa' ? 'Siswa' : authUser.role === 'guru' ? 'Guru' : 'Admin';
        const expectedLabel = allowed.map(r => r === 'siswa' ? 'Siswa' : r === 'guru' ? 'Guru' : 'Admin').join(' / ');
        return {
          success: false,
          error: `Akun ini terdaftar sebagai ${roleLabel}, bukan ${expectedLabel}. Silakan gunakan portal yang sesuai.`
        };
      }
    }

    // 4. Buat sesi aman
    const session = {
      userId: authUser.id,
      username: authUser.username,
      name: authUser.name,
      role: authUser.role,
      kelas: authUser.kelas || '',
      email: authUser.email || '',
      token: Utils.generateCSRFToken(),
      loginAt: Date.now()
    };
    DB.setSession(session);

    // 5. Catat audit log ke database cloud secara background (non-blocking agar login instan)
    DB.addLog({
      type: 'LOGIN',
      category: 'auth',
      actor: authUser.name,
      actorId: authUser.id,
      detail: `Login sebagai ${authUser.role} (${authUser.username})`,
      icon: '🔐',
      severity: 'info'
    }).catch(err => console.warn('Background audit log error:', err));

    return { success: true, user: authUser, session };
  },

  // ── Logout ──
  async logout() {
    const session = this.getSession();
    if (session) {
      DB.addLog({
        type: 'LOGOUT',
        category: 'auth',
        actor: session.name,
        actorId: session.userId,
        detail: `Logout dari sistem (${session.role})`,
        icon: '👋',
        severity: 'info'
      }).catch(() => {});
    }

    if (DB.client) {
      try {
        await DB.client.auth.signOut();
      } catch (e) {
        console.warn('Supabase signOut error:', e);
      }
    }

    DB.clearSession();
    sessionStorage.removeItem('csrf');
    const isInPages = window.location.pathname.includes('/pages/');
    window.location.href = isInPages ? '../index.html' : 'index.html';
  },

  getSession() {
    return DB.getSession();
  },

  requireAuth(redirectTo = 'index.html') {
    const session = this.getSession();
    if (!session || !session.userId || !session.role) {
      window.location.href = redirectTo;
      return null;
    }
    // Sesi valid maksimal 7 hari
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    if (session.loginAt && (Date.now() - session.loginAt > maxAge)) {
      this.logout();
      return null;
    }
    return session;
  },

  requireRole(roles, redirectTo = 'index.html') {
    const session = this.requireAuth(redirectTo);
    if (!session) return null;
    const allowed = Array.isArray(roles) ? roles : [roles];
    if (!allowed.includes(session.role)) {
      window.location.href = redirectTo;
      return null;
    }
    return session;
  },

  isLoggedIn() { return !!this.getSession(); },
  isGuru() { const s = this.getSession(); return s?.role === 'guru'; },
  isSiswa() { const s = this.getSession(); return s?.role === 'siswa'; }
};

// ── Router Module ──
const Router = {
  PAGES: {
    guru: {
      dashboard: 'pages/dashboard-guru.html',
      'bank-soal': 'pages/bank-soal.html',
      'manajemen-ujian': 'pages/manajemen-ujian.html',
      'hasil': 'pages/hasil.html',
      'audit-log': 'pages/audit-log.html',
      'pengaturan': 'pages/pengaturan.html'
    },
    siswa: {
      dashboard: 'pages/dashboard-siswa.html',
      instruksi: 'pages/instruksi.html',
      ujian: 'pages/ujian.html',
      selesai: 'pages/selesai.html'
    }
  },

  go(page, params = {}) {
    const url = new URL(page, window.location.origin + window.location.pathname.replace(/[^/]*$/, ''));
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    window.location.href = url.toString();
  },

  getParam(key) {
    return new URLSearchParams(window.location.search).get(key);
  },

  getParams() {
    const params = {};
    new URLSearchParams(window.location.search).forEach((v, k) => params[k] = v);
    return params;
  }
};
