-- ============================================================
-- VEKTORA FINANCE — Supabase schema (Postgres)
-- Holding: PT Vektora Teknologi Nusantara
-- Brands: WhereIsIt, Moonimo (dan brand baru tanpa ubah kode)
-- Jalankan di Supabase SQL Editor: schema.sql dulu, lalu seed.sql
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Enums ----------
do $$ begin
  create type txn_kind as enum ('income', 'expense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('sudah_dibayar', 'belum_reimburse');
exception when duplicate_object then null; end $$;

do $$ begin
  create type paid_by as enum ('company', 'investor');
exception when duplicate_object then null; end $$;

-- ---------- Holding / brands ----------
create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  segment text,
  description text,
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.brands add column if not exists logo_url text;

-- Channel penjualan / sumber pemasukan. brand_id null = channel global
-- (mis. Direct TF) yang bisa dipakai semua brand; channel per brand juga
-- bisa dibuat. Channel baru cukup INSERT, tanpa ubah kode.
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete set null,
  name text not null,
  slug text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (brand_id, slug)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  sku text,
  price numeric(18,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  contact text,
  created_at timestamptz not null default now()
);

-- ---------- Transaksi (income & expense, satu tabel) ----------
-- Aturan Status Bayar (sumber: sheet WhereIsIt):
--   payment_status = 'belum_reimburse' -> dicatat, tapi TIDAK masuk
--   total pengeluaran / saldo. Flip ke 'sudah_dibayar' (+ reimbursed_at)
--   baru masuk total. Logika ini ada di app (lib/types.ts countedAmount)
--   dan di view v_brand_monthly_summary di bawah.
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  kind txn_kind not null,
  txn_date date not null,
  description text not null,
  category text,
  amount numeric(18,2) not null check (amount >= 0),
  payment_method text,
  ref text,
  notes text,
  payment_status payment_status not null default 'sudah_dibayar',
  reimbursed_at timestamptz,
  -- Bayar hutang (24 Nov 2026): transaksi cicilan/pelunasan terhubung ke
  -- liabilities.id. BUKAN beban operasional: dikecualikan dari
  -- expense_counted & net di summarize() dan v_brand_monthly_summary.
  liability_id uuid references public.liabilities(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_txn_brand_date on public.transactions (brand_id, txn_date);
create index if not exists idx_txn_liability on public.transactions (liability_id);
create index if not exists idx_txn_kind on public.transactions (kind);
create index if not exists idx_txn_status on public.transactions (payment_status);
create index if not exists idx_txn_channel on public.transactions (channel_id);

-- Reimburse = audit trail: siapa / kapan status diubah.
create table if not exists public.reimbursements (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  amount numeric(18,2) not null,
  reimbursed_at timestamptz not null default now(),
  reimbursed_by text,
  notes text
);

-- ---------- Aset / investasi ----------
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  category text,
  qty numeric(12,2) not null default 1,
  unit_price numeric(18,2) not null default 0,
  total_price numeric(18,2) not null default 0,
  purchased_at date,
  condition text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_assets_brand on public.assets (brand_id);

-- ---------- Hutang / pinjaman ----------
-- paid_by: 'company' = hutang perusahaan (masuk total hutang),
--          'investor' = dibayar investor, BUKAN hutang perusahaan
--          (contoh: eSUN PETG via SPayLater — investor yang bayar).
create table if not exists public.liabilities (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete set null,
  creditor text not null,
  amount numeric(18,2) not null,
  remaining_amount numeric(18,2) not null,
  due_date date,
  monthly_installment numeric(18,2),
  months integer,
  paid_by paid_by not null default 'company',
  status text not null default 'aktif',
  notes text,
  -- Aset terkait (24 Nov 2026): hutang yang dibayar "menjadi aset".
  -- Saat lunas, aset sepenuhnya milik perusahaan. Tidak menambah total
  -- nilai aset saat cicilan dibayar — progres hanya info kepemilikan.
  asset_id uuid references public.assets(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_liab_brand on public.liabilities (brand_id);

-- Jadwal amortisasi / cicilan per hutang.
create table if not exists public.loan_installments (
  id uuid primary key default gen_random_uuid(),
  liability_id uuid not null references public.liabilities(id) on delete cascade,
  due_date date not null,
  amount numeric(18,2) not null,
  paid_at timestamptz,
  status text not null default 'belum_bayar'
);
create index if not exists idx_install_liab on public.loan_installments (liability_id);

-- ---------- Karyawan / gaji (OPEX fixed cost) ----------
-- is_fixed_cost = true  -> gaji masuk OPEX bulanan (staf operasional)
-- is_management = true  -> dibayar dari Management Fee, BUKAN OPEX
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  role text,
  team text,
  monthly_salary numeric(18,2) not null default 0,
  is_fixed_cost boolean not null default true,
  is_management boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_emp_brand on public.employees (brand_id);

-- ---------- Fee split per brand (bisa diubah tanpa ubah kode) ----------
-- Hanya berlaku bila laba bersih > 0; kalau negatif distribusi = 0.
-- recipients disimpan sebagai JSONB: [{name, pct_of_dividend|pct_of_fee}]
create table if not exists public.fee_splits (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  dividend_pct numeric(5,2) not null default 20,
  management_fee_pct numeric(5,2) not null default 55,
  retained_pct numeric(5,2) not null default 25,
  dividend_recipients jsonb not null default '[]'::jsonb,
  management_fee_recipients jsonb not null default '[]'::jsonb,
  effective_from date,
  created_at timestamptz not null default now(),
  constraint fee_split_total check (
    dividend_pct + management_fee_pct + retained_pct = 100
  )
);

-- ---------- Dividen tahunan (cair 1x per tahun, 24 Nov 2026) ----------
-- Jumlah per penerima DIBEKUKAN saat baris dibuat ("Buat pencairan
-- dividen {tahun}" di /fee-split) — perubahan laba setelah itu tidak
-- mengubah jumlah yang sudah dibuat. Status dibayar ditandai manual.
create table if not exists public.dividend_payouts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  year integer not null,
  recipient_name text not null,
  pct_of_dividend numeric(5,2) not null,
  amount numeric(18,2) not null,
  status text not null default 'belum_dibayar' check (status in ('belum_dibayar', 'sudah_dibayar')),
  paid_at timestamptz,
  sent_at timestamptz,
  sent_via text check (sent_via in ('whatsapp', 'email', 'langsung')),
  notes text,
  created_at timestamptz not null default now(),
  constraint dividend_payout_unique unique (brand_id, year, recipient_name)
);
create index if not exists idx_divpayout_brand_year on public.dividend_payouts (brand_id, year);

-- ---------- Peran pengguna (login) ----------
do $$ begin
  create type app_role as enum ('admin', 'management', 'komisaris', 'investor', 'karyawan');
exception when duplicate_object then null; end $$;

-- Profil login: id = FK ke auth.users (akun dibuat di Supabase Auth dulu,
-- lalu profil dibuat di halaman /team dengan Auth User ID-nya).
-- brand_ids null = akses semua brand; employee_id = tautan ke tabel
-- employees (wajib untuk peran karyawan, supaya dia hanya lihat slip sendiri).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role app_role not null default 'karyawan',
  brand_ids uuid[],
  employee_id uuid references public.employees(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_profiles_role on public.profiles (role);
create index if not exists idx_profiles_employee on public.profiles (employee_id);

-- ---------- Penyertaan modal ----------
-- amount NULL = Belum dicatat. JANGAN ditebak — isi sesuai kesepakatan.
-- Contoh: modal Febri masih kosong di sheet (18 Nov 2026).
create table if not exists public.capital_contributions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  contributor text not null,
  role text,
  amount numeric(18,2),
  contributed_at date,
  status text not null default 'belum_dicatat' check (status in ('belum_dicatat', 'aktif')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_capital_brand on public.capital_contributions (brand_id);

-- ---------- Pajak ----------
create table if not exists public.taxes (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  type text not null,
  period text,
  amount numeric(18,2) not null default 0,
  status text not null default 'belum_dihitung',
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_taxes_brand on public.taxes (brand_id);

-- ---------- Slip gaji ----------
-- payroll_periods: satu periode (YYYY-MM) per brand. Status: draft/final/paid.
-- payslips: satu slip per karyawan per periode. allowances/deductions =
-- JSONB [{label, amount}]. gross = base + tunjangan; net = gross - potongan.
-- Slip Sudah dibayar masuk OPEX bulan itu; Belum dibayar = tunggakan.
-- sent_at/sent_via dicatat saat slip dikirim (WhatsApp/Email/Langsung) —
-- app TIDAK mengirim otomatis; kirim dilakukan manual lewat tautan wa.me.
create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  period text not null,
  status text not null default 'draft' check (status in ('draft', 'final', 'paid')),
  notes text,
  created_at timestamptz not null default now(),
  unique (brand_id, period)
);
create index if not exists idx_payroll_brand_period on public.payroll_periods (brand_id, period);

-- KOREKSI 24 Nov 2026 (hapus karyawan): employee_id BOLEH null + ON DELETE
-- SET NULL — dulu NOT NULL + ON DELETE CASCADE, sehingga menghapus karyawan
-- ikut MENGHAPUS semua slip gajinya. Sekarang slip lama tetap tersimpan dan
-- tetap bisa dibuka; namanya dibaca dari snapshot employee_name di bawah.
create table if not exists public.payslips (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  -- Snapshot nama saat slip dibuat — supaya slip tetap menampilkan nama
  -- walau karyawan sudah dihapus dari tabel employees.
  employee_name text,
  base_salary numeric(18,2) not null default 0,
  allowances jsonb not null default '[]'::jsonb,
  deductions jsonb not null default '[]'::jsonb,
  gross numeric(18,2) not null default 0,
  total_deductions numeric(18,2) not null default 0,
  net_pay numeric(18,2) not null default 0,
  status text not null default 'belum_dibayar' check (status in ('belum_dibayar', 'sudah_dibayar')),
  paid_at timestamptz,
  sent_at timestamptz,
  sent_via text check (sent_via is null or sent_via in ('whatsapp', 'email', 'langsung')),
  notes text,
  created_at timestamptz not null default now(),
  unique (payroll_period_id, employee_id)
);
create index if not exists idx_payslip_period on public.payslips (payroll_period_id);
create index if not exists idx_payslip_employee on public.payslips (employee_id);
create index if not exists idx_payslip_status on public.payslips (status);

-- ---------- View: ringkasan bulanan per brand (Belum reimburse excluded) ----------
-- KOREKSI 24 Nov 2026 (Mattin): pembayaran hutang (liability_id terisi)
-- DIKECUALIKAN dari expense_counted & net — cicilan bukan beban
-- operasional, hanya mengurangi hutang (anti double count: asetnya sudah
-- tercatat). Lihat juga summarize() di src/lib/types.ts.
create or replace view public.v_brand_monthly_summary as
select
  brand_id,
  to_char(txn_date, 'YYYY-MM') as month,
  sum(case when kind = 'income' then amount else 0 end) as income,
  sum(case when kind = 'expense' and payment_status = 'sudah_dibayar' and liability_id is null then amount else 0 end) as expense_counted,
  sum(case when kind = 'expense' and payment_status = 'belum_reimburse' then amount else 0 end) as belum_reimburse,
  sum(case when kind = 'income' then amount else 0 end)
    - sum(case when kind = 'expense' and payment_status = 'sudah_dibayar' and liability_id is null then amount else 0 end) as net
from public.transactions
group by brand_id, to_char(txn_date, 'YYYY-MM');

-- View: total slip gaji per brand & periode (investor/komisaris boleh lihat
-- TOTAL ini, bukan slip per karyawan).
create or replace view public.v_payroll_totals as
select
  pp.brand_id,
  pp.period as month,
  count(*) as slip_count,
  sum(p.net_pay) as total_net,
  sum(case when p.status = 'sudah_dibayar' then p.net_pay else 0 end) as total_paid,
  sum(case when p.status = 'belum_dibayar' then p.net_pay else 0 end) as total_outstanding
from public.payslips p
join public.payroll_periods pp on pp.id = p.payroll_period_id
group by pp.brand_id, pp.period;

-- View: ringkasan investor per brand (modal, aset, hutang perusahaan, laba).
create or replace view public.v_investor_summary as
select
  b.id as brand_id,
  coalesce((select sum(amount) from public.capital_contributions c where c.brand_id = b.id and c.status = 'aktif'), 0) as capital_total,
  coalesce((select sum(total_price) from public.assets a where a.brand_id = b.id), 0) as assets_total,
  coalesce((select sum(remaining_amount) from public.liabilities l where l.brand_id = b.id and l.paid_by = 'company'), 0) as company_debt,
  coalesce((select sum(amount) from public.transactions t where t.brand_id = b.id and t.kind = 'income'), 0) as income_total,
  coalesce((select sum(amount) from public.transactions t where t.brand_id = b.id and t.kind = 'expense' and t.payment_status = 'sudah_dibayar' and t.liability_id is null), 0) as expense_counted_total
from public.brands b;

-- ---------- RLS (sederhana tapi nyata) ----------
-- Semua tabel: hanya user yang login (authenticated) yang boleh baca/tulis.
-- Untuk multi-user per organisasi, tambahkan kolom org_id + policy per org
-- di iterasi berikutnya; struktur tabel di atas sudah brand-scoped.
alter table public.brands enable row level security;
alter table public.channels enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.transactions enable row level security;
alter table public.reimbursements enable row level security;
alter table public.assets enable row level security;
alter table public.liabilities enable row level security;
alter table public.loan_installments enable row level security;
alter table public.employees enable row level security;
alter table public.fee_splits enable row level security;
alter table public.dividend_payouts enable row level security;

do $$ begin
  create policy "authenticated read" on public.brands for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated write" on public.brands for all using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- Terapkan pola yang sama ke semua tabel lain (idempotent via DO block).
do $$
declare t text;
begin
  foreach t in array array['channels','products','customers','transactions','reimbursements','assets','liabilities','loan_installments','employees','fee_splits'] loop
    begin
      execute format('create policy "authenticated read" on public.%I for select using (auth.role() = ''authenticated'')', t);
    exception when duplicate_object then null; end;
    begin
      execute format('create policy "authenticated write" on public.%I for all using (auth.role() = ''authenticated'')', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- ---------- RLS berbasis peran (19 Nov 2026) ----------
-- Menggantikan policy generik "authenticated read/write" di atas untuk
-- tabel operasional. Prinsip:
--   admin       : baca + tulis semua (fee split & tim hanya admin)
--   management  : baca + tulis operasional, TIDAK ubah fee split / tim
--   komisaris   : baca saja dashboard/laporan/fee (tanpa gaji per karyawan)
--   investor    : baca saja portfolio (tanpa gaji/slip per karyawan)
--   karyawan    : hanya profil sendiri + slip gaji sendiri
-- User nonaktif (profiles.active = false) tidak lolos policy mana pun dan
-- di-logout oleh middleware.
create or replace function public.current_user_role() returns text
language sql stable security definer
as $$ select role::text from public.profiles where id = auth.uid() and active = true $$;

create or replace function public.current_employee_id() returns uuid
language sql stable security definer
as $$ select employee_id from public.profiles where id = auth.uid() and active = true $$;

alter table public.profiles enable row level security;
alter table public.capital_contributions enable row level security;
alter table public.taxes enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payslips enable row level security;

-- profiles: baca = diri sendiri atau admin/management; tulis = admin saja.
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select using (
  auth.uid() = id or public.current_user_role() in ('admin', 'management')
);
drop policy if exists "profiles write admin" on public.profiles;
create policy "profiles write admin" on public.profiles for all using (public.current_user_role() = 'admin');

-- Tabel operasional: baca untuk admin/management/komisaris/investor
-- (karyawan TIDAK), tulis untuk admin/management (fee split: admin saja).
do $$
declare t text;
begin
  foreach t in array array['brands','channels','products','customers','transactions','reimbursements','assets','liabilities','loan_installments','fee_splits'] loop
    execute format('drop policy if exists "authenticated read" on public.%I', t);
    execute format('drop policy if exists "authenticated write" on public.%I', t);
    execute format('create policy "read operations" on public.%I for select using (public.current_user_role() in (''admin'',''management'',''komisaris'',''investor''))', t);
    if t = 'fee_splits' then
      execute format('create policy "write admin" on public.%I for all using (public.current_user_role() = ''admin'')', t);
    else
      execute format('create policy "write admin management" on public.%I for all using (public.current_user_role() in (''admin'',''management''))', t);
    end if;
  end loop;
end $$;

-- Karyawan (gaji): hanya admin/management yang boleh baca/tulis.
-- Investor & komisaris TIDAK boleh lihat detail gaji (hanya total OPEX
-- di dashboard / view v_payroll_totals).
drop policy if exists "authenticated read" on public.employees;
drop policy if exists "authenticated write" on public.employees;
drop policy if exists "employees read" on public.employees;
create policy "employees read" on public.employees for select using (public.current_user_role() in ('admin', 'management'));
drop policy if exists "employees write" on public.employees;
create policy "employees write" on public.employees for all using (public.current_user_role() in ('admin', 'management'));

-- Modal & pajak: baca admin/management/komisaris/investor; tulis admin/management.
do $$
declare t text;
begin
  foreach t in array array['capital_contributions','taxes'] loop
    execute format('create policy "read portfolio" on public.%I for select using (public.current_user_role() in (''admin'',''management'',''komisaris'',''investor''))', t);
    execute format('create policy "write admin management" on public.%I for all using (public.current_user_role() in (''admin'',''management''))', t);
  end loop;
end $$;

-- Periode payroll: baca semua peran yang login (karyawan butuh periode untuk
-- slipnya); tulis admin/management.
drop policy if exists "payroll periods read" on public.payroll_periods;
create policy "payroll periods read" on public.payroll_periods for select using (public.current_user_role() is not null);
drop policy if exists "payroll periods write" on public.payroll_periods;
create policy "payroll periods write" on public.payroll_periods for all using (public.current_user_role() in ('admin', 'management'));

-- Dividen tahunan: pola yang sama dengan fee_splits (baca untuk
-- admin/management/komisaris/investor; karyawan TIDAK). Tulis: admin +
-- management — PENYIMPANGAN yang disengaja dari fee_splits (yang tulisnya
-- admin saja): tombol "Buat pencairan dividen" di app memang dibuka untuk
-- admin DAN management, jadi RLS harus mengizinkan keduanya, kalau tidak
-- insert dari management ditolak database.
drop policy if exists "read operations" on public.dividend_payouts;
create policy "read operations" on public.dividend_payouts for select using (public.current_user_role() in ('admin', 'management', 'komisaris', 'investor'));
drop policy if exists "write admin management" on public.dividend_payouts;
create policy "write admin management" on public.dividend_payouts for all using (public.current_user_role() in ('admin', 'management'));

-- Slip gaji: admin/management semua; karyawan hanya slipnya sendiri.
-- Komisaris & investor TIDAK boleh baca slip per karyawan.
drop policy if exists "payslips read" on public.payslips;
create policy "payslips read" on public.payslips for select using (
  public.current_user_role() in ('admin', 'management')
  or (public.current_user_role() = 'karyawan' and employee_id = public.current_employee_id())
);
drop policy if exists "payslips write" on public.payslips;
create policy "payslips write" on public.payslips for all using (public.current_user_role() in ('admin', 'management'));

-- ---------- Audit log — riwayat ubah/hapus transaksi (24 Nov 2026) ----------
-- Satu baris per edit/delete transaksi di app (actor = profil yang login).
-- Dibaca di halaman /history (admin + management saja). Tabel ini TIDAK
-- dihapus bareng transaksinya: bila transaksi dihapus, baris auditnya
-- tetap ada (record_id menunjuk id yang sudah tidak ada).
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_name text,
  actor_email text,
  action text not null check (action in ('edit', 'delete')),
  table_name text not null default 'transactions',
  record_id uuid,
  record_label text,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_log_created on public.audit_log (created_at desc);
create index if not exists idx_audit_log_record on public.audit_log (table_name, record_id);
alter table public.audit_log enable row level security;
-- Baca: admin + management saja (komisaris/investor/karyawan TIDAK).
drop policy if exists "audit_log read" on public.audit_log;
create policy "audit_log read" on public.audit_log for select using (public.current_user_role() in ('admin', 'management'));
-- Tulis: admin + management (hanya mereka yang boleh edit/hapus transaksi,
-- jadi hanya mereka yang perlu insert audit). Insert dilakukan dari app
-- dengan sesi user yang login — tidak perlu policy authenticated umum.
drop policy if exists "audit_log write" on public.audit_log;
create policy "audit_log write" on public.audit_log for insert with check (public.current_user_role() in ('admin', 'management'));
