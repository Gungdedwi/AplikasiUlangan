const Utils = {
  // === FORMAT ===
  formatTime(seconds) {
    if (seconds < 0) seconds = 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  },
  formatDate(ts, opts = {}) {
    if (!ts) return '-';
    const d = new Date(ts);
    const defaultOpts = { day:'2-digit', month:'short', year:'numeric', ...opts };
    return d.toLocaleDateString('id-ID', defaultOpts);
  },
  formatDateTime(ts) {
    if (!ts) return '-';
    const d = new Date(ts);
    return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  },
  formatDuration(seconds) {
    if (!seconds) return '-';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h} jam ${m} menit`;
    if (m > 0) return `${m} menit ${s} detik`;
    return `${s} detik`;
  },
  formatScore(score) {
    if (score === null || score === undefined) return '-';
    return parseFloat(score).toFixed(1);
  },
  getInitials(name) {
    if (!name) return '?';
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  },
  timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'baru saja';
    if (mins < 60) return `${mins} menit lalu`;
    if (hours < 24) return `${hours} jam lalu`;
    return `${days} hari lalu`;
  },

  // === SECURITY ===
  escapeHtml(str) {
    if (typeof str !== 'string') return str;
    const map = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' };
    return str.replace(/[&<>"']/g, m => map[m]);
  },
  generateCSRFToken() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2,'0')).join('');
  },
  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return input.trim().replace(/<[^>]*>/g, '');
  },

  // === VALIDATION ===
  validators: {
    required: (v) => (v !== null && v !== undefined && v.toString().trim() !== '') ? null : 'Field ini wajib diisi',
    minLen: (min) => (v) => v && v.length >= min ? null : `Minimal ${min} karakter`,
    maxLen: (max) => (v) => !v || v.length <= max ? null : `Maksimal ${max} karakter`,
    numeric: (v) => !isNaN(v) && v !== '' ? null : 'Harus berupa angka',
    min: (n) => (v) => parseFloat(v) >= n ? null : `Minimal ${n}`,
    max: (n) => (v) => parseFloat(v) <= n ? null : `Maksimal ${n}`,
    username: (v) => /^[a-zA-Z0-9_]{3,20}$/.test(v) ? null : 'Username: 3-20 karakter (huruf, angka, _)',
  },
  validate(value, rules) {
    for (const rule of rules) {
      const err = rule(value);
      if (err) return err;
    }
    return null;
  },
  validateForm(fields) {
    const errors = {};
    let valid = true;
    for (const [field, { value, rules }] of Object.entries(fields)) {
      const err = this.validate(value, rules);
      if (err) { errors[field] = err; valid = false; }
    }
    return { valid, errors };
  },
  showFieldErrors(errors) {
    Object.entries(errors).forEach(([field, msg]) => {
      const el = document.getElementById(field);
      if (el) {
        el.classList.add('error');
        const errEl = el.parentElement.querySelector('.form-error');
        if (errEl) errEl.textContent = msg;
        else {
          const div = document.createElement('div');
          div.className = 'form-error';
          div.textContent = msg;
          el.parentElement.appendChild(div);
        }
      }
    });
  },
  clearFieldErrors() {
    document.querySelectorAll('.form-control.error').forEach(el => el.classList.remove('error'));
    document.querySelectorAll('.form-error').forEach(el => el.remove());
  },

  // === DOM HELPERS ===
  $(selector, ctx = document) { return ctx.querySelector(selector); },
  $$(selector, ctx = document) { return [...ctx.querySelectorAll(selector)]; },
  createElement(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'className') el.className = v;
      else if (k === 'innerHTML') el.innerHTML = v;
      else if (k === 'textContent') el.textContent = v;
      else el.setAttribute(k, v);
    });
    children.forEach(child => {
      if (typeof child === 'string') el.insertAdjacentHTML('beforeend', child);
      else el.appendChild(child);
    });
    return el;
  },
  showElement(el) { if (el) el.classList.remove('hidden'); },
  hideElement(el) { if (el) el.classList.add('hidden'); },
  toggleElement(el) { if (el) el.classList.toggle('hidden'); },

  // === TOAST ===
  toast(msg, type = 'info', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${this.escapeHtml(msg)}</span>`;
    container.appendChild(toast);
    toast.addEventListener('click', () => toast.remove());
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  // === CONFIRM MODAL ===
  confirm(title, message, onConfirm, type = 'danger') {
    const btnColors = { danger: 'btn-danger', warning: 'btn-warning', primary: 'btn-primary' };
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal animate-scale-in" style="max-width:420px">
        <div class="modal-header">
          <h3 class="modal-title">${this.escapeHtml(title)}</h3>
        </div>
        <div class="modal-body">
          <p style="color:var(--gray-600);font-size:14px">${this.escapeHtml(message)}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="confirm-cancel">Batal</button>
          <button class="btn ${btnColors[type]}" id="confirm-ok">Ya, Lanjutkan</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('confirm-cancel').onclick = () => modal.remove();
    document.getElementById('confirm-ok').onclick = () => { modal.remove(); onConfirm(); };
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  },

  // === SCORING ===
  hitungNilai(ujian, jawaban, soalList) {
    let totalBobot = 0;
    let bobotBenar = 0;
    const detail = {};

    soalList.forEach(soal => {
      const bobot = soal.bobot || 1;
      totalBobot += bobot;
      const jwb = jawaban.answers?.[soal.id];
      let benar = false;

      if (soal.tipe === 'pg' || soal.tipe === 'bs') {
        benar = jwb !== undefined && jwb === soal.jawaban;
      } else if (soal.tipe === 'isian') {
        benar = jwb !== undefined && jwb.trim().toLowerCase() === soal.jawaban.trim().toLowerCase();
      } else if (soal.tipe === 'uraian') {
        // Uraian perlu dinilai manual, set 0 dulu
        benar = false;
        detail[soal.id] = { status: 'manual', bobot, bobotDapat: 0 };
        return;
      }

      const bobotDapat = benar ? bobot : 0;
      bobotBenar += bobotDapat;
      detail[soal.id] = { benar, bobot, bobotDapat, jawaban: jwb, kunci: soal.jawaban };
    });

    const nilai = totalBobot > 0 ? Math.round((bobotBenar / totalBobot) * 100 * 10) / 10 : 0;
    const lulus = nilai >= (ujian.kkm || 75);
    const dijawab = Object.keys(jawaban.answers || {}).length;

    return { nilai, lulus, totalBobot, bobotBenar, dijawab, detail, totalSoal: soalList.length };
  },

  // === DATE/TIME ===
  isUjianAktif(ujian) {
    if (ujian.status !== 'aktif') return false;
    const now = Date.now();
    const mulai = ujian.jadwalMulai ? new Date(ujian.jadwalMulai).getTime() : 0;
    const selesai = ujian.jadwalSelesai ? new Date(ujian.jadwalSelesai).getTime() : Infinity;
    return now >= mulai && now <= selesai;
  },
  isUjianBelumMulai(ujian) {
    if (!ujian.jadwalMulai) return false;
    return Date.now() < new Date(ujian.jadwalMulai).getTime();
  },
  isUjianSelesai(ujian) {
    if (!ujian.jadwalSelesai) return false;
    return Date.now() > new Date(ujian.jadwalSelesai).getTime();
  },

  // === RANDOM ===
  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  // === FULLSCREEN ===
  requestFullscreen(el = document.documentElement) {
    if (el.requestFullscreen) return el.requestFullscreen();
    if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
    if (el.mozRequestFullScreen) return el.mozRequestFullScreen();
    if (el.msRequestFullscreen) return el.msRequestFullscreen();
    return Promise.reject('Fullscreen not supported');
  },
  exitFullscreen() {
    if (document.exitFullscreen) return document.exitFullscreen();
    if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
    if (document.mozCancelFullScreen) return document.mozCancelFullScreen();
    if (document.msExitFullscreen) return document.msExitFullscreen();
    return Promise.resolve();
  },
  isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement ||
              document.mozFullScreenElement || document.msFullscreenElement);
  },

  // === PRINT/EXPORT ===
  exportCSV(data, filename) {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const csv = [headers.join(','), ...data.map(r => headers.map(h => JSON.stringify(r[h] || '')).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = filename + '.csv';
    a.click();
  },
};
