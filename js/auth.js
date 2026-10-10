/**
 * AUTH MODULE
 * Autentikasi, otorisasi, dan manajemen sesi
 */
const Auth = {
  // CSRF Token untuk proteksi
  _csrfToken: null,

  init() {
    this._csrfToken = sessionStorage.getItem('csrf') || Utils.generateCSRFToken();
    sessionStorage.setItem('csrf', this._csrfToken);
  },

  login(username, password, role) {
    // Sanitasi input
    username = Utils.sanitizeInput(username);
    password = Utils.sanitizeInput(password);

    if (!username || !password) return { success: false, error: 'Username dan password harus diisi' };

    const user = DB.findUser(username, password);
    if (!user) return { success: false, error: 'Username atau password salah' };
    if (role && user.role !== role) return { success: false, error: `Akun ini bukan akun ${role}` };

    // Buat sesi
    const session = {
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      kelas: user.kelas,
    };
    DB.setSession(session);

    // Log aktivitas
    DB.addLog({
      type: 'LOGIN',
      category: 'auth',
      actor: user.name,
      actorId: user.id,
      detail: `Login sebagai ${user.role}`,
      icon: '🔐',
      severity: 'info',
    });

    return { success: true, user, session };
  },

  logout() {
    const session = this.getSession();
    if (session) {
      DB.addLog({
        type: 'LOGOUT',
        category: 'auth',
        actor: session.name,
        actorId: session.userId,
        detail: 'Logout dari sistem',
        icon: '👋',
        severity: 'info',
      });
    }
    DB.clearSession();
    sessionStorage.removeItem('csrf');
    window.location.href = 'index.html';
  },

  getSession() { return DB.getSession(); },

  requireAuth(redirectTo = 'index.html') {
    const session = this.getSession();
    if (!session) { window.location.href = redirectTo; return null; }
    return session;
  },

  requireRole(role, redirectTo = 'index.html') {
    const session = this.requireAuth(redirectTo);
    if (!session) return null;
    if (session.role !== role) { window.location.href = redirectTo; return null; }
    return session;
  },

  isLoggedIn() { return !!this.getSession(); },
  isGuru() { const s = this.getSession(); return s?.role === 'guru'; },
  isSiswa() { const s = this.getSession(); return s?.role === 'siswa'; },
};

/**
 * ROUTER MODULE
 * SPA-like page routing/navigation
 */
const Router = {
  PAGES: {
    guru: {
      dashboard: 'pages/dashboard-guru.html',
      'bank-soal': 'pages/bank-soal.html',
      'manajemen-ujian': 'pages/manajemen-ujian.html',
      'buat-ujian': 'pages/buat-ujian.html',
      'hasil': 'pages/hasil.html',
      'audit-log': 'pages/audit-log.html',
      'pengaturan': 'pages/pengaturan.html',
    },
    siswa: {
      dashboard: 'pages/dashboard-siswa.html',
      instruksi: 'pages/instruksi.html',
      ujian: 'pages/ujian.html',
      selesai: 'pages/selesai.html',
      hasil: 'pages/hasil-siswa.html',
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
