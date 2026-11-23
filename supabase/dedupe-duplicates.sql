-- ============================================================
-- dedupe-duplicates.sql — bersihkan data ganda Vektora Finance
-- ============================================================
-- PENYEBAB (24 Nov 2026): seed.sql versi lama di-run 2x di Supabase
-- (mis. run pertama sebelum akun Auth dibuat, run kedua sesudahnya
-- supaya profil muncul). Blok transaksi / aset / hutang / fee-split
-- di seed.sql lama TIDAK punya pengaman anti-duplikat, jadi tiap
-- baris masuk 2x: aset P2S/PETG/A1 dobel, Belum reimburse jadi
-- Rp1.210.846 (seharusnya Rp605.423), laba jadi Rp744.236
-- (seharusnya Rp417.118 sebelum seed-latest).
--
-- CARA PAKAI: jalankan file ini SEKALI di Supabase SQL Editor,
-- di project yang sama. Aman di-run ulang (kalau sudah bersih,
-- tidak ada baris yang terhapus).
-- URUTAN SETELAH INI:
--   1. dedupe-duplicates.sql (file ini)
--   2. seed.sql (versi BARU — sudah idempotent, tidak akan dobel lagi)
--   3. seed-latest-2026-11-24.sql (versi PERBAIKAN slug — baru masukkan
--      17 income PO Rp2.559.000 yang kemarin gagal masuk)
--   4. Cek query verifikasi di bawah — harus: income 4.179.000,
--      pengeluaran terhitung 1.202.882, Belum reimburse 605.423,
--      saldo 2.976.118, aset 3 baris (total 16.161.043),
--      hutang Febri 1 baris (5.380.000).
--
-- CARA KERJA: tiap grup duplikat (nama+tanggal+jumlah yang sama)
-- dipertahankan 1 baris tertua (ctid terkecil), sisanya dihapus.
-- Baris yang memang beda (mis. 2 transaksi JNT di tanggal berbeda)
-- TIDAK ikut terhapus karena kunci grupnya mencakup tanggal.
-- ============================================================

begin;

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

commit;

-- ---------- Verifikasi (jalankan setelah script di atas) ----------
-- Jumlah baris per tabel (WhereIsIt):
select 'transactions' as tabel, count(*) as baris from public.transactions
union all select 'assets', count(*) from public.assets
union all select 'liabilities', count(*) from public.liabilities
union all select 'fee_splits', count(*) from public.fee_splits;
-- Harus: transactions 44 (7 income + 25 sudah dibayar + 12 belum
-- reimburse, sebelum seed-latest), assets 3, liabilities 1,
-- fee_splits 2.

-- Ringkasan Nov 2026 (sebelum seed-latest):
select * from public.v_brand_monthly_summary;
-- Harus: WhereIsIt 2026-11 income 1470000, expense_counted 1310605,
-- belum_reimburse 437700, net 159395. Moonimo: tidak ada baris.
