const Layout = {
  ADMIN_MENU: [
    { section: 'Utama' },
    { id: 'dashboard', icon: '🏠', label: 'Dashboard', href: 'dashboard-guru.html' },
    { id: 'manajemen-ujian', icon: '📋', label: 'Manajemen Ujian', href: 'manajemen-ujian.html' },
    { id: 'bank-soal', icon: '📚', label: 'Bank Soal', href: 'bank-soal.html' },
    { section: 'Laporan' },
    { id: 'hasil', icon: '📊', label: 'Hasil & Nilai', href: 'hasil.html' },
    { id: 'audit-log', icon: '🔍', label: 'Audit Log', href: 'audit-log.html' },
    { section: 'Pengaturan' },
    { id: 'pengaturan', icon: '⚙️', label: 'Pengaturan & Akun', href: 'pengaturan.html' },
  ],

  GURU_MENU: [
    { section: 'Utama' },
    { id: 'dashboard', icon: '🏠', label: 'Dashboard', href: 'dashboard-guru.html' },
    { id: 'manajemen-ujian', icon: '📋', label: 'Manajemen Ujian', href: 'manajemen-ujian.html' },
    { id: 'bank-soal', icon: '📚', label: 'Bank Soal', href: 'bank-soal.html' },
    { section: 'Laporan' },
    { id: 'hasil', icon: '📊', label: 'Hasil & Nilai', href: 'hasil.html' },
    { section: 'Akun' },
    { id: 'pengaturan', icon: '⚙️', label: 'Profil & Mapel', href: 'pengaturan.html' },
  ],

  initStaff(activeId, allowedRoles = ['guru', 'admin']) {
    const session = Auth.requireAuth('../pages/login-guru.html');
    if (!session) return null;

    const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    if (!allowed.includes(session.role)) {
      if (session.role === 'guru') {
        window.location.href = 'dashboard-guru.html';
        return null;
      }
      if (session.role === 'siswa') {
        window.location.href = 'dashboard-siswa.html';
        return null;
      }
      window.location.href = '../pages/login-guru.html';
      return null;
    }

    if (!document.querySelector("link[rel*='icon']")) {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/svg+xml';
      link.href = '../favicon.svg';
      document.head.appendChild(link);
    }

    if (activeId === 'audit-log' && typeof DB !== 'undefined' && DB.markLogsAsSeen) {
      DB.markLogsAsSeen();
    }
    this._buildLayout(session, activeId);
    return session;
  },

  initGuru(activeId) {
    return this.initStaff(activeId, ['guru', 'admin']);
  },

  _buildLayout(session, activeId) {
    this.currentSession = session;
    this.currentActiveId = activeId;
    if (activeId === 'audit-log' && typeof DB !== 'undefined' && DB.markLogsAsSeen) {
      DB.markLogsAsSeen();
    }

    const stats = this._getGuruStats(session);
    const isAdmin = session.role === 'admin';
    const menuList = isAdmin ? this.ADMIN_MENU : this.GURU_MENU;
    const roleLabel = isAdmin ? 'Administrator' : 'Guru / Pendidik';

    document.body.innerHTML = `
      <div id="toast-container"></div>
      <div class="sidebar-overlay" id="sidebar-overlay" onclick="Layout.closeSidebar()"></div>
      <div class="app-wrapper">
        <nav class="sidebar" id="sidebar">
          <div class="sidebar-logo">
            <div class="sidebar-logo-icon" style="padding:4px"><img src="../favicon.svg" alt="Logo" style="width:28px;height:28px;display:block"/></div>
            <div class="sidebar-logo-text">Ulangan Digital<span>${isAdmin ? 'Panel Administrator' : 'Portal Pendidik'}</span></div>
          </div>
          <div class="sidebar-nav">
            ${menuList.map(item => {
              if (item.section) return `<div class="sidebar-section-label">${item.section}</div>`;
              const badge = item.id === 'audit-log' && stats.violationToday > 0 ? `<span class="badge" style="background:var(--danger);color:white;font-size:10px;padding:1px 6px;border-radius:999px">${stats.violationToday}</span>` : '';
              return `<a href="${item.href}" class="sidebar-item ${item.id === activeId ? 'active' : ''}">
                <span class="icon">${item.icon}</span>
                <span>${item.label}</span>
                ${badge}
              </a>`;
            }).join('')}
          </div>
          <div class="sidebar-footer">
            <div class="sidebar-user">
              <div class="sidebar-user-avatar">${Utils.getInitials(session.name)}</div>
              <div>
                <div class="sidebar-user-name">${Utils.escapeHtml(session.name)}</div>
                <div class="sidebar-user-role">${roleLabel}</div>
              </div>
            </div>
            <button onclick="Auth.logout()" class="btn btn-secondary btn-full btn-sm mt-4" style="background:rgba(255,255,255,0.15);color:rgba(255,255,255,0.8)">
              🚪 Keluar
            </button>
          </div>
        </nav>
        <div class="main-content">
          <header class="topbar">
            <div class="topbar-left">
              <button class="hamburger" onclick="Layout.toggleSidebar()">☰</button>
              <span class="topbar-page-title" id="page-title">Dashboard</span>
            </div>
            <div class="topbar-right">
              ${(isAdmin || session.role === 'guru') ? `
              <button class="topbar-notif" onclick="window.location.href='audit-log.html'" title="Notifikasi Pelanggaran">
                🔔
                ${stats.violationToday > 0 ? '<span class="notif-dot"></span>' : ''}
              </button>` : ''}
              <div class="topbar-avatar" title="${Utils.escapeHtml(session.name)}">${Utils.getInitials(session.name)}</div>
            </div>
          </header>
          <div class="page-content" id="app-content">
            <div style="display:flex;align-items:center;justify-content:center;height:200px">
              <div class="spinner"></div>
            </div>
          </div>
        </div>
      </div>`;

    if (!this._notifListenerAttached && typeof window !== 'undefined') {
      this._notifListenerAttached = true;
      window.addEventListener('audit-log-seen', () => this.refreshNotifBadge());
      window.addEventListener('supabase-synced', () => this.refreshNotifBadge());
      window.addEventListener('storage-updated', (e) => {
        if (e.detail?.key === 'audit_log_last_seen' || e.detail?.key === 'audit_logs') {
          this.refreshNotifBadge();
        }
      });
    }
  },

  _getGuruStats(session) {
    if (this.currentActiveId === 'audit-log') {
      return { violationToday: 0 };
    }
    const unread = (typeof DB !== 'undefined' && DB.getUnreadViolationsCount)
      ? DB.getUnreadViolationsCount()
      : 0;
    return { violationToday: unread };
  },

  markAuditLogSeen() {
    if (typeof DB !== 'undefined' && DB.markLogsAsSeen) {
      DB.markLogsAsSeen();
    }
    this.refreshNotifBadge();
  },

  refreshNotifBadge() {
    const stats = this._getGuruStats(this.currentSession || (typeof DB !== 'undefined' ? DB.getSession() : null));
    const badgeEl = document.querySelector('.sidebar-item[href="audit-log.html"] .badge');
    if (badgeEl) {
      if (stats.violationToday > 0) {
        badgeEl.textContent = stats.violationToday;
        badgeEl.style.display = 'inline-block';
      } else {
        badgeEl.remove();
      }
    } else if (stats.violationToday > 0) {
      const auditLink = document.querySelector('.sidebar-item[href="audit-log.html"]');
      if (auditLink) {
        auditLink.insertAdjacentHTML('beforeend', `<span class="badge" style="background:var(--danger);color:white;font-size:10px;padding:1px 6px;border-radius:999px">${stats.violationToday}</span>`);
      }
    }

    const notifDot = document.querySelector('.topbar-notif .notif-dot');
    if (notifDot && stats.violationToday <= 0) {
      notifDot.remove();
    } else if (!notifDot && stats.violationToday > 0) {
      const btn = document.querySelector('.topbar-notif');
      if (btn) btn.innerHTML = `🔔<span class="notif-dot"></span>`;
    }
  },

  toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('show');
  },
  closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('show');
  },

  setPageTitle(title) {
    const el = document.getElementById('page-title');
    if (el) el.textContent = title;
    document.title = `${title} - Ulangan Digital`;
  },

  setContent(html) {
    const el = document.getElementById('app-content');
    if (el) {
      el.innerHTML = html;
      // Pindahkan elemen modal langsung ke document.body agar tidak terpotong fixed sidebar
      el.querySelectorAll('.modal-backdrop').forEach(modal => {
        if (modal.id) {
          const old = document.querySelector(`body > #${modal.id}`);
          if (old && old !== modal) old.remove();
        }
        document.body.appendChild(modal);
      });
    }
  },
};
