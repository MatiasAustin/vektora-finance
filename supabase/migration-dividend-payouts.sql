-- ============================================================
-- migration-dividend-payouts.sql — SATU-SATUNYA file yang harus
-- Mattin jalankan untuk update 24 Nov 2026 (di Supabase SQL Editor).
-- Jalankan SEKALI, di project Supabase yang sama dengan env Vercel.
-- Aman di-run ulang (semua pernyataan idempotent: IF NOT EXISTS /
-- DROP POLICY IF EXISTS / CREATE OR REPLACE VIEW).
--
-- ISI FILE INI:
--   A. Tabel baru dividend_payouts (dividen tahunan, cair 1x/tahun)
--      + RLS (baca: admin/management/komisaris/investor; tulis:
--      admin + management).
--   B. Kolom baru liabilities.asset_id (hutang -> aset terkait).
--   C. Kolom baru transactions.liability_id (pembayaran hutang
--      terlacak ke hutangnya).
--   D. View v_brand_monthly_summary + v_investor_summary ditulis
--      ulang: pembayaran hutang DIKECUALIKAN dari expense_counted
--      & net (anti double count — lihat catatan di bawah).
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
  notes text,
  created_at timestamptz not null default now(),
  constraint dividend_payout_unique unique (brand_id, year, recipient_name)
);
create index if not exists idx_divpayout_brand_year on public.dividend_payouts (brand_id, year);

alter table public.dividend_payouts enable row level security;
drop policy if exists "read operations" on public.dividend_payouts;
create policy "read operations" on public.dividend_payouts for select using (public.current_user_role() in ('admin', 'management', 'komisaris', 'investor'));
drop policy if exists "write admin management" on public.dividend_payouts;
create policy "write admin management" on public.dividend_payouts for all using (public.current_user_role() in ('admin', 'management'));

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

-- ---------- Verifikasi cepat (opsional) ----------
-- select * from public.dividend_payouts;              -- harus 0 baris (kosong, belum ada pencairan)
-- select column_name from information_schema.columns
--  where table_name in ('liabilities','transactions')
--  and column_name in ('asset_id','liability_id');   -- harus 2 baris
-- select * from public.v_brand_monthly_summary;      -- angka Nov 2026 harus
--   SAMA seperti sebelum migrasi (tidak ada transaksi liability_id dulu,
--   jadi income 4179000 / expense 1202882 / belum 605423 / net 2976118
--   setelah seed-latest; bila belum, angka seed awal 1470000 / 1310605 /
--   437700 / 159395).
