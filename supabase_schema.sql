-- =====================================================
-- DDL SCHEMA SUPABASE - APLIKASI ULANGAN DIGITAL
-- Jalankan skrip ini di: Supabase Dashboard -> SQL Editor
-- =====================================================

-- ── 1. Tabel: users (Profil Pengguna Guru & Siswa) ──
create table if not exists public.users (
  id text primary key default gen_random_uuid()::text,
  username text unique not null,
  password text,
  name text not null,
  role text not null check (role in ('guru', 'siswa')),
  email text,
  kelas text,
  no_absen text,
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

-- ── 7. Pengaturan Row Level Security (RLS) ──
alter table public.users enable row level security;
alter table public.soal enable row level security;
alter table public.ujian enable row level security;
alter table public.jawaban enable row level security;
alter table public.hasil enable row level security;
alter table public.audit_logs enable row level security;

-- Kebijakan Akses Penuh untuk Public / Anon Key
drop policy if exists "Anon users policy" on public.users;
create policy "Anon users policy" on public.users for all to anon using (true) with check (true);

drop policy if exists "Anon soal policy" on public.soal;
create policy "Anon soal policy" on public.soal for all to anon using (true) with check (true);

drop policy if exists "Anon ujian policy" on public.ujian;
create policy "Anon ujian policy" on public.ujian for all to anon using (true) with check (true);

drop policy if exists "Anon jawaban policy" on public.jawaban;
create policy "Anon jawaban policy" on public.jawaban for all to anon using (true) with check (true);

drop policy if exists "Anon hasil policy" on public.hasil;
create policy "Anon hasil policy" on public.hasil for all to anon using (true) with check (true);

drop policy if exists "Anon audit_logs policy" on public.audit_logs;
create policy "Anon audit_logs policy" on public.audit_logs for all to anon using (true) with check (true);

-- ── 8. Data Awal (Seed Data) ──
insert into public.users (id, username, password, name, role, email, active)
values
  ('u-guru-1', 'guru1', 'guru123', 'Pak Budi Santoso', 'guru', 'guru1@sekolah.id', true),
  ('u-guru-2', 'guru2', 'guru123', 'Bu Sri Wulandari', 'guru', 'guru2@sekolah.id', true)
on conflict (username) do nothing;

insert into public.users (id, username, password, name, role, kelas, no_absen, active)
values
  ('u-siswa-1', 'siswa1', '12345', 'Ahmad Fauzi', 'siswa', 'XI IPA 1', '01', true),
  ('u-siswa-2', 'siswa2', '12345', 'Budi Raharjo', 'siswa', 'XI IPA 1', '02', true),
  ('u-siswa-3', 'siswa3', '12345', 'Citra Dewi', 'siswa', 'XI IPA 1', '03', true),
  ('u-siswa-4', 'siswa4', '12345', 'Diana Putri', 'siswa', 'XI IPA 2', '01', true)
on conflict (username) do nothing;

insert into public.soal (id, tipe, mapel, kelas, bab, pertanyaan, pilihan, jawaban, bobot, tingkat, pembuat_id)
values
  ('s-1', 'pg', 'Matematika', 'XI', 'Aljabar', 'Jika f(x) = 2x + 3, maka nilai f(5) adalah...', '["10", "11", "13", "15", "16"]'::jsonb, 'C', 1, 'mudah', 'u-guru-1'),
  ('s-2', 'pg', 'Matematika', 'XI', 'Aljabar', 'Hasil dari (2x + 3)(x - 1) adalah...', '["2x² + x - 3", "2x² - x + 3", "2x² + x + 3", "2x² - 2x - 3", "2x² + 2x - 3"]'::jsonb, 'A', 1, 'sedang', 'u-guru-1'),
  ('s-3', 'pg', 'Matematika', 'XI', 'Trigonometri', 'Nilai sin 30° + cos 60° adalah...', '["0", "½", "1", "√3/2", "√2"]'::jsonb, 'C', 1, 'mudah', 'u-guru-1'),
  ('s-4', 'pg', 'Matematika', 'XI', 'Trigonometri', 'Persamaan tan x = √3 mempunyai penyelesaian x = ...', '["30°", "45°", "60°", "90°", "120°"]'::jsonb, 'C', 1, 'sedang', 'u-guru-1'),
  ('s-5', 'bs', 'Matematika', 'XI', 'Aljabar', 'Bilangan prima antara 10 dan 20 berjumlah 4 bilangan.', '[]'::jsonb, 'Benar', 1, 'mudah', 'u-guru-1'),
  ('s-6', 'isian', 'Matematika', 'XI', 'Aljabar', 'Jika 3x - 6 = 12, maka nilai x adalah...', '[]'::jsonb, '6', 2, 'mudah', 'u-guru-1'),
  ('s-7', 'uraian', 'Matematika', 'XI', 'Aljabar', 'Jelaskan langkah-langkah menyelesaikan persamaan kuadrat ax² + bx + c = 0 menggunakan rumus kuadrat (abc)!', '[]'::jsonb, 'Rumus kuadrat: x = (-b ± √(b²-4ac)) / 2a. Langkah: 1) Identifikasi a, b, c 2) Hitung diskriminan 3) Substitusi ke rumus', 5, 'sulit', 'u-guru-1')
on conflict (id) do nothing;

insert into public.ujian (id, kode, judul, mapel, kelas, guru, guru_id, durasi, kkm, jumlah_soal, soal_ids, jadwal_mulai, jadwal_selesai, instruksi, acak_soal, status)
values
  ('u-sample-1', 'MATH11', 'Ujian Matematika Kelas XI Semester 1', 'Matematika', 'XI IPA 1', 'Pak Budi Santoso', 'u-guru-1', 90, 75, 7, '["s-1","s-2","s-3","s-4","s-5","s-6","s-7"]'::jsonb, now() - interval '1 hour', now() + interval '30 days', 'Kerjakan soal dengan teliti. Dilarang bekerjasama.', true, 'aktif')
on conflict (kode) do nothing;
