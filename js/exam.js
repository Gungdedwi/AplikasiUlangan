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

  // ── Inisialisasi Ujian & Restore Cloud Jawaban ──
  async init(ujian, siswa) {
    const settings = DB.getSettings();
    this.state.ujian = ujian;
    this.state.siswa = siswa;
    this.state.maxViolations = ujian.maxPelanggaran || settings.maxViolations || 3;
    this.state.timerSeconds = (ujian.durasi || 90) * 60;
    this.state.startTime = Date.now();

    // Ambil jawaban yang tersimpan (prioritaskan Supabase cloud jika terhubung)
    let savedJawaban = DB.getJawaban(ujian.id, siswa.userId);
    if (DB.client) {
      const cloudJawaban = await DB.fetchJawaban(ujian.id, siswa.userId);
      // B1: Jangan hanya cek answers.length, periksa keberadaan record cloud yang sah
      if (cloudJawaban && (cloudJawaban.last_saved || cloudJawaban.startTime || (cloudJawaban.answers && Object.keys(cloudJawaban.answers).length > 0) || (cloudJawaban.violations && cloudJawaban.violations.length > 0))) {
        const cloudTime = cloudJawaban.last_saved ? new Date(cloudJawaban.last_saved).getTime() : (cloudJawaban.startTime || 0);
        const localTime = savedJawaban.lastSaved || savedJawaban.startTime || 0;
        if (cloudTime >= localTime || !savedJawaban.startTime) {
          savedJawaban = cloudJawaban;
        }
      }
    }

    this.state.answers = savedJawaban.answers || {};
    this.state.flagged = savedJawaban.flagged || [];
    this.state.violations = savedJawaban.violations || [];
    this.state.violationCount = this.state.violations.length;

    // B2: Validasi batas waktu dan startTime
    if (savedJawaban.startTime) {
      const parsedStartTime = typeof savedJawaban.startTime === 'string' ? new Date(savedJawaban.startTime).getTime() : Number(savedJawaban.startTime);
      if (!isNaN(parsedStartTime) && parsedStartTime > 0 && parsedStartTime <= Date.now() + 60000) {
        const elapsed = Math.max(0, Math.floor((Date.now() - parsedStartTime) / 1000));
        const totalDurationSec = (ujian.durasi || 90) * 60;
        this.state.timerSeconds = Math.max(0, totalDurationSec - elapsed);
        this.state.startTime = parsedStartTime;
      }
    }

    // Persiapkan soal (dari cache atau Supabase cloud)
    const soalIds = ujian.soalIds || ujian.soal_ids || [];
    let soalList = (await Promise.all(soalIds.map(id => DB.getSoalById(id)))).filter(Boolean);
    if (soalList.length === 0 && DB.client) {
      await DB.fetchSoal();
      soalList = (await Promise.all(soalIds.map(id => DB.getSoalById(id)))).filter(Boolean);
    }
    if (ujian.acakSoal !== false && ujian.acak_soal !== false) soalList = Utils.shuffle(soalList);
    const maxSoal = ujian.jumlahSoal || ujian.jumlah_soal;
    if (maxSoal && soalList.length > maxSoal) soalList = soalList.slice(0, maxSoal);

    // Kunci jawaban disimpan terpisah agar TIDAK bocor di state browser siswa
    this._kunciJawabanMap = {};
    soalList.forEach(s => {
      this._kunciJawabanMap[s.id] = s.jawaban;
    });

    // Sanitasi soalList untuk siswa: hapus kunci jawaban dari memory inspection
    this.state.soalList = soalList.map(s => {
      const sanitized = { ...s };
      delete sanitized.jawaban;
      return sanitized;
    });

    // Buat atau ambil record hasil dari Supabase/Cache
    let hasil = DB.getHasilBySiswaUjian(siswa.userId, ujian.id);
    if (!hasil) {
      hasil = await DB.addHasil({
        siswaId: siswa.userId,
        siswaName: siswa.name,
        ujianId: ujian.id,
        ujianJudul: ujian.judul,
        guruId: ujian.guruId || ujian.guru_id || null,
        status: 'berlangsung',
        nilai: null,
      });
    }
    this.state.hasilId = hasil.id;

    // Log mulai ujian ke cloud
    await DB.addLog({
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

    // Simpan jawaban awal
    await this._autosave();

    return hasil;
  },

  // ── Timer Pengatur Waktu Ujian (Wall-Clock Precision) ──
  startTimer(onTick, onEnd) {
    this.stopTimer();
    const durasiMenit = this.state.ujian?.durasi || 90;
    const totalDurationMs = durasiMenit * 60 * 1000;
    const endTime = this.state.startTime + totalDurationMs;

    const checkTime = () => {
      if (this.state.paused || this.state.ended) return;
      const now = Date.now();
      const remaining = Math.max(0, Math.min(Math.floor((endTime - now) / 1000), durasiMenit * 60));
      this.state.timerSeconds = remaining;
      if (typeof onTick === 'function') onTick(this.state.timerSeconds);
      if (this.state.timerSeconds <= 0) {
        this.stopTimer();
        if (typeof onEnd === 'function') onEnd();
      }
    };

    checkTime();
    this.state.timerInterval = setInterval(checkTime, 1000);
  },

  stopTimer() {
    if (this.state.timerInterval) {
      clearInterval(this.state.timerInterval);
      this.state.timerInterval = null;
    }
  },

  // ── Autosave Jawaban ke Supabase Cloud (Debounced) ──
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
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
  },

  _scheduleAutosave(delayMs = 2500) {
    // 1. Simpan ke local cache seketika (0ms)
    if (this.state.ujian && this.state.siswa) {
      DB.set(`jawaban_${this.state.ujian.id}_${this.state.siswa.userId}`, {
        answers: this.state.answers,
        flagged: this.state.flagged,
        violations: this.state.violations,
        startTime: this.state.startTime,
        lastSaved: Date.now()
      });
    }

    // 2. Debounce push ke Supabase Cloud
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._autosave();
    }, delayMs);
  },

  async _autosave() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    if (!this.state.ujian || !this.state.siswa) return;

    // B4: Mencegah request tumpang-tindih (serialisasi autosave)
    if (this._isSaving) {
      this._hasPendingSave = true;
      return;
    }

    this._isSaving = true;
    const indicator = document.getElementById('autosave-indicator');
    if (indicator) {
      indicator.style.display = 'block';
      indicator.style.color = '';
      indicator.textContent = '☁️ Menyimpan...';
    }

    try {
      const res = await DB.saveJawaban(this.state.ujian.id, this.state.siswa.userId, {
        answers: this.state.answers,
        flagged: this.state.flagged,
        violations: this.state.violations,
        startTime: this.state.startTime,
      });

      // B3: Indikator status akurat cloud vs lokal
      if (indicator) {
        if (res && res.cloud) {
          indicator.textContent = '☁️ Tersimpan di Cloud';
          indicator.style.color = 'var(--success-600, #16a34a)';
        } else {
          indicator.textContent = '💾 Tersimpan Lokal (Cloud offline)';
          indicator.style.color = 'var(--warning-600, #d97706)';
        }
        setTimeout(() => {
          if (indicator) indicator.style.display = 'none';
        }, 2000);
      }
    } catch (err) {
      console.warn('Autosave error:', err);
      if (indicator) {
        indicator.textContent = '⚠️ Gagal menyimpan ke Cloud';
        indicator.style.color = 'var(--danger-600, #dc2626)';
        setTimeout(() => {
          if (indicator) indicator.style.display = 'none';
        }, 3000);
      }
    } finally {
      this._isSaving = false;
      if (this._hasPendingSave) {
        this._hasPendingSave = false;
        this._scheduleAutosave(500);
      }
    }
  },

  // ── Manipulasi Jawaban ──
  setAnswer(soalId, value) {
    this.state.answers[soalId] = value;
    this._scheduleAutosave(2500);
  },
  toggleFlag(soalId) {
    const idx = this.state.flagged.indexOf(soalId);
    if (idx >= 0) this.state.flagged.splice(idx, 1);
    else this.state.flagged.push(soalId);
    this._scheduleAutosave(1500);
  },
  isFlagged(soalId) { return this.state.flagged.includes(soalId); },
  isAnswered(soalId) { return this.state.answers[soalId] !== undefined && this.state.answers[soalId] !== ''; },
  getAnsweredCount() { return Object.keys(this.state.answers).filter(k => this.state.answers[k] !== '').length; },

  // ── Pencatatan Pelanggaran Kiosk Mode ──
  async recordViolation(type, detail) {
    if (this.state.ended) return;

    // Cegah pencatatan dobel dari blur dan visibilitychange yang terjadi bersamaan
    const now = Date.now();
    if (this._lastViolationTime && (now - this._lastViolationTime < 1500)) {
      return null;
    }
    this._lastViolationTime = now;

    const violation = {
      type,
      detail,
      timestamp: now,
      timeLeft: this.state.timerSeconds,
    };
    this.state.violations.push(violation);
    this.state.violationCount++;
    await this._autosave();

    // Log ke tabel audit_logs Supabase
    await DB.addLog({
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

  // ── Submit & Penilaian Akhir (Kirim ke Cloud) ──
  async submit(reason = 'manual') {
    if (this.state.ended) return null;
    this.state.ended = true;
    this.stopTimer();
    this.stopAutosave();
    await this._autosave();

    const ujian = this.state.ujian;
    const siswa = this.state.siswa;
    const elapsed = Math.floor((Date.now() - this.state.startTime) / 1000);

    // Ambil kunci jawaban yang terlindungi untuk proses penilaian
    let kunciMap = this._kunciJawabanMap || {};
    const soalIds = this.state.soalList.map(s => s.id);
    if (Object.keys(kunciMap).length === 0 && DB.fetchKunciJawaban) {
      kunciMap = await DB.fetchKunciJawaban(soalIds);
    }

    const scoringSoalList = this.state.soalList.map(s => ({
      ...s,
      jawaban: kunciMap[s.id] || ''
    }));

    // Hitung nilai otomatis
    const scoring = Utils.hitungNilai(ujian, { answers: this.state.answers }, scoringSoalList);

    // Kirim hasil ujian ke database Supabase
    await DB.updateHasil(this.state.hasilId, {
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

    // Catat log submit ke audit_logs Supabase
    await DB.addLog({
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

    // Bersihkan jawaban lokal
    DB.remove(`jawaban_${ujian.id}_${siswa.userId}`);

    return { scoring, hasilId: this.state.hasilId };
  },

  // ── Deteksi & Pencegahan Pelanggaran Browser ──
  setupViolationDetection(onViolation, onSuspend) {
    const self = this;

    // Page Visibility API
    const handleVisibilityChange = async () => {
      if (self.state.ended || self.state.paused) return;
      if (document.visibilityState === 'hidden') {
        const result = await self.recordViolation('PINDAH_TAB', 'Siswa berpindah tab atau meminimize jendela');
        if (result) onViolation(result, 'Terdeteksi aktivitas meninggalkan halaman ujian. Silakan kembali ke ujian.');
        if (result?.suspended) onSuspend();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Fullscreen change
    const handleFullscreenChange = async () => {
      if (self.state.ended || self.state.paused) return;
      if (!Utils.isFullscreen()) {
        const result = await self.recordViolation('KELUAR_FULLSCREEN', 'Siswa keluar dari mode fullscreen');
        if (result) onViolation(result, 'Terdeteksi keluar dari mode ujian (fullscreen). Silakan kembali.');
        if (result?.suspended) onSuspend();
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);

    // Window blur/focus
    const handleBlur = async () => {
      if (self.state.ended || self.state.paused) return;
      const result = await self.recordViolation('BLUR_WINDOW', 'Fokus jendela browser berpindah');
      if (result) onViolation(result, 'Terdeteksi aktivitas meninggalkan halaman ujian. Silakan kembali ke ujian.');
      if (result?.suspended) onSuspend();
    };
    window.addEventListener('blur', handleBlur);

    // Keyboard shortcuts prevention
    const handleKeydown = (e) => {
      if (self.state.ended) return;
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
    const handlePopState = async () => {
      window.history.pushState(null, '', window.location.href);
      if (!self.state.ended) {
        const result = await self.recordViolation('TEKAN_BACK', 'Siswa menekan tombol back browser');
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
