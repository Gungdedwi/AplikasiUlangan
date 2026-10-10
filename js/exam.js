/**
 * EXAM ENGINE - Kiosk/Exam Mode
 * Mengelola mode ujian: fullscreen, deteksi pelanggaran, timer, autosave
 */
const ExamEngine = {
  state: {
    ujian: null,
    siswa: null,
    hasilId: null,
    soalList: [],
    currentIndex: 0,
    answers: {},
    flagged: [],
    violations: [],
    violationCount: 0,
    maxViolations: 3,
    timerSeconds: 0,
    timerInterval: null,
    autosaveInterval: null,
    startTime: null,
    ended: false,
    paused: false,
    violationOverlayShown: false,
  },

  // === INIT ===
  async init(ujian, siswa) {
    const settings = DB.getSettings();
    this.state.ujian = ujian;
    this.state.siswa = siswa;
    this.state.maxViolations = ujian.maxPelanggaran || settings.maxViolations || 3;
    this.state.timerSeconds = (ujian.durasi || 90) * 60;
    this.state.startTime = Date.now();

    // Ambil / restore jawaban yang tersimpan
    const savedJawaban = DB.getJawaban(ujian.id, siswa.userId);
    this.state.answers = savedJawaban.answers || {};
    this.state.flagged = savedJawaban.flagged || [];
    this.state.violations = savedJawaban.violations || [];
    this.state.violationCount = this.state.violations.length;

    if (savedJawaban.startTime) {
      // Hitung sisa waktu dari startTime yang tersimpan
      const elapsed = Math.floor((Date.now() - savedJawaban.startTime) / 1000);
      this.state.timerSeconds = Math.max(0, this.state.timerSeconds - elapsed);
      this.state.startTime = savedJawaban.startTime;
    }

    // Persiapkan soal
    let soalList = ujian.soalIds.map(id => DB.getSoalById(id)).filter(Boolean);
    if (ujian.acakSoal) soalList = Utils.shuffle(soalList);
    if (ujian.jumlahSoal && soalList.length > ujian.jumlahSoal) soalList = soalList.slice(0, ujian.jumlahSoal);
    this.state.soalList = soalList;

    // Buat atau ambil record hasil
    let hasil = DB.getHasilBySiswaUjian(siswa.userId, ujian.id);
    if (!hasil) {
      hasil = DB.addHasil({
        siswaId: siswa.userId,
        siswaName: siswa.name,
        ujianId: ujian.id,
        ujianJudul: ujian.judul,
        guruId: ujian.guruId,
        status: 'berlangsung',
        nilai: null,
      });
    }
    this.state.hasilId = hasil.id;

    // Log mulai ujian
    DB.addLog({
      type: 'MULAI_UJIAN',
      category: 'exam',
      hasilId: hasil.id,
      ujianId: ujian.id,
      actor: siswa.name,
      actorId: siswa.userId,
      detail: `Memulai ujian: ${ujian.judul}`,
      icon: '▶️',
      severity: 'info',
    });

    // Simpan jawaban awal dengan startTime
    this._autosave();

    return hasil;
  },

  // === TIMER ===
  startTimer(onTick, onEnd) {
    this.stopTimer();
    this.state.timerInterval = setInterval(() => {
      if (this.state.paused || this.state.ended) return;
      this.state.timerSeconds--;
      if (typeof onTick === 'function') onTick(this.state.timerSeconds);
      if (this.state.timerSeconds <= 0) {
        this.stopTimer();
        if (typeof onEnd === 'function') onEnd();
      }
    }, 1000);
  },

  stopTimer() {
    if (this.state.timerInterval) {
      clearInterval(this.state.timerInterval);
      this.state.timerInterval = null;
    }
  },

  // === AUTOSAVE ===
  startAutosave(intervalSeconds = 30) {
    this.stopAutosave();
    this.state.autosaveInterval = setInterval(() => {
      this._autosave();
    }, intervalSeconds * 1000);
  },

  stopAutosave() {
    if (this.state.autosaveInterval) {
      clearInterval(this.state.autosaveInterval);
      this.state.autosaveInterval = null;
    }
  },

  _autosave() {
    if (!this.state.ujian || !this.state.siswa) return;
    DB.saveJawaban(this.state.ujian.id, this.state.siswa.userId, {
      answers: this.state.answers,
      flagged: this.state.flagged,
      violations: this.state.violations,
      startTime: this.state.startTime,
    });
  },

  // === JAWABAN ===
  setAnswer(soalId, value) {
    this.state.answers[soalId] = value;
    this._autosave();
  },
  toggleFlag(soalId) {
    const idx = this.state.flagged.indexOf(soalId);
    if (idx >= 0) this.state.flagged.splice(idx, 1);
    else this.state.flagged.push(soalId);
    this._autosave();
  },
  isFlagged(soalId) { return this.state.flagged.includes(soalId); },
  isAnswered(soalId) { return this.state.answers[soalId] !== undefined && this.state.answers[soalId] !== ''; },
  getAnsweredCount() { return Object.keys(this.state.answers).filter(k => this.state.answers[k] !== '').length; },

  // === VIOLATIONS ===
  recordViolation(type, detail) {
    if (this.state.ended) return;
    const violation = {
      type,
      detail,
      timestamp: Date.now(),
      timeLeft: this.state.timerSeconds,
    };
    this.state.violations.push(violation);
    this.state.violationCount++;
    this._autosave();

    // Log ke audit
    DB.addLog({
      type: `PELANGGARAN_${type}`,
      category: 'violation',
      hasilId: this.state.hasilId,
      ujianId: this.state.ujian?.id,
      actor: this.state.siswa?.name,
      actorId: this.state.siswa?.userId,
      detail: detail,
      icon: '⚠️',
      severity: 'warning',
      violationNum: this.state.violationCount,
    });

    return {
      count: this.state.violationCount,
      max: this.state.maxViolations,
      suspended: this.state.violationCount >= this.state.maxViolations,
    };
  },

  // === SUBMIT ===
  submit(reason = 'manual') {
    if (this.state.ended) return null;
    this.state.ended = true;
    this.stopTimer();
    this.stopAutosave();
    this._autosave();

    const ujian = this.state.ujian;
    const siswa = this.state.siswa;
    const elapsed = Math.floor((Date.now() - this.state.startTime) / 1000);

    // Hitung nilai
    const scoring = Utils.hitungNilai(ujian, { answers: this.state.answers }, this.state.soalList);

    // Update hasil
    DB.updateHasil(this.state.hasilId, {
      status: reason === 'suspended' ? 'ditangguhkan' : 'selesai',
      nilai: scoring.nilai,
      lulus: scoring.lulus,
      scoring,
      waktuPengerjaan: elapsed,
      violationCount: this.state.violationCount,
      violations: this.state.violations,
      submitReason: reason,
      answers: this.state.answers,
    });

    // Log submit
    DB.addLog({
      type: reason === 'timeout' ? 'WAKTU_HABIS' : reason === 'suspended' ? 'DITANGGUHKAN' : 'SUBMIT',
      category: 'exam',
      hasilId: this.state.hasilId,
      ujianId: ujian.id,
      actor: siswa.name,
      actorId: siswa.userId,
      detail: `Ujian selesai. Nilai: ${scoring.nilai}. Alasan: ${reason}`,
      icon: reason === 'manual' ? '✅' : reason === 'timeout' ? '⏰' : '🚫',
      severity: reason === 'suspended' ? 'danger' : 'success',
    });

    // Hapus data sementara
    DB.remove(`jawaban_${ujian.id}_${siswa.userId}`);

    return { scoring, hasilId: this.state.hasilId };
  },

  // === EXAM MODE DETECTION ===
  setupViolationDetection(onViolation, onSuspend) {
    const self = this;

    // Page Visibility API
    const handleVisibilityChange = () => {
      if (self.state.ended || self.state.paused) return;
      if (document.visibilityState === 'hidden') {
        const result = self.recordViolation('PINDAH_TAB', 'Siswa berpindah tab atau meminimize jendela');
        if (result) onViolation(result, 'Terdeteksi aktivitas meninggalkan halaman ujian. Silakan kembali ke ujian.');
        if (result?.suspended) onSuspend();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Fullscreen change
    const handleFullscreenChange = () => {
      if (self.state.ended || self.state.paused) return;
      if (!Utils.isFullscreen()) {
        const result = self.recordViolation('KELUAR_FULLSCREEN', 'Siswa keluar dari mode fullscreen');
        if (result) onViolation(result, 'Terdeteksi keluar dari mode ujian (fullscreen). Silakan kembali.');
        if (result?.suspended) onSuspend();
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);

    // Window blur/focus
    const handleBlur = () => {
      if (self.state.ended || self.state.paused) return;
      const result = self.recordViolation('BLUR_WINDOW', 'Fokus jendela browser berpindah');
      if (result) onViolation(result, 'Terdeteksi aktivitas meninggalkan halaman ujian. Silakan kembali ke ujian.');
      if (result?.suspended) onSuspend();
    };
    window.addEventListener('blur', handleBlur);

    // Keyboard shortcuts prevention
    const handleKeydown = (e) => {
      if (self.state.ended) return;
      // Blokir: F12, Ctrl+Shift+I, Ctrl+U, Alt+F4, Ctrl+W, Ctrl+T, Ctrl+N, PrintScreen, Esc
      const blocked = [
        e.key === 'F12',
        e.ctrlKey && e.shiftKey && e.key === 'I',
        e.ctrlKey && e.shiftKey && e.key === 'J',
        e.ctrlKey && e.key === 'u',
        e.ctrlKey && e.key === 'w',
        e.ctrlKey && e.key === 't',
        e.ctrlKey && e.key === 'n',
        e.ctrlKey && e.key === 'l',
        e.altKey && e.key === 'F4',
        e.key === 'PrintScreen',
        e.key === 'F5',
        e.ctrlKey && e.key === 'r',
        e.ctrlKey && e.key === 'p',
      ];
      if (blocked.some(Boolean)) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };
    document.addEventListener('keydown', handleKeydown, true);

    // Context menu prevention
    const handleContextMenu = (e) => { e.preventDefault(); };
    document.addEventListener('contextmenu', handleContextMenu);

    // Copy prevention
    const handleCopy = (e) => { e.preventDefault(); };
    document.addEventListener('copy', handleCopy);
    document.addEventListener('cut', handleCopy);

    // Back button (history)
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
      if (!self.state.ended) {
        const result = self.recordViolation('TEKAN_BACK', 'Siswa menekan tombol back browser');
        if (result) onViolation(result, 'Tombol back terdeteksi. Anda tidak dapat keluar dari ujian.');
        if (result?.suspended) onSuspend();
      }
    };
    window.addEventListener('popstate', handlePopState);

    // Before unload
    const handleBeforeUnload = (e) => {
      if (!self.state.ended) {
        e.preventDefault();
        e.returnValue = 'Ujian sedang berlangsung. Apakah Anda yakin ingin keluar?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Simpan cleanup handlers
    this._cleanupHandlers = {
      visibilitychange: handleVisibilityChange,
      fullscreenchange: handleFullscreenChange,
      blur: handleBlur,
      keydown: handleKeydown,
      contextmenu: handleContextMenu,
      copy: handleCopy,
      popstate: handlePopState,
      beforeunload: handleBeforeUnload,
    };
  },

  cleanup() {
    this.stopTimer();
    this.stopAutosave();
    const h = this._cleanupHandlers || {};
    if (h.visibilitychange) document.removeEventListener('visibilitychange', h.visibilitychange);
    if (h.fullscreenchange) {
      document.removeEventListener('fullscreenchange', h.fullscreenchange);
      document.removeEventListener('webkitfullscreenchange', h.fullscreenchange);
      document.removeEventListener('mozfullscreenchange', h.fullscreenchange);
    }
    if (h.blur) window.removeEventListener('blur', h.blur);
    if (h.keydown) document.removeEventListener('keydown', h.keydown, true);
    if (h.contextmenu) document.removeEventListener('contextmenu', h.contextmenu);
    if (h.copy) { document.removeEventListener('copy', h.copy); document.removeEventListener('cut', h.copy); }
    if (h.popstate) window.removeEventListener('popstate', h.popstate);
    if (h.beforeunload) window.removeEventListener('beforeunload', h.beforeunload);
    this._cleanupHandlers = {};
  },
};
