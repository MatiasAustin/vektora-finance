# BUILD REPORT — Vektora Finance

Tanggal: 19 Nov 2026 (01:30 WIB). Dibangun sebagai subagent; kode lokal di
`~/workspace/vektora-finance/`. **Belum di-push ke GitHub** (sesuai tugas — parent
yang push/deploy).

## Hasil build — LULUS
- `npm install` — 112 package, OK (Next di-upgrade 14.2.18 → **14.2.35** karena
  14.2.18 kena peringatan security vulnerability di npm).
- `npm run build` — **Compiled successfully**, 11 halaman static, tidak ada error.
- `npm run typecheck` (`tsc --noEmit`) — lulus, tidak ada error.

## Yang dibangun

### Struktur multi-brand (satu manajemen, tanpa ubah kode untuk brand baru)
- Holding: PT Vektora Teknologi Nusantara. Brand seed: **WhereIsIt** (3D print,
  berisi data nyata Nov 2026) dan **Moonimo** (kosong, segmen berbeda).
- Semua entitas operasional punya `brand_id`; dashboard punya brand switcher
  (Semua brand / WhereIsIt / Moonimo) dan halaman `/brands` untuk tambah brand.

### File
- `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`,
  `postcss.config.mjs`, `vercel.json`, `.env.example`, `.gitignore`, `README.md`
- `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx` (dashboard)
- `src/app/transactions/page.tsx` — filter brand/channel/status/jenis, tambah
  transaksi, flip Status Bayar (Reimburse / Batalkan reimburse, tulis ke
  `reimbursements`)
- `src/app/assets/page.tsx`, `src/app/liabilities/page.tsx`,
  `src/app/employees/page.tsx`, `src/app/fee-split/page.tsx`,
  `src/app/brands/page.tsx`, `src/app/settings/page.tsx`
- `src/components/Sidebar.tsx`, `src/components/ui.tsx` (Card, StatCard,
  BrandSelect, EmptySupabase)
- `src/lib/supabase.ts` (client, null bila env belum diisi), `src/lib/types.ts`
  (tipe + `countedAmount`, `summarize`, `computeFeeSplit`, `fixedCostOpex`),
  `src/lib/format.ts` (Rp, DD/MM/YYYY), `src/lib/useData.ts`
- `supabase/schema.sql` — 11 tabel, enum, index, view `v_brand_monthly_summary`,
  RLS (authenticated read/write)
- `supabase/seed.sql` — data nyata WhereIsIt Nov 2026 (lihat bawah)

### Aturan bisnis yang diimplementasikan
- **Status Bayar:** Belum reimburse dicatat tapi TIDAK masuk total pengeluaran/
  saldo; flip ke Sudah dibayar baru masuk. Di `countedAmount()`, di view SQL,
  dan di rumus Laporan Bulanan/Mingguan (sudah diperbaiki di sheet 18 Nov).
- **Fee split per brand (konfigurabel, total harus 100):** default WhereIsIt
  Dividen 20% (Febri 70 / Matias 30), Management Fee 55% (Komisaris 7+7% dari
  fee pool), Ditahan 25%. Hanya bila laba bersih > 0, kalau negatif = Rp0.
  Contoh Nov 2026: laba Rp159.395 → Dividen Rp31.879, Fee Rp87.667, Ditahan Rp39.849.
- **OPEX fixed cost:** gaji staf operasional (`is_fixed_cost`, aktif) masuk OPEX
  bulanan; manajemen (`is_management`) dibayar dari Management Fee, BUKAN OPEX.
- **Hutang perusahaan vs investor:** `paid_by='company'` masuk total hutang;
  `paid_by='investor'` (mis. PETG SPayLater Rp892.528) dicatat tapi bukan hutang
  perusahaan. Pinjaman Febri Rp5.380.000 (P2S, jatuh tempo 2027-11-16,
  Rp448.333/bln × 12) ada sebagai hutang perusahaan + jadwal di
  `loan_installments`.
- **Channel extensible:** Direct TF, Shopee, Official Website di-seed;
  channel baru cukup INSERT / tambah di `/settings`, `brand_id` null = global.

### Seed — angka yang diverifikasi
- Income Nov 2026: **Rp1.470.000** (7 penjualan: Siti 150rb, Puka 300rb,
  Ory 170rb, Ariel 190rb, Bagas 170rb, Salsabila 340rb, Alfian 150rb).
- Pengeluaran terhitung: **Rp1.310.605** (25 baris — dihitung ulang dari daftar
  seed, cocok dengan sheet).
- Belum reimburse: **Rp437.700** (12 item Meeting Calon BA, Notion, 9 Nov).
- Saldo: **Rp159.395**. Aset total **Rp16.161.043** (P2S 10.000.555 +
  PETG 892.528 + A1 5.267.960).
- Refund Livin Rp482.604 → 7 kartu emoney offline Rp280.000; sisa Rp202.604
  di Januar (dicatat di notes seed).

### UI
Finora-style: gradasi biru `#1e5aff → #0a2a8f`, kartu putih rounded-3xl,
Total Balance, brand cards, Quick Actions, Last Transactions, widget Belum
Reimburse, widget Pembagian Fee, widget OPEX gaji tetap. Bahasa Indonesia,
Rp, DD/MM/YYYY. Tanpa env Supabase: tampil kartu “Hubungkan Supabase dulu”,
tidak ada data palsu sebagai data live.

## Cara jalan / deploy (ringkas, detail di README.md)
```bash
npm install && npm run dev     # lokal
npm run build                  # verifikasi
```
Supabase: buat project → jalankan `supabase/schema.sql` lalu
`supabase/seed.sql` di SQL Editor → isi `.env.local` dari `.env.example`.
Vercel: import repo GitHub `vektora-finance` → isi env
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Deploy.

## Yang masih perlu Mattin (belum bisa ditebak — sengaja dikosongkan)
1. Buat project Supabase + jalankan schema/seed, isi env di Vercel.
2. **Gaji karyawan** per brand/tim — tidak ada angka terkonfirmasi, seed
   employees kosong. Isi di `/employees`.
3. **Jumlah penyertaan modal Febri** — masih kosong di sheet; isi di Supabase
   (tabel modal ada di sheet, belum dipindah ke app — lihat catatan bawah).
4. Push repo ke GitHub `vektora-finance` + deploy Vercel (tugas parent, bukan
   subagent ini).

## ADDENDUM — 19 Nov 2026 (01:39 WIB): login, peran, tim, slip gaji, modal & pajak

### Hasil build — LULUS (lagi)
- `npm run build` — Compiled successfully, **14 halaman** (tambah `/login`, `/team`, `/payslips`), tidak ada error.
- `npm run typecheck` (`tsc --noEmit`) — lulus, tidak ada error.
- Dependency baru: `@supabase/ssr` (untuk middleware + sesi cookie).

### 1. Login + peran (Supabase Auth, email + kata sandi)
- `/login` (Finora biru gradient, Bahasa Indonesia) + `src/middleware.ts` melindungi
  semua route kecuali `/login`. Belum login → redirect `/login`; profil nonaktif →
  di-logout. Tanpa env Supabase, middleware dilewatkan supaya halaman
  "Hubungkan Supabase dulu" tetap tampil. Tidak ada kata sandi hardcoded.
- Tabel `profiles` (id FK `auth.users`, email, full_name, role enum
  admin/management/komisaris/investor/karyawan, brand_ids, employee_id, active).
  Helper `src/lib/auth.ts`: `useAuth()`, `canEdit`, `canEditFeeSplit`,
  `canManageTeam`, `canViewOperations`, `canViewSalaries`, `canViewPayslips`.
- Sidebar + semua halaman difilter/dikunci sesuai peran; header menampilkan nama +
  peran user + tombol Keluar.

Matriks peran:

| Peran | Akses |
|---|---|
| admin (Matias Austin, Dirut) | Penuh: semua data, fee-split config, settings, kelola tim |
| management (Januar Amin, Dirops) | Operasional penuh; TIDAK ubah fee-split config / kelola user admin; tim hanya lihat |
| komisaris (Komisaris Utama, Komisaris 2 — placeholder) | Baca saja: dashboard, laporan, pembagian fee |
| investor (Febri, pemodal) | Baca saja portfolio: modal, aset, hutang, laba/rugi, dividen. Tanpa detail gaji/slip per karyawan (hanya total) |
| karyawan (Lemuel) | Hanya profil + slip gaji sendiri |

- RLS di `supabase/schema.sql` ditegakkan juga di database: helper
  `current_user_role()` / `current_employee_id()` (SECURITY DEFINER) + policy
  per tabel. Policy generik lama diganti: tulis = admin/management (fee split &
  tim = admin saja); baca transaksi/operasional = admin/management/komisaris/
  investor (karyawan tidak); karyawan (gaji) = admin/management saja; slip gaji =
  admin/management + karyawan pemilik slip; modal/pajak = baca semua peran
  non-karyawan. View baru: `v_payroll_totals` (total per brand/periode) dan
  `v_investor_summary` (modal, aset, hutang, laba per brand).

### 2. Team management (`/team`)
- Daftar profil (peran, akses brand, aktif). Admin: tambah profil (butuh Auth
  User ID — akun Auth dibuat dulu di Supabase Dashboard), ubah peran, aktif/
  nonaktifkan. Management: lihat daftar saja. Nonaktif = login diblokir
  (middleware + RLS).

### 3. Slip gaji (`/payslips` + integrasi `/employees`)
- Tabel baru `payroll_periods` (brand, periode YYYY-MM, status draft/final/paid)
  dan `payslips` (employee, gaji pokok, tunjangan/potongan JSONB, gross, total
  potongan, net, status Belum/Sudah dibayar, paid_at, sent_at, sent_via).
- Generate slip per periode dari karyawan aktif (gaji pokok = gaji bulanan;
  tunjangan/potongan default 0, bisa diedit per slip; gaji 0 dilewati).
- Detail slip: header PT Vektora, brand, nama/peran, periode, rincian, gaji
  bersih, area tanda tangan. Tombol **Cetak** (print CSS, hanya slip yang
  tercetak), **Bagikan via WhatsApp** (tautan `wa.me`, tanpa kirim otomatis),
  **Salin tautan slip**, **Tandai terkirim** (WhatsApp/Email/Langsung + `sent_at`),
  **Tandai sudah dibayar** (masuk OPEX bulan itu; yang belum = tunggakan).
- Karyawan hanya melihat slip miliknya sendiri (filter `employee_id` profil +
  RLS). Komisaris/investor tidak bisa buka halaman ini.

### 4. Tabel yang tadinya belum ada (keterbatasan build sebelumnya — selesai)
- `capital_contributions`: seed Febri `amount = NULL`, status `belum_dicatat`
  (TIDAK ditebak); Matias eksekutor Rp0 (sweat equity, aktif).
- `taxes`: seed PPN Nov 2026 Rp0, status `belum_dihitung`.
- Seed karyawan: Lemuel (Motion/Operasional, Produksi WhereIsIt, gaji Rp0 —
  belum diisi, jangan ditebak) + profil loginnya.
- Seed profil login (join `auth.users` by email, baru muncul setelah akun Auth
  dibuat): Matias (admin, tiasaustin32@gmail.com), Januar (management),
  Febri (investor), Komisaris Utama & Komisaris 2 (komisaris, nama + email
  placeholder), Lemuel (karyawan). Tidak ada kata sandi di seed.

### File baru / berubah (addendum)
- Baru: `src/middleware.ts`, `src/lib/auth.ts`, `src/components/AppShell.tsx`,
  `src/app/login/page.tsx`, `src/app/team/page.tsx`, `src/app/payslips/page.tsx`
- Berubah: `src/app/layout.tsx` (pakai AppShell), `src/components/Sidebar.tsx`
  (menu per peran + info peran), `src/components/ui.tsx` (`ReadOnlyNotice`,
  `AccessDenied`), `src/lib/types.ts` (Profile, PayrollPeriod, Payslip,
  CapitalContribution, TaxRow + `payslipTotals`, `opexFromPayslips`),
  `src/lib/supabase.ts` (server client untuk middleware), `src/app/globals.css`
  (print CSS slip gaji), `src/app/page.tsx` (varian karyawan, Quick Actions
  hanya admin/management), `src/app/transactions|assets|liabilities|brands|
  settings|employees|fee-split/page.tsx` (gate peran), `package.json`
  (`@supabase/ssr`), `supabase/schema.sql` (profiles, capital_contributions,
  taxes, payroll_periods, payslips, view v_payroll_totals & v_investor_summary,
  RLS berbasis peran), `supabase/seed.sql` (Lemuel, modal Febri, PPN, profil),
  `README.md`, `BUILD-REPORT.md`.

### Yang masih perlu Mattin
1. Buat akun Supabase Auth untuk tim (email sesuai seed) + isi env Vercel.
2. Buat repo GitHub `vektora-finance` sendiri — pembuatan repo via connector
   gagal 403 pada 19 Nov 2026; setelah repo kosong dibuat + akses diberikan,
   kode bisa di-push.
3. Isi gaji karyawan (Lemuel masih Rp0) dan jumlah modal Febri (masih
   Belum dicatat), dan nama asli kedua komisaris.
4. Supabase project + env Vercel (sama seperti sebelumnya).

## Catatan / batasan yang diketahui
- **Tabel modal / penyertaan modal & pajak — SELESAI 19 Nov 2026:**
  `capital_contributions` + `taxes` sudah dibuat (lihat Addendum di atas).
  Yang masih kosong isinya: jumlah modal Febri (NULL / Belum dicatat) dan
  jumlah pajak (PPN Nov 2026 Rp0, belum dihitung).
- **Auth:** halaman login sudah ada, tapi RLS mengharuskan user `authenticated`
  dengan profil aktif — buat akun Auth + profilnya dulu (lihat README →
  Setup Supabase langkah 6). Bila user login tanpa profil, dia tidak bisa
  melihat data apa pun sampai admin membuatkan profilnya.
- **Fee split recipients:** penerima di dalam Management Fee yang terkonfirmasi
  hanya Komisaris 7% + 7%; sisanya 86% dicatat sebagai “Manajemen &
  operasional (sisa, belum dirinci)” — perbaiki rinciannya saat sudah diputuskan.
- **Channel per income di seed:** channel tiap penjualan Nov 2026 tidak
  tercatat di sheet, jadi di-seed sebagai Direct TF. Perbaiki per baris bila
  datanya ada.
- `node_modules/` (291 MB) dan `.next/` (59 MB) ada di lokal dan di-ignore
  git; jangan ikut push.
