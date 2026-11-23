-- ============================================================
-- VEKTORA FINANCE — final-setup.sql  (SATU-SATUNYA FILE SQL)
-- ============================================================
-- CARA PAKAI (24 Nov 2026, Mattin): jalankan file ini SATU-SATUNYA
-- di Supabase SQL Editor, di project yang sama dengan env Vercel.
-- TIDAK ADA URUTAN FILE LAGI. File-file lama JANGAN dijalankan lagi:
--   schema.sql, seed.sql, dedupe-duplicates.sql,
--   seed-latest-2026-11-24.sql, migration-dividend-payouts.sql,
--   seed-wa-2026-11-24.sql — ISINYA SUDAH ADA DI FILE INI.
-- Setiap revisi ke depan cukup update file ini.
--
-- SIFAT: SATU transaksi (begin; ... commit;) — gagal di tengah =
-- rollback total, tidak ada data setengah masuk. Aman di-run ulang
-- berkali-kali: semua CREATE pakai IF NOT EXISTS, semua ALTER pakai
-- ADD COLUMN IF NOT EXISTS, semua policy DROP IF EXISTS dulu,
-- semua INSERT dijaga NOT EXISTS / ON CONFLICT, semua view
-- CREATE OR REPLACE.
--
-- ISI (gabungan 6 file lama):
--   1. SKEMA (schema.sql): semua tabel + kolom baru + RLS + view.
--   2. DEDUPE (dedupe-duplicates.sql): bersihkan duplikat seed 2x.
--   3. SEED (seed.sql): data awal Nov 2026 + fee split ikut sheet.
--   4. SEED-LATEST (seed-latest-2026-11-24.sql): Afr + 17 income PO.
--   5. MIGRASI (migration-dividend-payouts.sql): dividend_payouts
--      + kolom bayar-hutang + perbaikan FK payslips.
--   6. SEED-WA TERKOREKSI (seed-wa-2026-11-24.sql): 9 expense,
--      0 income; 2 income double + 1 dana pribadi DIHAPUS (lihat §6).
--
-- REKONSILIASI SETELAH DIJALANKAN (WhereIsIt, Nov 2026):
--   Income total               = Rp4.179.000
--   Pengeluaran terhitung      = Rp2.165.738
--   Belum reimburse            = Rp605.423
--   Saldo                      = Rp2.013.262
--   Aset                       = 3 baris (total Rp16.161.043)
--   Hutang                     = 1 baris (Febri Rp5.380.000)
--   Transaksi Nov 2026         = 25 income + 48 expense = 73 baris
-- Cocok dengan sheet November setelah koreksi 24 Nov 2026:
--   income sheet Rp1.620.000 — selisih Rp2.559.000 adalah 17 order
--   PO yang hanya ada di app/PO, belum masuk sheet.
--
-- PERBEDAAN DARI FILE LAMA (diperbaiki di sini):
--   - Urutan CREATE TABLE diperbaiki (transactions dibuat SETELAH
--     liabilities; liability_id ditambah via ALTER) — schema.sql
--     lama gagal di database baru karena FK ke tabel yang belum ada.
--   - Policy RLS capital_contributions/taxes di schema.sql lama
--     tidak idempotent (create tanpa drop dulu) — di sini semua
--     policy DROP IF EXISTS dulu.
--   - Insert customers / capital_contributions / taxes di seed.sql
--     lama pakai ON CONFLICT DO NOTHING tanpa unique constraint —
--     tidak melindungi dari duplikat. Di sini pakai NOT EXISTS.
-- ============================================================

begin;

-- ============================================================
-- §0. EXTENSION + ENUMS
-- ============================================================

create extension if not exists "pgcrypto";

do $$ begin
  create type txn_kind as enum ('income', 'expense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('sudah_dibayar', 'belum_reimburse');
exception when duplicate_object then null; end $$;

do $$ begin
  create type paid_by as enum ('company', 'investor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app_role as enum ('admin', 'management', 'komisaris', 'investor', 'karyawan');
exception when duplicate_object then null; end $$;

-- ============================================================
-- §1. SKEMA (dari schema.sql)
-- Urutan tabel mengikuti dependensi FK supaya database BARU pun
-- bisa menjalankan file ini dari nol.
-- ============================================================

-- ---------- Holding / brands ----------
create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  segment text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

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
-- asset_id (24 Nov 2026): hutang yang dibayar "menjadi aset".
-- Saat lunas, aset sepenuhnya milik perusahaan. Tidak menambah total
-- nilai aset saat cicilan dibayar — progres hanya info kepemilikan.
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
  asset_id uuid references public.assets(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_liab_brand on public.liabilities (brand_id);
create index if not exists idx_liab_asset on public.liabilities (asset_id);

-- ---------- Transaksi (income & expense, satu tabel) ----------
-- Aturan Status Bayar (sumber: sheet WhereIsIt):
--   payment_status = 'belum_reimburse' -> dicatat, tapi TIDAK masuk
--   total pengeluaran / saldo. Flip ke 'sudah_dibayar' (+ reimbursed_at)
--   baru masuk total. Logika ini ada di app (lib/types.ts countedAmount)
--   dan di view v_brand_monthly_summary di bawah.
-- liability_id TIDAK ditulis di CREATE TABLE ini (tabel liabilities
-- belum tentu ada saat file lama dijalankan) — ditambah via ALTER
-- di bawah, setelah semua tabel ada.
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_txn_brand_date on public.transactions (brand_id, txn_date);
create index if not exists idx_txn_kind on public.transactions (kind);
create index if not exists idx_txn_status on public.transactions (payment_status);
create index if not exists idx_txn_channel on public.transactions (channel_id);

-- Bayar hutang (24 Nov 2026): transaksi cicilan/pelunasan terhubung ke
-- liabilities.id. BUKAN beban operasional: dikecualikan dari
-- expense_counted & net di summarize() dan v_brand_monthly_summary.
alter table public.transactions
  add column if not exists liability_id uuid references public.liabilities(id) on delete set null;
create index if not exists idx_txn_liability on public.transactions (liability_id);

-- Reimburse = audit trail: siapa / kapan status diubah.
create table if not exists public.reimbursements (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  amount numeric(18,2) not null,
  reimbursed_at timestamptz not null default now(),
  reimbursed_by text,
  notes text
);

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
-- sent_at/sent_via: dicatat saat slip dividen dikirim (WhatsApp/Email/
-- Langsung) — app TIDAK mengirim otomatis.
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

-- ---------- Audit log — riwayat ubah/hapus transaksi (24 Nov 2026) ----------
-- Satu baris per edit/delete transaksi: siapa (actor), kapan, apa yang
-- berubah (old_values -> new_values). Baris audit TIDAK ikut terhapus
-- saat transaksinya dihapus: bila transaksi dihapus, baris auditnya
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

-- ---------- Peran pengguna (login) ----------
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
-- KOREKSI 24 Nov 2026 (hapus karyawan): employee_id BOLEH null + ON DELETE
-- SET NULL — dulu NOT NULL + ON DELETE CASCADE, sehingga menghapus karyawan
-- ikut MENGHAPUS semua slip gajinya. Sekarang slip lama tetap tersimpan dan
-- tetap bisa dibuka; namanya dibaca dari snapshot employee_name.
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

create table if not exists public.payslips (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
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

-- ---------- Kolom baru (defensif — untuk DB yang dibuat dari schema lama) ----------
-- Bila tabel di atas dibuat dari versi schema SEBELUM 24 Nov 2026,
-- CREATE TABLE IF NOT EXISTS tidak menambahkan kolom-kolom ini.
-- ALTER di sini menutup celah itu; bila kolom sudah ada, no-op.
alter table public.transactions
  add column if not exists liability_id uuid references public.liabilities(id) on delete set null;
alter table public.liabilities
  add column if not exists asset_id uuid references public.assets(id) on delete set null;
alter table public.dividend_payouts
  add column if not exists sent_at timestamptz,
  add column if not exists sent_via text check (sent_via in ('whatsapp', 'email', 'langsung'));
alter table public.payslips
  add column if not exists employee_name text;

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

-- ---------- RLS ----------
-- Prinsip (19 Nov 2026):
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
alter table public.profiles enable row level security;
alter table public.capital_contributions enable row level security;
alter table public.taxes enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payslips enable row level security;

-- Tabel operasional: baca admin/management/komisaris/investor
-- (karyawan TIDAK), tulis admin/management (fee split: admin saja).
drop policy if exists "read operations" on public.brands;
create policy "read operations" on public.brands for select using (public.current_user_role() in ('admin','management','komisaris','investor'));
drop policy if exists "write admin management" on public.brands;
create policy "write admin management" on public.brands for all using (public.current_user_role() in ('admin','management'));
drop policy if exists "read operations" on public.channels;
create policy "read operations" on public.channels for select using (public.current_user_role() in ('admin','management','komisaris','investor'));
drop policy if exists "write admin management" on public.channels;
create policy "write admin management" on public.channels for all using (public.current_user_role() in ('admin','management'));
drop policy if exists "read operations" on public.products;
create policy "read operations" on public.products for select using (public.current_user_role() in ('admin','management','komisaris','investor'));
drop policy if exists "write admin management" on public.products;
create policy "write admin management" on public.products for all using (public.current_user_role() in ('admin','management'));
drop policy if exists "read operations" on public.customers;
create policy "read operations" on public.customers for select using (public.current_user_role() in ('admin','management','komisaris','investor'));
drop policy if exists "write admin management" on public.customers;
create policy "write admin management" on public.customers for all using (public.current_user_role() in ('admin','management'));
drop policy if exists "read operations" on public.transactions;
create policy "read operations" on public.transactions for select using (public.current_user_role() in ('admin','management','komisaris','investor'));
drop policy if exists "write admin management" on public.transactions;
create policy "write admin management" on public.transactions for all using (public.current_user_role() in ('admin','management'));
drop policy if exists "read operations" on public.reimbursements;
create policy "read operations" on public.reimbursements for select using (public.current_user_role() in ('admin','management','komisaris','investor'));
drop policy if exists "write admin management" on public.reimbursements;
create policy "write admin management" on public.reimbursements for all using (public.current_user_role() in ('admin','management'));
drop policy if exists "read operations" on public.assets;
create policy "read operations" on public.assets for select using (public.current_user_role() in ('admin','management','komisaris','investor'));
drop policy if exists "write admin management" on public.assets;
create policy "write admin management" on public.assets for all using (public.current_user_role() in ('admin','management'));
drop policy if exists "read operations" on public.liabilities;
create policy "read operations" on public.liabilities for select using (public.current_user_role() in ('admin','management','komisaris','investor'));
drop policy if exists "write admin management" on public.liabilities;
create policy "write admin management" on public.liabilities for all using (public.current_user_role() in ('admin','management'));
drop policy if exists "read operations" on public.loan_installments;
create policy "read operations" on public.loan_installments for select using (public.current_user_role() in ('admin','management','komisaris','investor'));
drop policy if exists "write admin management" on public.loan_installments;
create policy "write admin management" on public.loan_installments for all using (public.current_user_role() in ('admin','management'));
drop policy if exists "read operations" on public.fee_splits;
create policy "read operations" on public.fee_splits for select using (public.current_user_role() in ('admin','management','komisaris','investor'));
drop policy if exists "write admin" on public.fee_splits;
create policy "write admin" on public.fee_splits for all using (public.current_user_role() = 'admin');

-- Karyawan (gaji): hanya admin/management yang boleh baca/tulis.
-- Investor & komisaris TIDAK boleh lihat detail gaji (hanya total OPEX
-- di dashboard / view v_payroll_totals).
drop policy if exists "employees read" on public.employees;
create policy "employees read" on public.employees for select using (public.current_user_role() in ('admin', 'management'));
drop policy if exists "employees write" on public.employees;
create policy "employees write" on public.employees for all using (public.current_user_role() in ('admin', 'management'));

-- profiles: baca = diri sendiri atau admin/management; tulis = admin saja.
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select using (
  auth.uid() = id or public.current_user_role() in ('admin', 'management')
);
drop policy if exists "profiles write admin" on public.profiles;
create policy "profiles write admin" on public.profiles for all using (public.current_user_role() = 'admin');

-- Modal & pajak: baca admin/management/komisaris/investor; tulis admin/management.
drop policy if exists "read portfolio" on public.capital_contributions;
create policy "read portfolio" on public.capital_contributions for select using (public.current_user_role() in ('admin','management','komisaris','investor'));
drop policy if exists "write admin management" on public.capital_contributions;
create policy "write admin management" on public.capital_contributions for all using (public.current_user_role() in ('admin','management'));
drop policy if exists "read portfolio" on public.taxes;
create policy "read portfolio" on public.taxes for select using (public.current_user_role() in ('admin','management','komisaris','investor'));
drop policy if exists "write admin management" on public.taxes;
create policy "write admin management" on public.taxes for all using (public.current_user_role() in ('admin','management'));

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

-- Audit log: baca admin + management saja (komisaris/investor/karyawan TIDAK).
-- Tulis: admin + management (hanya mereka yang boleh edit/hapus transaksi,
-- jadi hanya mereka yang perlu insert audit). Insert dilakukan dari app
-- dengan sesi user yang login — tidak perlu policy authenticated umum.
drop policy if exists "audit_log read" on public.audit_log;
create policy "audit_log read" on public.audit_log for select using (public.current_user_role() in ('admin', 'management'));
drop policy if exists "audit_log write" on public.audit_log;
create policy "audit_log write" on public.audit_log for insert with check (public.current_user_role() in ('admin', 'management'));

-- ============================================================
-- §2. DEDUPE (dari dedupe-duplicates.sql)
-- PENYEBAB (24 Nov 2026): seed.sql versi lama di-run 2x di Supabase
-- (mis. run pertama sebelum akun Auth dibuat, run kedua sesudahnya
-- supaya profil muncul). Blok transaksi / aset / hutang / fee-split
-- di seed.sql lama TIDAK punya pengaman anti-duplikat, jadi tiap
-- baris masuk 2x: aset P2S/PETG/A1 dobel, Belum reimburse jadi
-- Rp1.210.846 (seharusnya Rp605.423), laba jadi Rp744.236.
-- CARA KERJA: tiap grup duplikat dipertahankan 1 baris tertua
-- (ctid terkecil), sisanya dihapus. Aman di-run ulang (kalau sudah
-- bersih, tidak ada baris yang terhapus). Berjalan SEBELUM seed
-- di bawah, supaya seed yang idempotent tidak menumpuk di atas
-- duplikat lama.
-- ============================================================

-- Transaksi: kunci (brand, jenis, tanggal, deskripsi, jumlah)
delete from public.transactions t
where t.ctid in (
  select ctid from (
    select ctid, row_number() over (
      partition by brand_id, kind, txn_date, description, amount
      order by ctid
    ) as rn from public.transactions
  ) s where s.rn > 1
);

-- Aset: kunci (brand, nama, tanggal beli, total harga)
delete from public.assets a
where a.ctid in (
  select ctid from (
    select ctid, row_number() over (
      partition by brand_id, name, purchased_at, total_price
      order by ctid
    ) as rn from public.assets
  ) s where s.rn > 1
);

-- Hutang: kunci (brand, kreditur, jumlah, jatuh tempo)
delete from public.liabilities l
where l.ctid in (
  select ctid from (
    select ctid, row_number() over (
      partition by brand_id, creditor, amount, due_date
      order by ctid
    ) as rn from public.liabilities
  ) s where s.rn > 1
);

-- Fee split: kunci (brand, tanggal berlaku)
delete from public.fee_splits f
where f.ctid in (
  select ctid from (
    select ctid, row_number() over (
      partition by brand_id, effective_from
      order by ctid
    ) as rn from public.fee_splits
  ) s where s.rn > 1
);

-- ============================================================
-- §3. SEED (dari seed.sql)
-- Data nyata WhereIsIt November 2026 dari sheet (Income & Expend
-- 2026 + Laporan Keuangan WhereIsIt, per 18 Nov 2026).
-- Moonimo di-seed kosong (brand saja, belum ada transaksi).
-- Gaji karyawan TIDAK di-seed: belum ada angka terkonfirmasi — isi di
-- halaman /employees. Jangan tebak gaji.
-- PERBAIKAN di file ini vs seed.sql lama: insert customers /
-- capital_contributions / taxes pakai guard NOT EXISTS (seed.sql
-- lama pakai ON CONFLICT DO NOTHING tanpa unique constraint, jadi
-- run ulang tetap menduplikat baris-baris itu).
-- Perbaikan 24 Nov 02:02: kolom dari VALUES harus di-cast eksplisit
-- (brand_id::uuid, tanggal::date, kind::txn_kind,
-- payment_status::payment_status, paid_by::paid_by) — tanpa cast,
-- Postgres error 42883 "operator does not exist".
-- ============================================================

-- ---------- Brands ----------
insert into public.brands (id, name, slug, segment, description) values
  ('11111111-1111-1111-1111-111111111111', 'WhereIsIt', 'whereisit', '3D print — Strava keychain, plaque, e-money custom', 'Brand 3D-print PT Vektora. Produk: keychain / plaque rute Strava, e-money custom.'),
  ('22222222-2222-2222-2222-222222222222', 'Moonimo', 'moonimo', 'Segmen berbeda dari WhereIsIt (akan diluncurkan)', 'Brand baru PT Vektora, segmen berbeda dari WhereIsIt. Belum ada transaksi.')
on conflict (slug) do nothing;

-- ---------- Channels (extensible: tambah channel = INSERT baru) ----------
insert into public.channels (brand_id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Direct TF', 'direct-tf'),
  ('11111111-1111-1111-1111-111111111111', 'Shopee', 'shopee'),
  ('11111111-1111-1111-1111-111111111111', 'Official Website', 'official-website'),
  ('22222222-2222-2222-2222-222222222222', 'Direct TF', 'direct-tf'),
  ('22222222-2222-2222-2222-222222222222', 'Shopee', 'shopee'),
  ('22222222-2222-2222-2222-222222222222', 'Official Website', 'official-website')
on conflict do nothing;

-- ---------- Customers / income Nov 2026 (7 sales, total Rp1.470.000) ----------
-- Siti 150.000, Puka 300.000, Ory 170.000, Ariel 190.000, Bagas 170.000,
-- Salsabila 340.000, Alfian 150.000. Channel per order tidak tercatat
-- di sheet — di-seed sebagai Direct TF kecuali yang diketahui Shopee.
insert into public.customers (brand_id, name)
select '11111111-1111-1111-1111-111111111111', c.name
from (values ('Siti Zahrah'), ('Puka'), ('Ory'), ('Ariel Wastujaya'), ('Bagas P'), ('Salsabila'), ('Alfian Gani')) as c(name)
where not exists (
  select 1 from public.customers cu
  where cu.brand_id = '11111111-1111-1111-1111-111111111111' and cu.name = c.name
);

-- Income: gunakan channel Direct TF (seed).
insert into public.transactions (brand_id, channel_id, kind, txn_date, description, category, amount, payment_method, ref, notes, payment_status)
select '11111111-1111-1111-1111-111111111111', c.id, 'income', d.txn_date, d.description, 'Penjualan', d.amount, 'Transfer', d.ref, d.notes, 'sudah_dibayar'
from public.channels c,
  (values
    ('2026-11-01'::date, 'Keychain custom Lembang — Siti Zahrah', 150000, 'INV/WII/2026/11/001', 'Lunas'),
    ('2026-11-01'::date, 'Keychain 2 pcs — Puka', 300000, 'INV/WII/2026/11/002', 'Lunas'),
    ('2026-11-01'::date, 'E-money — Ory', 170000, 'INV/WII/2026/11/003', 'Lunas'),
    ('2026-11-01'::date, 'Keychain PLN Electric Run — Ariel Wastujaya', 190000, 'INV/WII/2026/11/004', 'Lunas'),
    ('2026-11-01'::date, 'Keychain JRF Half Marathon — Bagas P', 170000, 'INV/WII/2026/11/005', 'Lunas'),
    ('2026-11-01'::date, 'Order 008 — Salsabila', 340000, 'INV/WII/2026/11/006', 'Lunas'),
    ('2026-11-01'::date, 'Order — Alfian Gani', 150000, 'INV/WII/2026/11/007', 'Lunas')
  ) as d(txn_date, description, amount, ref, notes)
where c.brand_id = '11111111-1111-1111-1111-111111111111' and c.slug = 'direct-tf'
  and not exists (select 1 from public.transactions t where t.brand_id = '11111111-1111-1111-1111-111111111111' and t.kind = 'income' and t.txn_date = d.txn_date and t.description = d.description and t.amount = d.amount);

-- ---------- Pengeluaran Nov 2026, SUDAH DIBAYAR (25 baris, Rp1.310.605) ----------
insert into public.transactions (brand_id, kind, txn_date, description, category, amount, payment_method, notes, payment_status)
select v.brand_id::uuid, v.kind::txn_kind, v.txn_date::date, v.description, v.category, v.amount, v.payment_method, v.notes, v.payment_status::payment_status
from (values
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-02', 'Spon', 'Operasional', 12000, 'Tunai', null, 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-03', 'Acrylic Marker', 'Operasional', 43123, 'Tunai', null, 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-10', 'Filamen Elegoo', 'Bahan Baku', 112600, 'Transfer', null, 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-11', 'Print label SOFASCO', 'Operasional', 20000, 'Tunai', 'Dibayar dari rekening Av', 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-12', 'Gas torch Oikosh', 'Operasional', 26900, 'Transfer', 'Member Januar', 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-12', 'eSIM Telkomsel', 'Operasional', 35000, 'Transfer', null, 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-13', 'Gantungan ID Card', 'Operasional', 211250, 'Transfer', null, 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-13', 'Alas Kaki Karet', 'Operasional', 20497, 'Transfer', null, 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-13', 'Flazz BCA x2', 'Bahan Baku', 119396, 'Transfer', null, 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-14', 'Pad holder', 'Operasional', 32494, 'Transfer', null, 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-14', 'Tokma', 'Operasional', 43800, 'Transfer', 'Sudah direimburse ke Januar 14 Nov', 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-14', 'Print dan kertas', 'Operasional', 46000, 'Tunai', null, 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-15', 'Cat', 'Bahan Baku', 170000, 'Transfer', null, 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-15', 'Tiner', 'Bahan Baku', 20000, 'Transfer', null, 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-15', 'Kartu E-money Indomaret #1', 'Bahan Baku', 40000, 'Tunai', 'Dibayar pakai refund Livin Rp482.604', 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-15', 'Kartu E-money Indomaret #2', 'Bahan Baku', 40000, 'Tunai', 'Dibayar pakai refund Livin Rp482.604', 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-15', 'Kartu E-money Indomaret #3', 'Bahan Baku', 40000, 'Tunai', 'Dibayar pakai refund Livin Rp482.604', 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-15', 'Kartu E-money Indomaret #4', 'Bahan Baku', 40000, 'Tunai', 'Dibayar pakai refund Livin Rp482.604', 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-15', 'Kartu E-money Indomaret #5', 'Bahan Baku', 40000, 'Tunai', 'Dibayar pakai refund Livin Rp482.604', 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-16', 'Kartu E-money Indomaret #6', 'Bahan Baku', 40000, 'Tunai', 'Dibayar pakai refund Livin Rp482.604; sisa refund Rp202.604 di Januar', 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-16', 'Kartu E-money Indomaret #7', 'Bahan Baku', 40000, 'Tunai', 'Dibayar pakai refund Livin Rp482.604; sisa refund Rp202.604 di Januar', 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-17', 'eSIM by.U SUPERKAGET 5GB', 'Operasional', 30000, 'BCA VA', 'Beli lagi, yang kemarin gagal', 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-17', 'Biaya pengiriman JNT', 'Operasional', 44000, 'DANA', 'blu DANA top-up, caption JNT', 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-17', 'Hosting / Domain Hostinger', 'Operasional', 23545, 'QRIS', 'Xendit — domain, bayar sebelum 24/11/2026', 'sudah_dibayar'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-17', 'Bensin Mio — SPBU Jendral 240 Karawang', 'Operasional', 20000, 'QRIS', 'blu QRIS 21:41', 'sudah_dibayar')
) as v(brand_id, kind, txn_date, description, category, amount, payment_method, notes, payment_status)
where not exists (select 1 from public.transactions t where t.brand_id = v.brand_id::uuid and t.kind = v.kind::txn_kind and t.txn_date = v.txn_date::date and t.description = v.description and t.amount = v.amount);

-- ---------- Pengeluaran BELUM REIMBURSE (12 item Meeting Calon BA, Rp437.700) ----------
-- Satu-satunya Belum reimburse di Nov 2026 — sumber: Notion
-- "Pengeluaran Operasional - Meeting Calon BA - 9 November 2026".
insert into public.transactions (brand_id, kind, txn_date, description, category, amount, payment_method, notes, payment_status)
select v.brand_id::uuid, v.kind::txn_kind, v.txn_date::date, v.description, v.category, v.amount, v.payment_method, v.notes, v.payment_status::payment_status
from (values
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-09', 'Tiket kereta — Meeting Calon BA', 'Transportasi', 6000, null, 'Notion Meeting Calon BA 9 Nov', 'belum_reimburse'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-09', 'Le Minerale — Meeting Calon BA', 'Makan/minum', 14000, null, 'Notion Meeting Calon BA 9 Nov', 'belum_reimburse'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-09', 'Tiket MRT — Meeting Calon BA', 'Transportasi', 40000, null, 'Notion Meeting Calon BA 9 Nov', 'belum_reimburse'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-09', 'Tiket KRL — Meeting Calon BA', 'Transportasi', 28000, null, 'Notion Meeting Calon BA 9 Nov', 'belum_reimburse'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-09', 'Makan siang — Meeting Calon BA', 'Makan/minum', 45000, null, 'Notion Meeting Calon BA 9 Nov', 'belum_reimburse'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-09', 'Kopi Tuku — Meeting Calon BA', 'Makan/minum', 64000, null, 'Notion Meeting Calon BA 9 Nov', 'belum_reimburse'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-09', 'Grab Car — Meeting Calon BA', 'Transportasi', 35000, null, 'Notion Meeting Calon BA 9 Nov', 'belum_reimburse'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-09', 'Ompreng — Meeting Calon BA', 'Makan/minum', 120000, null, 'Notion Meeting Calon BA 9 Nov', 'belum_reimburse'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-09', 'Angkot — Meeting Calon BA', 'Transportasi', 20000, null, 'Notion Meeting Calon BA 9 Nov', 'belum_reimburse'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-09', 'Parkir — Meeting Calon BA', 'Transportasi', 7000, null, 'Notion Meeting Calon BA 9 Nov', 'belum_reimburse'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-09', 'Makan malam — Meeting Calon BA', 'Makan/minum', 38700, null, 'Notion Meeting Calon BA 9 Nov', 'belum_reimburse'),
  ('11111111-1111-1111-1111-111111111111', 'expense', '2026-11-09', 'Trial print label — Meeting Calon BA', 'Produksi/print test', 20000, null, 'Notion Meeting Calon BA 9 Nov', 'belum_reimburse')
) as v(brand_id, kind, txn_date, description, category, amount, payment_method, notes, payment_status)
where not exists (select 1 from public.transactions t where t.brand_id = v.brand_id::uuid and t.kind = v.kind::txn_kind and t.txn_date = v.txn_date::date and t.description = v.description and t.amount = v.amount);

-- ---------- Aset investasi (total Rp16.161.043) ----------
insert into public.assets (brand_id, name, category, qty, unit_price, total_price, purchased_at, condition, notes)
select v.brand_id::uuid, v.name, v.category, v.qty, v.unit_price, v.total_price, v.purchased_at::date, v.condition, v.notes
from (values
  ('11111111-1111-1111-1111-111111111111', 'Bambulab P2S Combo', 'Printer 3D', 1, 10000555, 10000555, '2026-11-16', 'Baru', 'Nota 3DZ/AKE/103/02620, 3D Zaiku — Rp10.000.555 dari modal/investasi; Rp5.380.000 sisanya pinjaman Febri'),
  ('11111111-1111-1111-1111-111111111111', 'eSUN PETG Basic Filament White x8', 'Filamen / Investasi', 8, 123000, 892528, '2026-11-16', 'Baru', 'Shopee 3D Zaiku, order 261025HQQSKYOP — total Rp892.528 via SPayLater; hutang SPayLater dibayar INVESTOR, bukan perusahaan'),
  ('11111111-1111-1111-1111-111111111111', 'Bambulab A1 High Speed 3D Printer', 'Printer 3D', 1, 5267960, 5267960, '2026-11-15', 'Baru', 'Shopee 3D Zaiku — sudah dibeli, barangnya ada')
) as v(brand_id, name, category, qty, unit_price, total_price, purchased_at, condition, notes)
where not exists (select 1 from public.assets a where a.brand_id = v.brand_id::uuid and a.name = v.name and a.purchased_at = v.purchased_at::date and a.total_price = v.total_price);

-- ---------- Hutang (hanya hutang perusahaan; PETG TIDAK masuk sini) ----------
insert into public.liabilities (brand_id, creditor, amount, remaining_amount, due_date, monthly_installment, months, paid_by, status, notes)
select v.brand_id::uuid, v.creditor, v.amount, v.remaining_amount, v.due_date::date, v.monthly_installment, v.months, v.paid_by::paid_by, v.status, v.notes
from (values
  ('11111111-1111-1111-1111-111111111111', 'Febri', 5380000, 5380000, '2027-11-16', 448333, 12, 'company', 'aktif',
   'Pinjaman dari Pak Febri untuk Bambulab P2S Combo — BUKAN investasi/modal saham, terpisah dari penyertaan modal Febri; amortisasi 12 bln; transfer Rp5.380.000 ke Joy Abigail 17/11')
) as v(brand_id, creditor, amount, remaining_amount, due_date, monthly_installment, months, paid_by, status, notes)
where not exists (select 1 from public.liabilities l where l.brand_id = v.brand_id::uuid and l.creditor = v.creditor and l.amount = v.amount and l.due_date = v.due_date::date);

-- ---------- Lemuel: Manager Marketing (gaji BELUM diisi — 0, jangan ditebak) ----------
-- BUKAN OPEX (Mattin, 24 Nov 2026): is_management=true → gajinya dibayar
-- dari Management Fee, bukan OPEX. is_fixed_cost=false sekalian.
insert into public.employees (id, brand_id, name, role, team, monthly_salary, is_fixed_cost, is_management, is_active) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Lemuel', 'Manager Marketing', 'Marketing', 0, false, true, true)
on conflict (id) do nothing;

-- ---------- Penyertaan modal (Febri: jumlah BELUM dicatat, jangan ditebak) ----------
insert into public.capital_contributions (brand_id, contributor, role, amount, contributed_at, status, notes)
select v.brand_id::uuid, v.contributor, v.role, v.amount, v.contributed_at, v.status, v.notes
from (values
  ('11111111-1111-1111-1111-111111111111', 'Febri', 'pemodal', null::numeric(18,2), null::date, 'belum_dicatat', 'Jumlah modal Febri belum tercatat di mana pun — isi sesuai kesepakatan'),
  ('11111111-1111-1111-1111-111111111111', 'Matias Austin', 'eksekutor', 0::numeric(18,2), null::date, 'aktif', 'Sweat equity (non-tunai) — dividen 30%')
) as v(brand_id, contributor, role, amount, contributed_at, status, notes)
where not exists (
  select 1 from public.capital_contributions cc
  where cc.brand_id = v.brand_id::uuid and cc.contributor = v.contributor and cc.role = v.role
);

-- ---------- Pajak (belum dihitung — 0) ----------
insert into public.taxes (brand_id, type, period, amount, status, notes)
select '11111111-1111-1111-1111-111111111111', 'PPN', '2026-11', 0, 'belum_dihitung', 'Tarif PPN 11% — isi jumlah yang dibayar per periode'
where not exists (
  select 1 from public.taxes tx
  where tx.brand_id = '11111111-1111-1111-1111-111111111111' and tx.type = 'PPN' and tx.period = '2026-11'
);

-- ---------- Profil login (roles) ----------
-- CARA PAKAI: buat dulu akunnya di Supabase Dashboard → Authentication →
-- Add user dengan email di bawah (atau email asli — lalu ganti email di
-- blok ini), dengan kata sandi masing-masing. TIDAK ada kata sandi di seed.
-- Baris profil baru muncul bila user Auth-nya sudah ada (join by email);
-- bila belum ada, blok ini tidak melakukan apa-apa (aman di-run ulang).
-- Nama komisaris sengaja placeholder (nama asli belum ada di data).
-- Domain login @vektora.id (Mattin, 24 Nov 2026) — username login diubah
-- jadi email teknis ini di aplikasi; email ini tidak perlu dibuka/dipunya.
-- Matias memakai email Gmail yang sudah dikenal: tiasaustin32@gmail.com.
-- Avrina = Finance (role management: operasional penuh, tidak ubah fee-split).
-- Lemuel = Manager Marketing (role app management; gaji dari Management
-- Fee, BUKAN OPEX).
-- Rohimat: role app BELUM ditentukan Mattin — sementara karyawan (akses
-- paling kecil); naikkan ke management bila dia memang operasional.
insert into public.profiles (id, email, full_name, role, brand_ids, employee_id, active)
select u.id, u.email, p.full_name, p.role::app_role, p.brand_ids, p.employee_id, true
from auth.users u
join (values
  ('tiasaustin32@gmail.com', 'Matias Austin', 'admin', null::uuid[], null::uuid),
  ('januar@vektora.id', 'Januar Amin', 'management', null::uuid[], null::uuid),
  ('febri@vektora.id', 'Febri', 'investor', null::uuid[], null::uuid),
  ('komisaris-utama@vektora.id', 'Komisaris Utama', 'komisaris', null::uuid[], null::uuid),
  ('komisaris-2@vektora.id', 'Komisaris 2', 'komisaris', null::uuid[], null::uuid),
  ('avrina@vektora.id', 'Avrina', 'management', null::uuid[], null::uuid),
  ('rohimat@vektora.id', 'Rohimat', 'karyawan', null::uuid[], null::uuid),
  ('lemuel@vektora.id', 'Lemuel', 'management', ARRAY['11111111-1111-1111-1111-111111111111'::uuid], '33333333-3333-3333-3333-333333333333'::uuid)
) as p(email, full_name, role, brand_ids, employee_id) on u.email = p.email
on conflict (id) do nothing;

-- Koreksi role Lemuel untuk baris yang SUDAH ada (insert di atas pakai
-- ON CONFLICT DO NOTHING, jadi tanpa UPDATE ini role lama tidak berubah
-- saat file di-run ulang). Aman di-run ulang.
update public.employees
set role = 'Manager Marketing', team = 'Marketing',
    is_fixed_cost = false, is_management = true
where id = '33333333-3333-3333-3333-333333333333';
update public.profiles
set role = 'management'
where email = 'lemuel@vektora.id' and role <> 'management';

-- Alternatif manual (bila email Auth berbeda dari atas): buat user di Auth,
-- salin UUID-nya, lalu jalankan:
-- insert into public.profiles (id, email, full_name, role, active)
-- values ('<AUTH_USER_ID>', 'email@asli.id', 'Nama', 'admin', true);

-- ---------- Fee split WhereIsIt (20 / 55 / 25) ----------
-- Penerima Management Fee IKUT SHEET "Struktur Pembagian" (dibaca 24 Nov
-- 2026) — 8 penerima, total 100% fee pool:
--   Direktur Utama (Matias) 25%, Direktur Operasional (Januar) 20%,
--   Komisaris Utama 7%, Komisaris 2 7%, Keuangan 10.25%, Pemasaran 10.25%,
--   Operasional 10.25%, Administrasi 10.25%.
-- Keuangan / Pemasaran / Operasional / Administrasi adalah POSISI —
-- employee_id sengaja NULL di seed (orangnya diisi nanti lewat editor
-- penerima di /fee-split, dropdown Orang; jangan hardcode di seed).
-- Placeholder lama "Manajemen & operasional (sisa, belum dirinci) 86%"
-- SUDAH DIHAPUS — jangan dipakai lagi di mana pun.
insert into public.fee_splits (brand_id, dividend_pct, management_fee_pct, retained_pct, dividend_recipients, management_fee_recipients, effective_from)
select '11111111-1111-1111-1111-111111111111', 20, 55, 25,
   '[{"name":"Febri (pemodal)","pct_of_dividend":70},{"name":"Matias Austin (eksekutor)","pct_of_dividend":30}]'::jsonb,
   '[{"name":"Direktur Utama (Matias)","pct_of_fee":25},{"name":"Direktur Operasional (Januar)","pct_of_fee":20},{"name":"Komisaris Utama","pct_of_fee":7},{"name":"Komisaris 2","pct_of_fee":7},{"name":"Keuangan","pct_of_fee":10.25},{"name":"Pemasaran","pct_of_fee":10.25},{"name":"Operasional","pct_of_fee":10.25},{"name":"Administrasi","pct_of_fee":10.25}]'::jsonb,
   '2026-11-16'
where not exists (select 1 from public.fee_splits f where f.brand_id = '11111111-1111-1111-1111-111111111111' and f.effective_from = '2026-11-16');

-- Koreksi untuk baris yang SUDAH ada di database (insert di atas pakai
-- NOT EXISTS, jadi tidak mengubah baris lama yang masih berisi
-- placeholder 86%). UPDATE ini mengganti penerimanya ke 8 penerima
-- sheet. Aman di-run ulang.
update public.fee_splits
set management_fee_recipients = '[{"name":"Direktur Utama (Matias)","pct_of_fee":25},{"name":"Direktur Operasional (Januar)","pct_of_fee":20},{"name":"Komisaris Utama","pct_of_fee":7},{"name":"Komisaris 2","pct_of_fee":7},{"name":"Keuangan","pct_of_fee":10.25},{"name":"Pemasaran","pct_of_fee":10.25},{"name":"Operasional","pct_of_fee":10.25},{"name":"Administrasi","pct_of_fee":10.25}]'::jsonb
where brand_id = '11111111-1111-1111-1111-111111111111' and effective_from = '2026-11-16'
  and management_fee_recipients::text like '%belum dirinci%';

-- Moonimo: fee split default sama (20/55/25), penerima kosong — isi saat launch.
insert into public.fee_splits (brand_id, dividend_pct, management_fee_pct, retained_pct, dividend_recipients, management_fee_recipients, effective_from)
select '22222222-2222-2222-2222-222222222222', 20, 55, 25, '[]'::jsonb, '[]'::jsonb, null
where not exists (select 1 from public.fee_splits f where f.brand_id = '22222222-2222-2222-2222-222222222222' and f.effective_from is null);

-- ============================================================
-- §4. SEED-LATEST (dari seed-latest-2026-11-24.sql)
-- Data keuangan TERBARU WhereIsIt (dicek 24 Nov 2026, 01:37 WIB).
-- Sumber: (A) Sheet "Income & Expend 2026", tab November;
-- (B) File "Daftar Preorder WhereIsIt KEYCHAIN" (Drive,
-- terakhir diubah 23 Nov 2026 22:22 WIB).
--
-- APA YANG BERUBAH SEJAK §3:
--   1. Income sheet: 7 order Rp1.470.000 -> 8 order Rp1.620.000
--      (tambah "Afr" Rp150.000, 12 Nov, ref 2611110W06V5PAA).
--   2. PO list: 25 order, SEMUA Lunas, total DP Rp4.189.000
--      (27 pcs). 17 order di antaranya BELUM ada di sheet/seed:
--      Rp2.559.000 (lihat bagian 3 di bawah).
--   3. Pengeluaran sheet: tambah Cutter Rp25.000 + ongkir JNT
--      Rp35.000 (keduanya 18 Nov, Status Bayar di sheet masih KOSONG).
--   4. Status Bayar di sheet BERUBAH untuk 3 baris lama, yang
--      tadinya Sudah dibayar sekarang Belum reimburse: Spon
--      Rp12.000, Acrylic Marker Rp43.123, Filamen Elegoo
--      Rp112.600. Total Belum reimburse sheet Rp605.423.
--
-- PERBAIKAN SLUG (24 Nov 2026): join channel di bagian 3 memakai
-- lower(d.channel_slug) — Postgres membandingkan teks case-sensitive,
-- dan slug di tabel channels huruf kecil ('shopee'/'threads'/
-- 'clicky'), sedangkan nilai lama sempat kapital ('Shopee'/
-- 'Threads'/'Clicky') sehingga 17 income PO diam-diam tidak masuk.
-- ============================================================

-- ================= 1. Channel baru (PO pakai channel baru) =================
-- PO memakai Threads dan Clicky, yang belum ada di channels seed
-- (§3 hanya Direct TF, Shopee, Official Website). WhatsApp juga
-- ditambahkan karena Salsabila/Alfian order via WhatsApp.
insert into public.channels (brand_id, name, slug)
select '11111111-1111-1111-1111-111111111111', c.name, c.slug
from (values ('Threads', 'threads'), ('Clicky', 'clicky'), ('WhatsApp', 'whatsapp')) as c(name, slug)
where not exists (
  select 1 from public.channels ch
  where ch.brand_id = '11111111-1111-1111-1111-111111111111' and ch.slug = c.slug
);

-- ================= 2. Produk & pelanggan baru =================
insert into public.products (brand_id, name, sku, price)
select '11111111-1111-1111-1111-111111111111', 'Strava Keychain', 'STR-KEY-10X5', 150000
where not exists (
  select 1 from public.products p
  where p.brand_id = '11111111-1111-1111-1111-111111111111' and p.name = 'Strava Keychain'
);

insert into public.customers (brand_id, name)
select '11111111-1111-1111-1111-111111111111', c.name
from (values
  ('Aulia (AFR)'), ('Mario Sastra'), ('Joseph Herlambang'), ('Alif Athallah'),
  ('Endy Hardjono'), ('Davit F.'), ('Dic'), ('Iday'), ('Manul'),
  ('Sofia Pramudhian'), ('Angga Prihatmoko'), ('Dedy Prasetya Puspo Aji'),
  ('Hakim'), ('Ginandjar Halim'), ('TAR YYJOE'), ('Abiza'),
  ('Almer Panji P'), ('Aries (Batman JKT)')
) as c(name)
where not exists (
  select 1 from public.customers cu
  where cu.brand_id = '11111111-1111-1111-1111-111111111111' and cu.name = c.name
);

-- ================= 3. Income baru dari PO + sheet =================
-- 3a. "Afr" Rp150.000 (sheet, 12 Nov, ref 2611110W06V5PAA).
--     DISCREPANCY: PO mencatat Aulia (AFR) Rp160.000 via Shopee.
--     Selisih Rp10.000 — jangan insert baris kedua sebelum diklarifikasi.
insert into public.transactions (brand_id, channel_id, kind, txn_date, description, category, amount, payment_method, ref, notes, payment_status)
select '11111111-1111-1111-1111-111111111111', c.id, 'income', '2026-11-12'::date,
  'Penjualan Strava Keychain — Afr (Aulia)', 'Penjualan Keychain', 150000, 'Shopee',
  '2611110W06V5PAA',
  'Lunas — sheet Income & Expend Nov 2026. PERHATIAN: PO mencatat Aulia (AFR) Rp160.000 via Shopee, selisih Rp10.000 dari sheet — klarifikasi dulu, jangan duplikat.',
  'sudah_dibayar'
from public.channels c
where c.brand_id = '11111111-1111-1111-1111-111111111111' and c.slug = 'shopee'
  and not exists (
    select 1 from public.transactions t where t.ref = '2611110W06V5PAA'
  );

-- 3b. 17 order PO yang belum ada di sheet/seed — total Rp2.559.000.
--     Semua Lunas. Channel & tanggal sesuai PO. Metode bayar yang
--     tidak tercatat di PO dibiarkan NULL (jangan ditebak).
insert into public.transactions (brand_id, channel_id, kind, txn_date, description, category, amount, payment_method, ref, notes, payment_status)
select '11111111-1111-1111-1111-111111111111', c.id, 'income', d.txn_date, d.description, 'Penjualan Keychain', d.amount, d.payment_method, d.ref, d.notes, 'sudah_dibayar'
from public.channels c,
  (values
    ('2026-11-10'::date, 'Penjualan Strava Keychain — Mario Sastra', 88000, 'shopee', null, 'Shopee', 'PO #3 — Keychain ONLY + Name Label 57mm. Bayar Rp88.000 include tax via Shopee. Tanpa invoice WhereIsIt.'),
    ('2026-11-17'::date, 'Penjualan Strava Keychain — Joseph Herlambang', 106000, 'shopee', null, 'Shopee', 'PO #11 — Keychain ONLY 10x5cm. Bayar Rp106.000 include tax via Shopee, dikirim 17 Nov. Tanpa invoice WhereIsIt.'),
    ('2026-11-18'::date, 'Penjualan Strava Keychain — Alif Athallah', 170000, 'threads', 'INV/WII/2026/11/008', 'Transfer', 'PO #10 — Emoney 10x5cm, order via Threads @alifathallahq. Lunas via BCA 18 Nov. Deal awal 180k incl. ongkir, deal jadi 170k.'),
    ('2026-11-18'::date, 'Penjualan Strava Keychain — Endy Hardjono', 180000, 'clicky', null, null, 'PO #12 — Lunas, status Konfirmasi Desain. Metode bayar tidak tercatat di PO.'),
    ('2026-11-18'::date, 'Penjualan Strava Keychain — Davit F.', 180000, 'clicky', null, null, 'PO #13 — Lunas, status Konfirmasi Desain. Metode bayar tidak tercatat di PO.'),
    ('2026-11-18'::date, 'Penjualan Strava Keychain — Dic', 180000, 'clicky', null, null, 'PO #14 — Lunas, status Konfirmasi Desain. Metode bayar tidak tercatat di PO.'),
    ('2026-11-19'::date, 'Penjualan Strava Keychain — Iday', 180000, 'clicky', null, null, 'PO #15 — Lunas, status Konfirmasi Desain. Metode bayar tidak tercatat di PO.'),
    ('2026-11-19'::date, 'Penjualan Strava Keychain — Manul', 180000, 'clicky', null, null, 'PO #16 — Lunas, status Produksi. Metode bayar tidak tercatat di PO.'),
    ('2026-11-19'::date, 'Penjualan Strava Keychain — Sofia Pramudhian', 180000, 'clicky', null, null, 'PO #17 — Lunas, status Produksi. Metode bayar tidak tercatat di PO.'),
    ('2026-11-19'::date, 'Penjualan Strava Keychain — Angga Prihatmoko', 119000, 'clicky', null, null, 'PO #18 — Lunas, status Produksi. Metode bayar tidak tercatat di PO.'),
    ('2026-11-20'::date, 'Penjualan Strava Keychain — Dedy Prasetya Puspo Aji', 119000, 'clicky', null, null, 'PO #19 — Lunas, status Produksi. Metode bayar tidak tercatat di PO.'),
    ('2026-11-20'::date, 'Penjualan Strava Keychain — Hakim', 119000, 'clicky', null, null, 'PO #20 — Lunas, status Konfirmasi Desain. Metode bayar tidak tercatat di PO.'),
    ('2026-11-20'::date, 'Penjualan Strava Keychain — Ginandjar Halim', 119000, 'clicky', null, null, 'PO #21 — Lunas, status Produksi. Metode bayar tidak tercatat di PO.'),
    ('2026-11-20'::date, 'Penjualan Strava Keychain — TAR YYJOE', 119000, 'clicky', null, null, 'PO #22 — Lunas, status Produksi. Metode bayar tidak tercatat di PO.'),
    ('2026-11-20'::date, 'Penjualan Strava Keychain — Abiza', 220000, 'clicky', null, null, 'PO #23 — Lunas, status Konfirmasi Desain. Metode bayar tidak tercatat di PO.'),
    ('2026-11-20'::date, 'Penjualan Strava Keychain — Almer Panji P', 150000, 'clicky', null, null, 'PO #24 — Lunas, status Produksi. Metode bayar tidak tercatat di PO.'),
    ('2026-11-20'::date, 'Penjualan Strava Keychain — Aries (Batman JKT)', 150000, 'clicky', null, null, 'PO #25 — Lunas, status Konfirmasi Desain. Metode bayar tidak tercatat di PO.')
  ) as d(txn_date, description, amount, channel_slug, ref, payment_method, notes)
where c.brand_id = '11111111-1111-1111-1111-111111111111' and c.slug = lower(d.channel_slug)
  and not exists (
    select 1 from public.transactions t
    where t.kind = 'income'
      and t.txn_date = d.txn_date
      and t.description = d.description
      and t.amount = d.amount
  );

-- ================= 4. Pengeluaran baru dari sheet (18 Nov) =================
-- Status Bayar di sheet masih KOSONG untuk keduanya. Di-insert sebagai
-- Sudah dibayar supaya total cocok dengan rumus sheet (kosong ikut
-- terhitung). Bila ternyata uang Januar / belum reimburse, ubah di app.
insert into public.transactions (brand_id, kind, txn_date, description, category, amount, payment_method, ref, notes, payment_status)
select '11111111-1111-1111-1111-111111111111', 'expense', d.txn_date, d.description, d.category, d.amount, d.payment_method, null, d.notes, 'sudah_dibayar'
from (values
  ('2026-11-18'::date, 'Cutter', 'Produksi', 25000, 'Tunai', 'Sheet November 18/11 — Status Bayar di sheet masih kosong, di-insert sebagai Sudah dibayar; ubah ke Belum reimburse bila uang Januar.'),
  ('2026-11-18'::date, 'Biaya pengiriman JNT', 'Operasional', 35000, 'Transfer', 'Sheet November 18/11 (ongkir 3 product, WA PURCHASING Januar 18:15) — Status Bayar di sheet masih kosong, di-insert sebagai Sudah dibayar; ubah ke Belum reimburse bila uang Januar.')
) as d(txn_date, description, category, amount, payment_method, notes)
where not exists (
  select 1 from public.transactions t
  where t.kind = 'expense'
    and t.txn_date = d.txn_date
    and t.description = d.description
    and t.amount = d.amount
);

-- ================= 5. Koreksi Status Bayar 3 baris lama =================
-- Di sheet 24 Nov, ketiganya berubah dari Sudah dibayar menjadi
-- Belum reimburse. Total Belum reimburse jadi Rp605.423
-- (437.700 Meeting BA + 12.000 + 43.123 + 112.600).
update public.transactions
set payment_status = 'belum_reimburse', reimbursed_at = null
where kind = 'expense'
  and description in ('Spon', 'Acrylic Marker', 'Filamen Elegoo')
  and payment_status = 'sudah_dibayar';

-- ============================================================
-- §5. MIGRASI (dari migration-dividend-payouts.sql)
-- Isi bagian ini SUDAH tercermin di §1 (tabel dibuat dengan kolom
-- baru, view sudah anti double count, RLS sudah ada). Pernyataan
-- di bawah ini dipertahankan supaya file ini tetap merekam migrasi
-- tersebut secara eksplisit dan tetap aman bila §1 dilewati —
-- semuanya idempotent (IF NOT EXISTS / DROP IF EXISTS), jadi
-- di sini semuanya no-op bila §1 sudah jalan.
--
-- ATURAN ANTI DOUBLE COUNT (Mattin, 24 Nov 2026):
--   Aset yang dibeli lewat hutang (mis. printer P2S) SUDAH tercatat
--   sebagai aset. Cicilan yang dibayar HANYA mengurangi hutang —
--   cicilan itu BUKAN pengeluaran operasional: tidak masuk total
--   pengeluaran, tidak mengurangi laba, tidak menambah total nilai
--   aset. Cicilan = pergerakan neraca (kas berkurang, hutang
--   berkurang), bukan beban. Progres kepemilikan aset terkait
--   ("milik perusahaan RpX dari RpY") hanya info, BUKAN tambahan
--   angka aset.
-- ============================================================

-- ---------- A. Dividen tahunan ----------
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
-- Kolom terkirim (24 Nov 2026 — slip dividen): bila tabel sudah dibuat
-- dari versi migrasi sebelumnya, tambahkan kolomnya di sini.
alter table public.dividend_payouts
  add column if not exists sent_at timestamptz,
  add column if not exists sent_via text check (sent_via in ('whatsapp', 'email', 'langsung'));

alter table public.dividend_payouts enable row level security;
drop policy if exists "read operations" on public.dividend_payouts;
create policy "read operations" on public.dividend_payouts for select using (public.current_user_role() in ('admin', 'management', 'komisaris', 'investor'));
drop policy if exists "write admin management" on public.dividend_payouts;
create policy "write admin management" on public.dividend_payouts for all using (public.current_user_role() in ('admin', 'management'));

-- ---------- A2. Hapus karyawan: slip lama harus tetap bisa tampil ----------
-- Dulu: payslips.employee_id NOT NULL + ON DELETE CASCADE — menghapus
-- karyawan ikut MENGHAPUS semua slip gajinya. Sekarang: employee_id boleh
-- null + ON DELETE SET NULL, dan nama di-snapshot ke employee_name saat
-- slip dibuat (diisi juga untuk slip yang sudah ada, dari employees).
alter table public.payslips
  add column if not exists employee_name text;
update public.payslips p
  set employee_name = e.name
  from public.employees e
  where p.employee_id = e.id and p.employee_name is null;
alter table public.payslips alter column employee_id drop not null;
alter table public.payslips drop constraint if exists payslips_employee_id_fkey;
alter table public.payslips
  add constraint payslips_employee_id_fkey
  foreign key (employee_id) references public.employees(id) on delete set null;

-- ---------- B. Hutang -> aset terkait ----------
alter table public.liabilities
  add column if not exists asset_id uuid references public.assets(id) on delete set null;
create index if not exists idx_liab_asset on public.liabilities (asset_id);

-- ---------- C. Transaksi -> hutang yang dibayar ----------
alter table public.transactions
  add column if not exists liability_id uuid references public.liabilities(id) on delete set null;
create index if not exists idx_txn_liability on public.transactions (liability_id);

-- ---------- D. View ditulis ulang (kecualikan pembayaran hutang) ----------
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

create or replace view public.v_investor_summary as
select
  b.id as brand_id,
  coalesce((select sum(amount) from public.capital_contributions c where c.brand_id = b.id and c.status = 'aktif'), 0) as capital_total,
  coalesce((select sum(total_price) from public.assets a where a.brand_id = b.id), 0) as assets_total,
  coalesce((select sum(remaining_amount) from public.liabilities l where l.brand_id = b.id and l.paid_by = 'company'), 0) as company_debt,
  coalesce((select sum(amount) from public.transactions t where t.brand_id = b.id and t.kind = 'income'), 0) as income_total,
  coalesce((select sum(amount) from public.transactions t where t.brand_id = b.id and t.kind = 'expense' and t.payment_status = 'sudah_dibayar' and t.liability_id is null), 0) as expense_counted_total
from public.brands b;

-- ============================================================
-- §6. SEED-WA TERKOREKSI (dari seed-wa-2026-11-24.sql)
-- Transaksi WhereIsIt dari WA FINANCE + PURCHASING, 18-23 Nov 2026.
-- Sumber: WA Community PT Vektora, grup FINANCE + PURCHASING,
-- pesan baru setelah 18 Nov 2026 18:20 WIB s/d 23 Nov 2026.
-- Sheet "Income & Expend 2026", tab November — baris-baris ini
-- SUDAH masuk ke sheet (pengeluaran 45-53, income 14, lalu
-- income 15-16 DIHAPUS karena double — lihat 6a di bawah).
--
-- KEPUTUSAN (Mattin, 24 Nov 2026 02:29 WIB):
--   - Emoney Rp280.000 = PEMBELIAN BARU (batch 2, PO-WII-2026-11-001),
--     bukan 7 kartu 15-16 Nov yang sudah ada di sheet (refund Livin).
--   - Art Carton Rp121.691 = PEMBELIAN BARU, satu pembayaran
--     (QRIS + bukti bayar + transfer bluGether adalah satu transaksi).
--   - Uang bluBisnis dipindah ke bluGether supaya semua bisa mantau —
--     transfer antar rekening sendiri BUKAN pengeluaran, tidak di-insert.
--
-- ATURAN DOUBLE — WITHDRAW BUKAN INCOME (Mattin, 24 Nov 2026
-- 02:40-02:41): uang yang ditarik (withdraw) dari Clicky/Shopee/
-- Mayar BUKAN penghasilan baru — penjualannya SUDAH tercatat
-- sebagai income di PO list (§4). Mencatat withdraw sebagai income
-- = double count. Karena itu dua baris ini TIDAK di-insert di sini
-- dan DIHAPUS dari database bila sudah terlanjur masuk (6a):
--   - "Dana masuk NUSA Satu Inti Artha (withdraw, revenue 540.000)"
--     Rp535.000, 2026-11-19 — withdraw Clicky; penjualannya sudah
--     tercatat di PO list (§4, 17 order Clicky/Shopee).
--   - "Penarikan Shopee" Rp355.772, 2026-11-21 — withdraw Shopee;
--     penjualannya sudah tercatat di PO list + sheet.
--   Fee penarikannya TETAP expense (nyata terpotong): admin withdraw
--   Rp5.000 dan potongan Shopee Rp3.000 (lihat 6d).
--
-- YANG SENGAJA TIDAK DI-INSERT (jangan ditebak):
--   - Dana masuk Mayar Rp212.387 (19 Nov): uang PRIBADI Mattin yang
--     nyangkut di bluBisnis — BUKAN uang PT, jangan masuk pembukuan
--     (Mattin 24 Nov 2026 02:54). Dihapus dari sheet + file ini;
--     kalau sudah terlanjur masuk DB, DELETE di 6a mengeluarkannya.
--   - Transfer antar rekening sendiri (bluBisnis -> bluGether
--     Rp640.069, bluBisnis -> bluAccount Rp212.000, bluGether ->
--     Matias Rp121.691 rembes, Matias -> Januar Rp280.000):
--     pergerakan internal, bukan income/expense.
--   - Invoice INV/WII/2026/11/009 ke Klinik Pupuk Kujang Rp943.500
--     (50 pcs Stand Holder Klinik @17.000 + PPN 11%, terbit 23 Nov,
--     jatuh tempo 23 Des 2026): BELUM LUNAS dan BELUM DIKIRIM ke
--     customer — piutang, bukan income. Biasanya cair ~3 bulan
--     setelah dikirim. Masukkan sebagai income SETELAH dibayar.
--   - Rp5.000 "dana ngendap di Januar" (Shopee withdrawal 21 Nov):
--     masih di Januar, pending — bukan expense.
--   - Selisih Rp1.772 pada penarikan Shopee (net 352.772 setelah fee
--     3.000, diterima via blu 346.000 + 5.000 ngendap = 351.000):
--     belum terjelaskan — jangan ditebak.
-- ============================================================

-- ================= 6a. CLEANUP: hapus 3 baris yang sudah terlanjur masuk =================
-- Mattin sudah sempat menjalankan seed-wa lama, jadi baris-baris ini
-- SUDAH ada di DB live. DELETE di sini persis (kind + tanggal +
-- deskripsi + jumlah) — JANGAN hapus baris lain. Berjalan SEBELUM
-- insert di bawah supaya tidak bentrok. Bila barisnya tidak ada
-- (belum pernah masuk), DELETE ini tidak menghapus apa-apa.
delete from public.transactions
where kind = 'income'
  and txn_date = '2026-11-19'::date
  and description = 'Dana masuk NUSA Satu Inti Artha (withdraw, revenue 540.000)'
  and amount = 535000;

delete from public.transactions
where kind = 'income'
  and txn_date = '2026-11-21'::date
  and description = 'Penarikan Shopee'
  and amount = 355772;

-- Dana pribadi Mattin (bukan uang PT) — lihat catatan di atas.
delete from public.transactions
where kind = 'income'
  and txn_date = '2026-11-19'::date
  and description = 'Dana masuk Mayar'
  and amount = 212387;

-- ================= 6b. Channel baru: Mayar =================
insert into public.channels (brand_id, name, slug)
select '11111111-1111-1111-1111-111111111111', c.name, c.slug
from (values ('Mayar', 'mayar')) as c(name, slug)
where not exists (
  select 1 from public.channels ch
  where ch.brand_id = '11111111-1111-1111-1111-111111111111' and ch.slug = c.slug
);

-- ================= 6c. Income baru — TIDAK ADA =================
-- Dulu di sini ada satu income "Dana masuk Mayar" Rp212.387 — DIHAPUS
-- 24 Nov 2026 02:54: itu uang PRIBADI Mattin yang nyangkut di bluBisnis,
-- bukan uang PT (Mattin). Jangan masukkan lagi sebagai income.
-- Channel 'mayar' di 6b tetap dibuat (Mayar adalah payment channel
-- yang sah dipakai PT nanti) — yang dihapus hanya baris income ini.

-- ================= 6d. Pengeluaran baru (9 baris, Rp962.856) =================
insert into public.transactions (brand_id, kind, txn_date, description, category, amount, payment_method, ref, notes, payment_status)
select '11111111-1111-1111-1111-111111111111', 'expense', d.txn_date, d.description, d.category, d.amount, d.payment_method, null, d.notes, 'sudah_dibayar'
from (values
  ('2026-11-18'::date, 'Top-up DANA (pengiriman Alif)', 'Operasional', 11000, 'DANA', 'WA PURCHASING 18/11 20:19 — blu Top Up E-Wallet Rp11.000 ke DANA.'),
  ('2026-11-18'::date, 'PLN Prabayar (token, LILY NO 5)', 'Operasional', 103000, null, 'WA PURCHASING 18/11 23:42 — PLN Prabayar token.'),
  ('2026-11-21'::date, 'Filamen Elegoo PLA Orange + Neon Green (net, lebihan 4.000 balik 22 Nov)', 'Bahan Baku', 265200, 'Shopee', 'WA PURCHASING 21/11 — order Shopee Rp269.200; 22/11 ganti alamat total jadi Rp265.200, lebihan Rp4.000 balik. Net Rp265.200, jangan hitung 269.200.'),
  ('2026-11-21'::date, 'ART Carton 260gsm', 'Bahan Baku', 40900, 'Shopee', 'WA PURCHASING 21/11 20:26 — blu transfer + order Shopee Rp40.900, satu pembelian.'),
  ('2026-11-23'::date, 'Art Carton A4 260gsm', 'Bahan Baku', 121691, 'QRIS', 'WA PURCHASING 23/11 17:07-17:11 — PEMBELIAN BARU (Mattin 24/11). QRIS ke Shopee Rp121.691; foto QRIS + bukti bayar + transfer bluGether->Matias adalah SATU pembayaran, jangan hitung 3x.'),
  ('2026-11-23'::date, 'Kartu E-money Indomaret 7 pcs (batch 2)', 'Bahan Baku', 280000, 'Transfer', 'WA PURCHASING 23/11 16:54-17:14 — PEMBELIAN BARU (Mattin 24/11), PO-WII-2026-11-001. Bukan 7 kartu 15-16 Nov yang sudah ada di sheet (refund Livin). Alur: bluGether -> Matias -> Januar.'),
  ('2026-11-23'::date, 'Filamen Elegoo PLA Black 1kg (urgent order)', 'Bahan Baku', 133065, 'Shopee', 'WA PURCHASING 23/11 23:45 — order Shopee urgent, Total Pesanan Rp133.065.'),
  ('2026-11-20'::date, 'Admin withdraw', 'Operasional', 5000, 'Transfer', 'WA FINANCE 20/11 12:40 — fee admin withdraw (Revenue 540.000 - Withdrawn 535.000).'),
  ('2026-11-21'::date, 'Potongan Shopee (fee penarikan)', 'Operasional', 3000, 'Shopee', 'WA FINANCE 21/11 20:07-20:08 — fee penarikan Shopee Rp355.772, dipotong Rp3.000.')
) as d(txn_date, description, category, amount, payment_method, notes)
where not exists (
  select 1 from public.transactions t
  where t.kind = 'expense'
    and t.txn_date = d.txn_date
    and t.description = d.description
    and t.amount = d.amount
);

commit;

-- ============================================================
-- VERIFIKASI (jalankan terpisah setelah file ini, di SQL Editor)
-- ============================================================
-- select * from public.v_brand_monthly_summary
--   where brand_id = '11111111-1111-1111-1111-111111111111' and month = '2026-11';
-- Harus: income 4179000, expense_counted 2165738,
--        belum_reimburse 605423, net 2013262.
--
-- select count(*) filter (where kind = 'income') as income_rows,
--        count(*) filter (where kind = 'expense') as expense_rows
--   from public.transactions
--   where brand_id = '11111111-1111-1111-1111-111111111111'
--     and txn_date >= '2026-11-01' and txn_date < '2026-12-01';
-- Harus: income_rows 25, expense_rows 48.
--
-- select count(*) as assets_rows, sum(total_price) as assets_total
--   from public.assets
--   where brand_id = '11111111-1111-1111-1111-111111111111';
-- Harus: assets_rows 3, assets_total 16161043.
--
-- select count(*) as liab_rows, sum(amount) as liab_total
--   from public.liabilities
--   where brand_id = '11111111-1111-1111-1111-111111111111';
-- Harus: liab_rows 1, liab_total 5380000.
--
-- select description, amount from public.transactions
--   where description in ('Dana masuk NUSA Satu Inti Artha (withdraw, revenue 540.000)', 'Penarikan Shopee', 'Dana masuk Mayar');
-- Harus: 0 baris (dua income double + dana pribadi sudah terhapus).
--
-- select * from public.v_investor_summary
--   where brand_id = '11111111-1111-1111-1111-111111111111';
-- Harus: income_total 4179000, expense_counted_total 2165738,
--        assets_total 16161043, company_debt 5380000.
