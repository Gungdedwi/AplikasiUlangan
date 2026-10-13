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
              role: userMeta.role || expectedRole || 'siswa',
              email: data.user.email,
              kelas: userMeta.kelas || '',
              active: true
            };
          }
          authUser = profile;
        }
      } catch (err) {
        console.warn('Supabase Auth signIn failed:', err);
      }
    }

    // 2. Jika login username atau fallback, cek tabel users di Supabase/Cache
    if (!authUser) {
      const user = await DB.findUser(identifier, password);
      if (user) {
        authUser = user;
        // Sinkronisasi ke Supabase Auth jika client aktif
        if (DB.client && user.email) {
          try {
            await DB.client.auth.signInWithPassword({
              email: user.email,
              password: password
            });
          } catch (e) {
            // Jika akun auth belum ada, coba auto signup
            try {
              await DB.client.auth.signUp({
                email: user.email,
                password: password,
                options: {
                  data: {
                    role: user.role,
                    name: user.name,
                    username: user.username,
                    kelas: user.kelas || ''
                  }
                }
              });
            } catch (signupErr) {}
          }
        }
      }
    }

    if (!authUser) {
      return { success: false, error: 'Username atau password salah' };
    }

    // 3. Verifikasi Role (Guru vs Siswa)
    if (expectedRole && authUser.role !== expectedRole) {
      return {
        success: false,
        error: `Akun ini terdaftar sebagai ${authUser.role.toUpperCase()}, bukan ${expectedRole.toUpperCase()}`
      };
    }

    // 4. Buat sesi
    const session = {
      userId: authUser.id,
      username: authUser.username,
      name: authUser.name,
      role: authUser.role,
      kelas: authUser.kelas || '',
      email: authUser.email || ''
    };
    DB.setSession(session);

    // 5. Catat audit log ke cloud database
    await DB.addLog({
      type: 'LOGIN',
      category: 'auth',
      actor: authUser.name,
      actorId: authUser.id,
      detail: `Login sebagai ${authUser.role} (${authUser.username})`,
      icon: '🔐',
      severity: 'info'
    });

    return { success: true, user: authUser, session };
  },

  // ── Logout ──
  async logout() {
    const session = this.getSession();
    if (session) {
      await DB.addLog({
        type: 'LOGOUT',
        category: 'auth',
        actor: session.name,
        actorId: session.userId,
        detail: `Logout dari sistem (${session.role})`,
        icon: '👋',
        severity: 'info'
      });
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
    if (!session) {
      window.location.href = redirectTo;
      return null;
    }
    return session;
  },

  requireRole(role, redirectTo = 'index.html') {
    const session = this.requireAuth(redirectTo);
    if (!session) return null;
    if (session.role !== role) {
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
