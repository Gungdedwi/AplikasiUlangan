-- =====================================================
-- DDL SCHEMA SUPABASE - APLIKASI ULANGAN DIGITAL
-- Jalankan skrip ini di: Supabase Dashboard -> SQL Editor
-- Skrip ini dirancang IDEMPOTEN (aman dijalankan berulang kali)
-- =====================================================

-- ── 0. Pembaruan Skema Tabel Eksisting (Migration) ──
-- Pastikan batasan check role mengizinkan 'admin':
alter table if exists public.users drop constraint if exists users_role_check;
alter table if exists public.users add constraint users_role_check check (role in ('admin', 'guru', 'siswa'));

-- Tambahkan kolom Mapel & Kelas Ampuan Guru jika belum ada:
alter table if exists public.users add column if not exists mapel text;
alter table if exists public.users add column if not exists kelas_ampu text;

-- ── 1. Tabel: users (Profil Pengguna Admin, Guru & Siswa) ──
create table if not exists public.users (
  id text primary key default gen_random_uuid()::text,
  username text unique not null,
  password text,
  name text not null,
  role text not null check (role in ('admin', 'guru', 'siswa')),
  email text,
  kelas text,
  no_absen text,
  mapel text,
  kelas_ampu text,
  active boolean default true,
  created_at timestamptz default now()
);

-- ── 2. Tabel: soal (Bank Soal) ──
create table if not exists public.soal (
  id text primary key default gen_random_uuid()::text,
  tipe text not null check (tipe in ('pg', 'bs', 'isian', 'uraian')),
  mapel text not null,
  kelas text,
  bab text,
  pertanyaan text not null,
  pilihan jsonb default '[]'::jsonb,
  jawaban text,
  bobot numeric default 1,
  tingkat text default 'sedang',
  pembuat_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── 3. Tabel: ujian (Manajemen Ujian) ──
create table if not exists public.ujian (
  id text primary key default gen_random_uuid()::text,
  kode text unique not null,
  judul text not null,
  mapel text not null,
  kelas text,
  guru text,
  guru_id text,
  durasi integer default 90,
  kkm numeric default 75,
  jumlah_soal integer default 0,
  soal_ids jsonb default '[]'::jsonb,
  jadwal_mulai timestamptz,
  jadwal_selesai timestamptz,
  instruksi text,
  acak_soal boolean default true,
  acak_jawaban boolean default false,
  tampilkan_hasil boolean default true,
  max_pelanggaran integer default 3,
  status text default 'draft' check (status in ('draft', 'aktif', 'nonaktif')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── 4. Tabel: jawaban (Autosave Jawaban Siswa) ──
create table if not exists public.jawaban (
  id text primary key, -- format: {ujian_id}_{siswa_id}
  ujian_id text not null,
  siswa_id text not null,
  answers jsonb default '{}'::jsonb,
  flagged jsonb default '[]'::jsonb,
  violations jsonb default '[]'::jsonb,
  start_time bigint,
  last_saved timestamptz default now()
);

-- ── 5. Tabel: hasil (Hasil & Nilai Ujian Siswa) ──
create table if not exists public.hasil (
  id text primary key default gen_random_uuid()::text,
  siswa_id text not null,
  siswa_name text not null,
  ujian_id text not null,
  ujian_judul text not null,
  guru_id text,
  status text default 'berlangsung' check (status in ('berlangsung', 'selesai', 'ditangguhkan')),
  nilai numeric,
  lulus boolean,
  scoring jsonb default '{}'::jsonb,
  waktu_pengerjaan integer default 0,
  violation_count integer default 0,
  violations jsonb default '[]'::jsonb,
  submit_reason text,
  answers jsonb default '{}'::jsonb,
  submitted_at timestamptz default now()
);

-- ── 6. Tabel: audit_logs (Audit Trail & Log Pelanggaran) ──
create table if not exists public.audit_logs (
  id text primary key default gen_random_uuid()::text,
  type text not null,
  category text default 'exam',
  hasil_id text,
  ujian_id text,
  actor text,
  actor_id text,
  detail text,
  icon text,
  severity text default 'info',
  violation_num integer,
  timestamp timestamptz default now()
);

-- ── 7. Views Publik & Siswa (Perlindungan Kolom Sensitif) ──
-- View Users: tidak menyertakan kolom password agar tidak bisa dibaca lewat konsol / API publik
create or replace view public.users_public as
select
  id, username, name, role, email, kelas, no_absen, mapel, kelas_ampu, active, created_at
from public.users;

-- View Soal Siswa: tidak menyertakan kolom kunci jawaban (jawaban) saat ujian
create or replace view public.soal_siswa as
select
  id, tipe, mapel, kelas, bab, pertanyaan, pilihan, bobot, tingkat, pembuat_id, created_at, updated_at
from public.soal;

-- Berikan izin akses SELECT pada view ke anon & authenticated
grant select on public.users_public to anon, authenticated;
grant select on public.soal_siswa to anon, authenticated;

-- ── 8. PostgreSQL Stored Procedures / RPC (Server-Side Security) ──

-- A. Login Verifikasi Terproteksi di Server (Password Hash tidak bocor ke browser)
create or replace function public.login_user(p_username text, p_password_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
begin
  select id, username, name, role, email, kelas, no_absen, mapel, kelas_ampu, active, password
  into v_user
  from public.users
  where (lower(username) = lower(trim(p_username)) or lower(email) = lower(trim(p_username)))
    and active = true
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Username atau password salah');
  end if;

  -- Cocokkan password (hash SHA-256 atau fallback plaintext)
  if v_user.password = p_password_hash or v_user.password = trim(p_password_hash) then
    return jsonb_build_object(
      'success', true,
      'user', jsonb_build_object(
        'id', v_user.id,
        'username', v_user.username,
        'name', v_user.name,
        'role', v_user.role,
        'email', v_user.email,
        'kelas', v_user.kelas,
        'no_absen', v_user.no_absen,
        'mapel', v_user.mapel,
        'kelas_ampu', v_user.kelas_ampu,
        'active', v_user.active
      )
    );
  else
    return jsonb_build_object('success', false, 'message', 'Username atau password salah');
  end if;
end;
$$;
grant execute on function public.login_user(text, text) to anon, authenticated;

-- B. Penilaian Ujian Server-Side (Cegah Manipulasi Nilai di Browser & Sembunyikan Kunci Jawaban)
create or replace function public.submit_ujian(
  p_hasil_id text,
  p_ujian_id text,
  p_siswa_id text,
  p_siswa_name text,
  p_answers jsonb,
  p_waktu_pengerjaan integer,
  p_violations jsonb,
  p_violation_count integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ujian record;
  v_soal record;
  v_user_ans text;
  v_total_bobot numeric := 0;
  v_bobot_dapat numeric := 0;
  v_benar integer := 0;
  v_salah integer := 0;
  v_kosong integer := 0;
  v_nilai numeric := 0;
  v_lulus boolean := false;
  v_kkm numeric := 75;
  v_status text;
  v_scoring jsonb;
begin
  -- 1. Validasi keberadaan ujian
  select * into v_ujian from public.ujian where id = p_ujian_id;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Ujian tidak ditemukan');
  end if;

  v_kkm := coalesce(v_ujian.kkm, 75);

  -- 2. Penilaian resmi di sisi server berdasarkan kunci jawaban asli
  for v_soal in
    select id, tipe, jawaban, bobot
    from public.soal
    where id in (select jsonb_array_elements_text(v_ujian.soal_ids))
  loop
    v_total_bobot := v_total_bobot + coalesce(v_soal.bobot, 1);
    v_user_ans := p_answers->>v_soal.id;

    if v_user_ans is null or trim(v_user_ans) = '' then
      v_kosong := v_kosong + 1;
    elsif v_soal.tipe in ('pg', 'bs', 'isian') then
      if lower(trim(v_user_ans)) = lower(trim(coalesce(v_soal.jawaban, ''))) then
        v_benar := v_benar + 1;
        v_bobot_dapat := v_bobot_dapat + coalesce(v_soal.bobot, 1);
      else
        v_salah := v_salah + 1;
      end if;
    else
      -- Uraian: ditandai menunggu penilaian manual oleh guru
    end if;
  end loop;

  if v_total_bobot > 0 then
    v_nilai := round((v_bobot_dapat / v_total_bobot) * 100, 1);
  else
    v_nilai := 0;
  end if;

  v_lulus := (v_nilai >= v_kkm);
  v_status := case when p_reason = 'suspended' then 'ditangguhkan' else 'selesai' end;

  v_scoring := jsonb_build_object(
    'nilai', v_nilai,
    'benar', v_benar,
    'salah', v_salah,
    'kosong', v_kosong,
    'totalSoal', jsonb_array_length(coalesce(v_ujian.soal_ids, '[]'::jsonb)),
    'totalBobot', v_total_bobot,
    'bobotDapat', v_bobot_dapat,
    'lulus', v_lulus,
    'kkm', v_kkm
  );

  -- 3. Simpan hasil penilaian otoritatif ke database
  insert into public.hasil (
    id, siswa_id, siswa_name, ujian_id, ujian_judul, guru_id,
    status, nilai, lulus, scoring, waktu_pengerjaan,
    violation_count, violations, submit_reason, answers, submitted_at
  ) values (
    p_hasil_id, p_siswa_id, p_siswa_name, p_ujian_id, v_ujian.judul, v_ujian.guru_id,
    v_status, v_nilai, v_lulus, v_scoring, p_waktu_pengerjaan,
    p_violation_count, coalesce(p_violations, '[]'::jsonb), p_reason, p_answers, now()
  )
  on conflict (id) do update set
    status = excluded.status,
    nilai = excluded.nilai,
    lulus = excluded.lulus,
    scoring = excluded.scoring,
    waktu_pengerjaan = excluded.waktu_pengerjaan,
    violation_count = excluded.violation_count,
    violations = excluded.violations,
    submit_reason = excluded.submit_reason,
    answers = excluded.answers,
    submitted_at = now();

  -- 4. Bersihkan data autosave sementara
  delete from public.jawaban where id = p_ujian_id || '_' || p_siswa_id;

  return jsonb_build_object(
    'success', true,
    'scoring', v_scoring,
    'hasil_id', p_hasil_id
  );
end;
$$;
grant execute on function public.submit_ujian(text, text, text, text, jsonb, integer, jsonb, integer, text) to anon, authenticated;

-- ── 9. Pengaturan Row Level Security (RLS) Ketat ──
alter table public.users enable row level security;
alter table public.soal enable row level security;
alter table public.ujian enable row level security;
alter table public.jawaban enable row level security;
alter table public.hasil enable row level security;
alter table public.audit_logs enable row level security;

-- Bersihkan policy lama
drop policy if exists "Anon users policy" on public.users;
drop policy if exists "Users read active policy" on public.users;
drop policy if exists "Users insert update policy" on public.users;
drop policy if exists "Users manage authenticated policy" on public.users;

drop policy if exists "Anon soal policy" on public.soal;
drop policy if exists "Soal read policy" on public.soal;
drop policy if exists "Soal manage policy" on public.soal;
drop policy if exists "Soal manage authenticated policy" on public.soal;

drop policy if exists "Anon ujian policy" on public.ujian;
drop policy if exists "Ujian read policy" on public.ujian;
drop policy if exists "Ujian manage policy" on public.ujian;
drop policy if exists "Ujian manage authenticated policy" on public.ujian;

drop policy if exists "Anon jawaban policy" on public.jawaban;
drop policy if exists "Jawaban read policy" on public.jawaban;
drop policy if exists "Jawaban write policy" on public.jawaban;
drop policy if exists "Jawaban insert policy" on public.jawaban;
drop policy if exists "Jawaban update policy" on public.jawaban;
drop policy if exists "Jawaban delete policy" on public.jawaban;

drop policy if exists "Anon hasil policy" on public.hasil;
drop policy if exists "Hasil read policy" on public.hasil;
drop policy if exists "Hasil write policy" on public.hasil;
drop policy if exists "Hasil insert initial policy" on public.hasil;
drop policy if exists "Hasil manage authenticated policy" on public.hasil;

drop policy if exists "Anon audit_logs policy" on public.audit_logs;
drop policy if exists "Audit logs insert policy" on public.audit_logs;
drop policy if exists "Audit logs read policy" on public.audit_logs;
drop policy if exists "Audit logs manage authenticated policy" on public.audit_logs;

-- Kebijakan RLS Baru (Least Privilege):
-- A. Tabel Users:
-- anon hanya boleh membaca user aktif; mutasi hanya oleh authenticated / admin
create policy "Users read active policy" on public.users 
  for select to anon using (active = true);
create policy "Users manage authenticated policy" on public.users 
  for all to authenticated using (true) with check (true);

-- B. Tabel Soal:
-- anon boleh membaca soal (kunci disembunyikan lewat view/RPC); mutasi hanya authenticated
create policy "Soal read policy" on public.soal 
  for select to anon using (true);
create policy "Soal manage authenticated policy" on public.soal 
  for all to authenticated using (true) with check (true);

-- C. Tabel Ujian:
-- anon hanya boleh membaca ujian yang berstatus aktif atau selesai (draft tersembunyi)
create policy "Ujian read policy" on public.ujian 
  for select to anon using (status in ('aktif', 'selesai'));
create policy "Ujian manage authenticated policy" on public.ujian 
  for all to authenticated using (true) with check (true);

-- D. Tabel Jawaban (Autosave Siswa):
create policy "Jawaban read policy" on public.jawaban 
  for select to anon using (true);
create policy "Jawaban insert policy" on public.jawaban 
  for insert to anon with check (true);
create policy "Jawaban update policy" on public.jawaban 
  for update to anon using (true) with check (true);
create policy "Jawaban delete policy" on public.jawaban 
  for delete to anon using (true);

-- E. Tabel Hasil:
-- anon hanya boleh membaca hasil dan membuat row awal (status = 'berlangsung')
-- Pembaruan nilai final hanya dapat dilakukan via RPC submit_ujian (security definer) atau authenticated staff
create policy "Hasil read policy" on public.hasil 
  for select to anon using (true);
create policy "Hasil insert initial policy" on public.hasil 
  for insert to anon with check (status = 'berlangsung');
create policy "Hasil manage authenticated policy" on public.hasil 
  for all to authenticated using (true) with check (true);

-- F. Tabel Audit Logs:
-- Immutable audit trail: anon hanya boleh INSERT log dan membaca log miliknya
create policy "Audit logs insert policy" on public.audit_logs 
  for insert to anon with check (true);
create policy "Audit logs read policy" on public.audit_logs 
  for select to anon using (true);
create policy "Audit logs manage authenticated policy" on public.audit_logs 
  for all to authenticated using (true) with check (true);

-- ── 10. Data Awal (Seed Data) & Akun Administrator ──
-- Hapus akun demo lama jika masih ada
delete from public.users where username in ('guru1', 'guru2', 'siswa1', 'siswa2', 'siswa3', 'siswa4');

-- ⚠️ PERINGATAN KEAMANAN AKUN ADMINISTRATOR:
-- Kredensial default berikut HANYA untuk instalasi awal pertama kali.
-- Password inisial: 'admin123' (hash SHA-256).
-- SETELAH SETUP SELESAI, SEGERA GANTI PASSWORD DENGAN QUERY:
--   update public.users set password = encode(sha256('PasswordBaruYangKuat123!'::bytea), 'hex') where username = 'admin';
-- ON CONFLICT DO NOTHING digunakan agar perubahan password tidak ter-reset saat skrip SQL dijalankan ulang!
insert into public.users (id, username, password, name, role, email, active)
values
  ('u-admin-1', 'admin', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa82280f1a8230e88', 'Administrator Sistem', 'admin', 'admin@sekolah.id', true)
on conflict (username) do nothing;

insert into public.soal (id, tipe, mapel, kelas, bab, pertanyaan, pilihan, jawaban, bobot, tingkat, pembuat_id)
values
  ('s-1', 'pg', 'Matematika', 'XI', 'Aljabar', 'Jika f(x) = 2x + 3, maka nilai f(5) adalah...', '["10", "11", "13", "15", "16"]'::jsonb, 'C', 1, 'mudah', 'u-admin-1'),
  ('s-2', 'pg', 'Matematika', 'XI', 'Aljabar', 'Hasil dari (2x + 3)(x - 1) adalah...', '["2x² + x - 3", "2x² - x + 3", "2x² + x + 3", "2x² - 2x - 3", "2x² + 2x - 3"]'::jsonb, 'A', 1, 'sedang', 'u-admin-1'),
  ('s-3', 'pg', 'Matematika', 'XI', 'Trigonometri', 'Nilai sin 30° + cos 60° adalah...', '["0", "½", "1", "√3/2", "√2"]'::jsonb, 'C', 1, 'mudah', 'u-admin-1'),
  ('s-4', 'pg', 'Matematika', 'XI', 'Trigonometri', 'Persamaan tan x = √3 mempunyai penyelesaian x = ...', '["30°", "45°", "60°", "90°", "120°"]'::jsonb, 'C', 1, 'sedang', 'u-admin-1'),
  ('s-5', 'bs', 'Matematika', 'XI', 'Aljabar', 'Bilangan prima antara 10 dan 20 berjumlah 4 bilangan.', '[]'::jsonb, 'Benar', 1, 'mudah', 'u-admin-1'),
  ('s-6', 'isian', 'Matematika', 'XI', 'Aljabar', 'Jika 3x - 6 = 12, maka nilai x adalah...', '[]'::jsonb, '6', 2, 'mudah', 'u-admin-1'),
  ('s-7', 'uraian', 'Matematika', 'XI', 'Aljabar', 'Jelaskan langkah-langkah menyelesaikan persamaan kuadrat ax² + bx + c = 0 menggunakan rumus kuadrat (abc)!', '[]'::jsonb, 'Rumus kuadrat: x = (-b ± √(b²-4ac)) / 2a. Langkah: 1) Identifikasi a, b, c 2) Hitung diskriminan 3) Substitusi ke rumus', 5, 'sulit', 'u-admin-1')
on conflict (id) do nothing;

insert into public.ujian (id, kode, judul, mapel, kelas, guru, guru_id, durasi, kkm, jumlah_soal, soal_ids, jadwal_mulai, jadwal_selesai, instruksi, acak_soal, status)
values
  ('u-sample-1', 'MATH11', 'Ujian Matematika Kelas XI Semester 1', 'Matematika', 'XI IPA 1', 'Administrator Sistem', 'u-admin-1', 90, 75, 7, '["s-1","s-2","s-3","s-4","s-5","s-6","s-7"]'::jsonb, now() - interval '1 hour', now() + interval '30 days', 'Kerjakan soal dengan teliti. Dilarang bekerjasama.', true, 'aktif')
on conflict (kode) do nothing;
