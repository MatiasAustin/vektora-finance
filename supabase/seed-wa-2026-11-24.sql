-- ============================================================
-- VEKTORA FINANCE — seed-wa-2026-11-24.sql
-- Transaksi WhereIsIt dari WA FINANCE + PURCHASING, 18-23 Nov 2026.
--
-- CARA PAKAI: jalankan di Supabase SQL Editor SETELAH schema.sql,
-- seed.sql, seed-latest-2026-11-24.sql, dan migration-dividend-payouts.sql.
-- Aman di-run ulang: semua INSERT dijaga NOT EXISTS.
--
-- SUMBER (dicek 24 Nov 2026, 02:25-02:30 WIB):
--   WA Community PT Vektora, grup FINANCE + PURCHASING, pesan baru
--   setelah 18 Nov 2026 18:20 WIB s/d 23 Nov 2026.
--   Sheet "Income & Expend 2026", tab November — 12 baris ini SUDAH
--   masuk ke sheet (baris pengeluaran 45-53, income 14-16).
--   File antrean: ~/workspace/whereisit-wa-scraper/queue/pending-2026-11-24.json
--
-- KEPUTUSAN (Mattin, 24 Nov 2026 02:29 WIB):
--   - Emoney Rp280.000 = PEMBELIAN BARU (batch 2, PO-WII-2026-11-001),
--     bukan 7 kartu 15-16 Nov yang sudah ada di sheet (refund Livin).
--   - Art Carton Rp121.691 = PEMBELIAN BARU, satu pembayaran
--     (QRIS + bukti bayar + transfer bluGether adalah satu transaksi).
--   - Uang bluBisnis dipindah ke bluGether supaya semua bisa mantau —
--     transfer antar rekening sendiri BUKAN pengeluaran, tidak di-insert.
--
-- REKONSILIASI SETELAH FILE INI DIJALANKAN (asumsi seed.sql +
-- seed-latest-2026-11-24.sql sudah dijalankan):
--   Income total Nov 2026      = Rp5.282.159  (4.179.000 + 1.103.159)
--   Pengeluaran terhitung       = Rp2.165.738  (1.202.882 + 962.856)
--   Belum reimburse            = Rp605.423    (tidak berubah)
--   Saldo                      = Rp3.116.421
--   (Cocok dengan sheet November setelah insert 24 Nov 02:29 WIB.)
--
-- YANG SENGAJA TIDAK DI-INSERT:
--   - Transfer antar rekening sendiri (bluBisnis -> bluGether
--     Rp640.069, bluBisnis -> bluAccount Rp212.000, bluGether ->
--     Matias Rp121.691 rembes, Matias -> Januar Rp280.000):
--     pergerakan internal, bukan income/expense.
--   - Invoice INV/WII/2026/11/009 ke Klinik Pupuk Kujang Rp943.500
--     (50 pcs Stand Holder Klinik @17.000 + PPN 11%, terbit 23 Nov,
--     jatuh tempo 23 Des 2026): BELUM LUNAS — piutang, bukan income.
--     Masukkan sebagai income SETELAH dibayar.
--   - Rp5.000 "dana ngendap di Januar" (Shopee withdrawal 21 Nov):
--     masih di Januar, pending — bukan expense. Dicatat di notes
--     baris Penarikan Shopee di bawah.
--   - Selisih Rp1.772 pada penarikan Shopee (net 352.772 setelah fee
--     3.000, diterima via blu 346.000 + 5.000 ngendap = 351.000):
--     belum terjelaskan — jangan ditebak.
-- ============================================================

begin;

-- Channel baru: Mayar (dana masuk Mayar + NUSA).
insert into public.channels (brand_id, name, slug)
select '11111111-1111-1111-1111-111111111111', c.name, c.slug
from (values ('Mayar', 'mayar')) as c(name, slug)
where not exists (
  select 1 from public.channels ch
  where ch.brand_id = '11111111-1111-1111-1111-111111111111' and ch.slug = c.slug
);

-- ================= 1. Income baru (3 baris, Rp1.103.159) =================
insert into public.transactions (brand_id, channel_id, kind, txn_date, description, category, amount, payment_method, ref, notes, payment_status)
select '11111111-1111-1111-1111-111111111111', c.id, 'income', d.txn_date, d.description, d.category, d.amount, d.payment_method, d.ref, d.notes, 'sudah_dibayar'
from public.channels c,
  (values
    ('2026-11-19'::date, 'Dana masuk Mayar', 'Penjualan Online', 212387, 'mayar', null, 'Transfer', 'WA FINANCE 19/11 17:40 — dana masuk Mayar di bluBisnis.'),
    ('2026-11-19'::date, 'Dana masuk NUSA Satu Inti Artha (withdraw, revenue 540.000)', 'Penjualan Online', 535000, 'mayar', null, 'Transfer', 'WA FINANCE 19/11 16:33 — Total Revenue 540.000, Withdrawn 535.000 (admin withdraw 5.000, lihat baris expense).'),
    ('2026-11-21'::date, 'Penarikan Shopee', 'Penjualan Online', 355772, 'shopee', null, 'Transfer', 'WA FINANCE 21/11 20:07 — fee penarikan Rp3.000 (baris expense terpisah); Rp5.000 masih di Januar (pending, bukan expense); selisih Rp1.772 belum terjelaskan (net 352.772 vs diterima 346.000 + 5.000 ngendap = 351.000).')
  ) as d(txn_date, description, category, amount, channel_slug, ref, payment_method, notes)
where c.brand_id = '11111111-1111-1111-1111-111111111111' and c.slug = lower(d.channel_slug)
  and not exists (
    select 1 from public.transactions t
    where t.kind = 'income'
      and t.txn_date = d.txn_date
      and t.description = d.description
      and t.amount = d.amount
  );

-- ================= 2. Pengeluaran baru (9 baris, Rp962.856) =================
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

-- ================= VERIFIKASI (jalankan terpisah setelah script) =================
-- select * from public.v_brand_monthly_summary
--   where brand_id = '11111111-1111-1111-1111-111111111111' and month = '2026-11';
-- Harus: income 5282159, expense_counted 2165738,
--        belum_reimburse 605423, net 3116421.
