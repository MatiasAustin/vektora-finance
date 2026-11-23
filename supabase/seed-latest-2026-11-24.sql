-- ============================================================
-- VEKTORA FINANCE — seed-latest-2026-11-24.sql
-- INJECT data keuangan TERBARU WhereIsIt ke Supabase.
--
-- CARA PAKAI: jalankan di Supabase SQL Editor SETELAH schema.sql
-- dan seed.sql (urutan: schema.sql -> seed.sql -> file ini).
-- Aman di-run ulang: semua INSERT dijaga NOT EXISTS, UPDATE hanya
-- mengubah baris yang statusnya masih lama.
--
-- SUMBER (dicek 24 Nov 2026, 01:37 WIB):
--   A. Sheet "Income & Expend 2026", tab November
--      (id 1tMGQffl3PZ4sXfNRovDLgwyFPLZBL5LrEllSTJz-SCg)
--   B. File "Daftar Preorder WhereIsIt KEYCHAIN" (Drive,
--      id 18FquBRGrLKTcFxzEqfVG6XgZnoaKpE6l,
--      terakhir diubah 23 Nov 2026 22:22 WIB)
--
-- APA YANG BERUBAH SEJAK seed.sql (18 Nov 2026):
--   1. Income sheet: 7 order Rp1.470.000 -> 8 order Rp1.620.000
--      (tambah "Afr" Rp150.000, 12 Nov, ref 2611110W06V5PAA).
--   2. PO list: 25 order, SEMUA Lunas, total DP Rp4.189.000
--      (27 pcs). 17 order di antaranya BELUM ada di sheet/seed:
--      Rp2.559.000 (lihat bagian 3).
--   3. Pengeluaran sheet: tambah Cutter Rp25.000 + ongkir JNT
--      Rp35.000 (keduanya 18 Nov, Status Bayar di sheet masih KOSONG).
--   4. Status Bayar di sheet BERUBAH untuk 3 baris lama, yang
--      tadinya Sudah dibayar sekarang Belum reimburse: Spon
--      Rp12.000, Acrylic Marker Rp43.123, Filamen Elegoo
--      Rp112.600. Total Belum reimburse sheet sekarang Rp605.423.
--
-- REKONSILIASI SETELAH FILE INI DIJALANKAN (cek pakai query di
-- bawah, harus cocok persis dengan sheet 24 Nov 2026):
--   Income total Nov 2026      = Rp4.179.000
--     (1.470.000 seed + 150.000 Afr + 2.559.000 PO baru)
--   Pengeluaran terhitung       = Rp1.202.882  (cocok sheet D2)
--   Belum reimburse            = Rp605.423    (cocok sheet D3)
--   Saldo                      = Rp2.976.118
--
-- YANG SENGAJA TIDAK DI-INSERT (jangan ditebak):
--   - "lemuel Rp23.600" (WA PURCHASING 18 Nov): tidak ada di sheet
--     maupun PO, tidak jelas untuk apa. Masih pending review.
--   - Aulia (AFR) di PO Rp160.000 vs "Afr" di sheet Rp150.000:
--     SELISIH Rp10.000. File ini memasukkan angka SHEET (Rp150.000,
--     ref 2611110W06V5PAA) dan menandainya di notes — jangan buat
--     baris Aulia kedua sebelum selisih ini diklarifikasi.
--   - Pembayaran Alif Rp180.000 di WA (18 Nov, tujuan "investasi"):
--     PO mencatat Alif LUNAS Rp170.000 via BCA 18 Nov, invoice
--     INV/WII/2026/11/008, deal awal 180k incl. ongkir lalu deal
--     jadi 170k. Yang di-insert Rp170.000 sesuai PO/invoice.
--   - Cutter + ongkir JNT dimasukkan sebagai Sudah dibayar supaya
--     total cocok dengan rumus sheet (di sheet, Status Bayar kosong
--     ikut terhitung). Bila ternyata itu uang Januar / belum
--     reimburse, ubah statusnya di app ke Belum reimburse.
-- ============================================================

begin;

-- ================= 1. Channel baru (PO pakai channel baru) =================
-- PO memakai Threads dan Clicky, yang belum ada di channels seed
-- (seed hanya Direct TF, Shopee, Official Website). WhatsApp juga
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
    ('2026-11-10'::date, 'Penjualan Strava Keychain — Mario Sastra', 88000, 'Shopee', null, 'Shopee', 'PO #3 — Keychain ONLY + Name Label 57mm. Bayar Rp88.000 include tax via Shopee. Tanpa invoice WhereIsIt.'),
    ('2026-11-17'::date, 'Penjualan Strava Keychain — Joseph Herlambang', 106000, 'Shopee', null, 'Shopee', 'PO #11 — Keychain ONLY 10x5cm. Bayar Rp106.000 include tax via Shopee, dikirim 17 Nov. Tanpa invoice WhereIsIt.'),
    ('2026-11-18'::date, 'Penjualan Strava Keychain — Alif Athallah', 170000, 'Threads', 'INV/WII/2026/11/008', 'Transfer', 'PO #10 — Emoney 10x5cm, order via Threads @alifathallahq. Lunas via BCA 18 Nov. Deal awal 180k incl. ongkir, deal jadi 170k.'),
    ('2026-11-18'::date, 'Penjualan Strava Keychain — Endy Hardjono', 180000, 'Clicky', null, null, 'PO #12 — Lunas, status Konfirmasi Desain. Metode bayar tidak tercatat di PO.'),
    ('2026-11-18'::date, 'Penjualan Strava Keychain — Davit F.', 180000, 'Clicky', null, null, 'PO #13 — Lunas, status Konfirmasi Desain. Metode bayar tidak tercatat di PO.'),
    ('2026-11-18'::date, 'Penjualan Strava Keychain — Dic', 180000, 'Clicky', null, null, 'PO #14 — Lunas, status Konfirmasi Desain. Metode bayar tidak tercatat di PO.'),
    ('2026-11-19'::date, 'Penjualan Strava Keychain — Iday', 180000, 'Clicky', null, null, 'PO #15 — Lunas, status Konfirmasi Desain. Metode bayar tidak tercatat di PO.'),
    ('2026-11-19'::date, 'Penjualan Strava Keychain — Manul', 180000, 'Clicky', null, null, 'PO #16 — Lunas, status Produksi. Metode bayar tidak tercatat di PO.'),
    ('2026-11-19'::date, 'Penjualan Strava Keychain — Sofia Pramudhian', 180000, 'Clicky', null, null, 'PO #17 — Lunas, status Produksi. Metode bayar tidak tercatat di PO.'),
    ('2026-11-19'::date, 'Penjualan Strava Keychain — Angga Prihatmoko', 119000, 'Clicky', null, null, 'PO #18 — Lunas, status Produksi. Metode bayar tidak tercatat di PO.'),
    ('2026-11-20'::date, 'Penjualan Strava Keychain — Dedy Prasetya Puspo Aji', 119000, 'Clicky', null, null, 'PO #19 — Lunas, status Produksi. Metode bayar tidak tercatat di PO.'),
    ('2026-11-20'::date, 'Penjualan Strava Keychain — Hakim', 119000, 'Clicky', null, null, 'PO #20 — Lunas, status Konfirmasi Desain. Metode bayar tidak tercatat di PO.'),
    ('2026-11-20'::date, 'Penjualan Strava Keychain — Ginandjar Halim', 119000, 'Clicky', null, null, 'PO #21 — Lunas, status Produksi. Metode bayar tidak tercatat di PO.'),
    ('2026-11-20'::date, 'Penjualan Strava Keychain — TAR YYJOE', 119000, 'Clicky', null, null, 'PO #22 — Lunas, status Produksi. Metode bayar tidak tercatat di PO.'),
    ('2026-11-20'::date, 'Penjualan Strava Keychain — Abiza', 220000, 'Clicky', null, null, 'PO #23 — Lunas, status Konfirmasi Desain. Metode bayar tidak tercatat di PO.'),
    ('2026-11-20'::date, 'Penjualan Strava Keychain — Almer Panji P', 150000, 'Clicky', null, null, 'PO #24 — Lunas, status Produksi. Metode bayar tidak tercatat di PO.'),
    ('2026-11-20'::date, 'Penjualan Strava Keychain — Aries (Batman JKT)', 150000, 'Clicky', null, null, 'PO #25 — Lunas, status Konfirmasi Desain. Metode bayar tidak tercatat di PO.')
  ) as d(txn_date, description, amount, channel_slug, ref, payment_method, notes)
where c.brand_id = '11111111-1111-1111-1111-111111111111' and c.slug = d.channel_slug
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

commit;

-- ================= VERIFIKASI (jalankan terpisah setelah script) =================
-- select * from public.v_brand_monthly_summary
--   where brand_id = '11111111-1111-1111-1111-111111111111' and month = '2026-11';
-- Harus: income 4179000, expense_counted 1202882,
--        belum_reimburse 605423, net 2976118.
--
-- select count(*) filter (where kind = 'income') as income_rows,
--        count(*) filter (where kind = 'expense') as expense_rows
--   from public.transactions
--   where brand_id = '11111111-1111-1111-1111-111111111111'
--     and txn_date >= '2026-11-01' and txn_date < '2026-12-01';
-- Harus: income_rows 25, expense_rows 39.
