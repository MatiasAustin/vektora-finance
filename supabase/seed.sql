-- ============================================================
-- VEKTORA FINANCE — seed.sql
-- SEED DATA — angka nyata WhereIsIt November 2026 dari sheet
-- (Income & Expend 2026 + Laporan Keuangan WhereIsIt, per 18 Nov 2026).
-- Jalankan SETELAH schema.sql. Aman di-run ulang? Tidak — hapus dulu
-- baris seed bila ingin re-seed (lihat README).
-- Moonimo di-seed kosong (brand saja, belum ada transaksi).
-- Gaji karyawan TIDAK di-seed: belum ada angka terkonfirmasi — isi di
-- halaman /employees. Jangan tebak gaji.
-- ============================================================

begin;

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
insert into public.customers (brand_id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Siti Zahrah'),
  ('11111111-1111-1111-1111-111111111111', 'Puka'),
  ('11111111-1111-1111-1111-111111111111', 'Ory'),
  ('11111111-1111-1111-1111-111111111111', 'Ariel Wastujaya'),
  ('11111111-1111-1111-1111-111111111111', 'Bagas P'),
  ('11111111-1111-1111-1111-111111111111', 'Salsabila'),
  ('11111111-1111-1111-1111-111111111111', 'Alfian Gani')
on conflict do nothing;

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
-- Idempotent (24 Nov 2026): guard NOT EXISTS per baris — seed.sql aman
-- di-run ulang (mis. setelah akun Auth dibuat), tidak menduplikat data.
insert into public.transactions (brand_id, kind, txn_date, description, category, amount, payment_method, notes, payment_status)
select v.brand_id, v.kind, v.txn_date, v.description, v.category, v.amount, v.payment_method, v.notes, v.payment_status
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
where not exists (select 1 from public.transactions t where t.brand_id = v.brand_id and t.kind = v.kind and t.txn_date = v.txn_date and t.description = v.description and t.amount = v.amount);

-- ---------- Pengeluaran BELUM REIMBURSE (12 item Meeting Calon BA, Rp437.700) ----------
-- Satu-satunya Belum reimburse di Nov 2026 — sumber: Notion
-- "Pengeluaran Operasional - Meeting Calon BA - 9 November 2026".
insert into public.transactions (brand_id, kind, txn_date, description, category, amount, payment_method, notes, payment_status)
select v.brand_id, v.kind, v.txn_date, v.description, v.category, v.amount, v.payment_method, v.notes, v.payment_status
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
where not exists (select 1 from public.transactions t where t.brand_id = v.brand_id and t.kind = v.kind and t.txn_date = v.txn_date and t.description = v.description and t.amount = v.amount);

-- ---------- Aset investasi (total Rp16.161.043) ----------
insert into public.assets (brand_id, name, category, qty, unit_price, total_price, purchased_at, condition, notes)
select v.brand_id, v.name, v.category, v.qty, v.unit_price, v.total_price, v.purchased_at, v.condition, v.notes
from (values
  ('11111111-1111-1111-1111-111111111111', 'Bambulab P2S Combo', 'Printer 3D', 1, 10000555, 10000555, '2026-11-16', 'Baru', 'Nota 3DZ/AKE/103/02620, 3D Zaiku — Rp10.000.555 dari modal/investasi; Rp5.380.000 sisanya pinjaman Febri'),
  ('11111111-1111-1111-1111-111111111111', 'eSUN PETG Basic Filament White x8', 'Filamen / Investasi', 8, 123000, 892528, '2026-11-16', 'Baru', 'Shopee 3D Zaiku, order 261025HQQSKYOP — total Rp892.528 via SPayLater; hutang SPayLater dibayar INVESTOR, bukan perusahaan'),
  ('11111111-1111-1111-1111-111111111111', 'Bambulab A1 High Speed 3D Printer', 'Printer 3D', 1, 5267960, 5267960, '2026-11-15', 'Baru', 'Shopee 3D Zaiku — sudah dibeli, barangnya ada')
) as v(brand_id, name, category, qty, unit_price, total_price, purchased_at, condition, notes)
where not exists (select 1 from public.assets a where a.brand_id = v.brand_id and a.name = v.name and a.purchased_at = v.purchased_at and a.total_price = v.total_price);

-- ---------- Hutang (hanya hutang perusahaan; PETG TIDAK masuk sini) ----------
insert into public.liabilities (brand_id, creditor, amount, remaining_amount, due_date, monthly_installment, months, paid_by, status, notes)
select v.brand_id, v.creditor, v.amount, v.remaining_amount, v.due_date, v.monthly_installment, v.months, v.paid_by, v.status, v.notes
from (values
  ('11111111-1111-1111-1111-111111111111', 'Febri', 5380000, 5380000, '2027-11-16', 448333, 12, 'company', 'aktif',
   'Pinjaman dari Pak Febri untuk Bambulab P2S Combo — BUKAN investasi/modal saham, terpisah dari penyertaan modal Febri; amortisasi 12 bln; transfer Rp5.380.000 ke Joy Abigail 17/11')
) as v(brand_id, creditor, amount, remaining_amount, due_date, monthly_installment, months, paid_by, status, notes)
where not exists (select 1 from public.liabilities l where l.brand_id = v.brand_id and l.creditor = v.creditor and l.amount = v.amount and l.due_date = v.due_date);

-- ---------- Karyawan: Lemuel (gaji BELUM diisi — 0, jangan ditebak) ----------
insert into public.employees (id, brand_id, name, role, team, monthly_salary, is_fixed_cost, is_management, is_active) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Lemuel', 'Motion / Operasional', 'Produksi WhereIsIt', 0, true, false, true)
on conflict (id) do nothing;

-- ---------- Penyertaan modal (Febri: jumlah BELUM dicatat, jangan ditebak) ----------
insert into public.capital_contributions (brand_id, contributor, role, amount, contributed_at, status, notes) values
  ('11111111-1111-1111-1111-111111111111', 'Febri', 'pemodal', null, null, 'belum_dicatat', 'Jumlah modal Febri belum tercatat di mana pun — isi sesuai kesepakatan'),
  ('11111111-1111-1111-1111-111111111111', 'Matias Austin', 'eksekutor', 0, null, 'aktif', 'Sweat equity (non-tunai) — dividen 30%')
on conflict do nothing;

-- ---------- Pajak (belum dihitung — 0) ----------
insert into public.taxes (brand_id, type, period, amount, status, notes) values
  ('11111111-1111-1111-1111-111111111111', 'PPN', '2026-11', 0, 'belum_dihitung', 'Tarif PPN 11% — isi jumlah yang dibayar per periode')
on conflict do nothing;

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
-- Lemuel = Marketing (divisi; role app tetap karyawan = slip gaji sendiri).
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
  ('lemuel@vektora.id', 'Lemuel', 'karyawan', ARRAY['11111111-1111-1111-1111-111111111111'::uuid], '33333333-3333-3333-3333-333333333333'::uuid)
) as p(email, full_name, role, brand_ids, employee_id) on u.email = p.email
on conflict (id) do nothing;

-- Alternatif manual (bila email Auth berbeda dari atas): buat user di Auth,
-- salin UUID-nya, lalu jalankan:
-- insert into public.profiles (id, email, full_name, role, active)
-- values ('<AUTH_USER_ID>', 'email@asli.id', 'Nama', 'admin', true);

-- ---------- Fee split WhereIsIt (20 / 55 / 25) ----------
insert into public.fee_splits (brand_id, dividend_pct, management_fee_pct, retained_pct, dividend_recipients, management_fee_recipients, effective_from)
select '11111111-1111-1111-1111-111111111111', 20, 55, 25,
   '[{"name":"Febri (pemodal)","pct_of_dividend":70},{"name":"Matias Austin (eksekutor)","pct_of_dividend":30}]'::jsonb,
   '[{"name":"Komisaris Utama","pct_of_fee":7},{"name":"Komisaris 2","pct_of_fee":7},{"name":"Manajemen & operasional (sisa, belum dirinci)","pct_of_fee":86}]'::jsonb,
   '2026-11-16'
where not exists (select 1 from public.fee_splits f where f.brand_id = '11111111-1111-1111-1111-111111111111' and f.effective_from = '2026-11-16');

-- Moonimo: fee split default sama (20/55/25), penerima kosong — isi saat launch.
insert into public.fee_splits (brand_id, dividend_pct, management_fee_pct, retained_pct, dividend_recipients, management_fee_recipients, effective_from)
select '22222222-2222-2222-2222-222222222222', 20, 55, 25, '[]'::jsonb, '[]'::jsonb, null
where not exists (select 1 from public.fee_splits f where f.brand_id = '22222222-2222-2222-2222-222222222222' and f.effective_from is null);

commit;

-- Verifikasi cepat (jalankan terpisah bila perlu):
-- select * from public.v_brand_monthly_summary;
-- Harus: WhereIsIt 2026-11 income 1470000, expense_counted 1310605,
-- belum_reimburse 437700, net 159395. Moonimo: tidak ada baris.
