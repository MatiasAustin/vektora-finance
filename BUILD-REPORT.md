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
- **Fee split recipients (SELESAI 24 Nov 2026, ikut sheet "Struktur Pembagian"):**
  placeholder lama “Manajemen & operasional (sisa, belum dirinci) 86%” SUDAH
  DIHAPUS. Penerima Management Fee WhereIsIt sekarang 8 penerima: Direktur
  Utama (Matias) 25%, Direktur Operasional (Januar) 20%, Komisaris Utama 7%,
  Komisaris 2 7%, Keuangan 10.25%, Pemasaran 10.25%, Operasional 10.25%,
  Administrasi 10.25% (total 100%). Dividen tetap Febri 70% / Matias 30%.
- **Channel per income di seed:** channel tiap penjualan Nov 2026 tidak
  tercatat di sheet, jadi di-seed sebagai Direct TF. Perbaiki per baris bila
  datanya ada.
- `node_modules/` (291 MB) dan `.next/` (59 MB) ada di lokal dan di-ignore
  git; jangan ikut push.

## ADDENDUM — 24 Nov 2026 (01:46–01:50 WIB): data tidak update + UI berantakan + mobile + fee-split kecampur + login username

### Hasil build — LULUS
- `npm run typecheck` (`tsc --noEmit`) — lulus, tidak ada error.
- `npm run build` — **Compiled successfully**, 14 halaman, tidak ada error.

### 1. BUG UTAMA — data terbaru tidak masuk (penyebab pasti, bukan tebakan)
**`supabase/seed-latest-2026-11-24.sql` bagian 3b** memakai `channel_slug`
`'Shopee'` / `'Threads'` / `'Clicky'` (kapital), sedangkan slug di tabel
`channels` adalah `'shopee'` / `'threads'` / `'clicky'` (huruf kecil).
Postgres membandingkan teks case-sensitive, jadi join
`c.slug = d.channel_slug` **tidak pernah cocok** — `INSERT ... SELECT`
mengembalikan **0 baris TANPA error**, transaksi tetap commit, dan 17 income
PO (Rp2.559.000) diam-diam tidak masuk. Itulah kenapa Mattin "udah jalanin
tapi data terbarunya belum ke update": script terlihat berhasil, tapi bagian
terbesarnya tidak meng-insert apa pun.
- **Perbaikan:** slug di 3b diubah ke huruf kecil + join sekarang
  `c.slug = lower(d.channel_slug)` supaya typo kapital tidak bisa mengulang
  bug ini. Guard `NOT EXISTS` tetap ada, jadi **aman di-run ulang**: bagian
  lain (Afr Rp150.000, Cutter Rp25.000, JNT Rp35.000, koreksi Status Bayar 3
  baris) sudah masuk dari run pertama dan tidak akan duplikat; 17 income yang
  hilang akan masuk saat file ini dijalankan ulang.
- Setelah re-run, verifikasi dengan query di akhir file: income Nov 2026
  harus **Rp4.179.000**, pengeluaran terhitung **Rp1.202.882**, Belum
  reimburse **Rp605.423**, saldo **Rp2.976.118** (25 income, 39 expense).

### 2. BUG — error Supabase dibuang diam-diam (semua halaman)
Semua halaman memakai pola `const { data } = await sb.from(...)` lalu
`if (data) set...` tanpa membaca `error`. Bila RLS menolak baca — penyebab
paling umum: **profil login belum dibuat**, sehingga `current_user_role()`
mengembalikan NULL dan semua policy baca gagal — app hanya menampilkan angka
0 / "Belum ada transaksi" tanpa penjelasan.
- **Perbaikan:** dashboard sekarang menangkap error tiap query dan
  menampilkan banner merah berisi pesan error aslinya + kemungkinan
  penyebabnya (profil belum dibuat / schema belum dijalankan).
- **Perbaikan:** bila user sudah login tapi `profile === null`, dashboard
  menampilkan kartu peringatan kuning "Profil belum dibuat — data tidak bisa
  dibaca" yang menjelaskan bahwa angka 0 di bawah bukan data hilang.
- Dashboard: tombol **"↻ Muat ulang data"** (refetch manual), baris
  **"Data per {tanggal jam} · {n} transaksi dimuat"** supaya Mattin bisa
  melihat sekilas apakah data baru sudah masuk, dan limit transaksi
  dinaikkan 200 → 1000. Tidak ada lagi fetch yang hanya sekali tanpa cara
  refresh. (Data diambil client-side saat halaman dibuka, jadi tidak ada
  cache static Next.js yang menyajikan data lama — asal Vercel sudah
  redeploy build terbaru.)

### 3. BUG — fee-split Moonimo & WhereIsIt kecampur (laporan 01:47 WIB)
Halaman `/fee-split` menghitung **SATU laba global** dari semua transaksi,
lalu menerapkan laba yang sama ke tiap kartu fee-split per brand. Akibatnya
Moonimo (belum ada transaksi) menampilkan pembagian WhereIsIt yang sama
persis (Dividen Rp83.424, Fee Rp229.415, Ditahan Rp104.279).
- **Perbaikan:** laba dihitung **PER BRAND** dari transaksi brand itu sendiri
  (income brand − pengeluaran terhitung brand itu; Belum reimburse tetap
  excluded). Kartu brand tanpa transaksi / laba ≤ 0 menampilkan **Rp0 di
  semua pembagian** + keterangan "Belum ada transaksi / belum ada laba —
  pembagian Rp0", bukan angka brand lain.
- **Filter brand dihormati:** "Semua brand" menampilkan semua kartu,
  masing-masing dengan labanya sendiri; satu brand menampilkan hanya kartu
  brand itu. Pilihan ini dicatat di sini.
- **Verifikasi angka:** WhereIsIt Nov 2026 laba Rp417.118 → Dividen Rp83.424
  (Febri 70% Rp58.397 / Matias 30% Rp25.027), Management Fee Rp229.415,
  Ditahan Rp104.279. Moonimo laba 0 → semua Rp0.
- **Pola yang sama diperbaiki di dashboard:** widget Pembagian Fee sebelumnya
  memakai split brand pertama hasil `order("name")` (alfabetis = Moonimo)
  dengan laba global. Sekarang memakai laba per brand: bila satu brand
  dipilih, pakai laba brand itu; bila "Semua brand", pakai brand dengan laba
  terbesar (WhereIsIt). Contoh lama di halaman fee-split (laba Rp159.395)
  diperbarui ke angka terbaru Rp417.118.

### 4. UI mobile — navigasi tidak ada + layout berantakan
- **BUG:** Sidebar `hidden md:block` — di HP **tidak ada navigasi sama
  sekali**. **Perbaikan:** bar atas mobile baru (sticky, `md:hidden`) dengan
  tombol hamburger ☰ Menu + logo Vektora + tombol Keluar; menu yang terbuka
  menampilkan nav yang sama dengan sidebar desktop (difilter per peran) dan
  menutup otomatis saat pindah halaman. Sidebar desktop tidak berubah.
- Header hero (AppShell): padding dan ukuran font mengecil di HP, kartu user
  menumpuk ke bawah (full-width) alih-alih berdempetan; tombol Keluar di
  header desktop tetap, di HP pindah ke bar atas.
- Grid kartu statistik (dashboard, transaksi, payslips): sebelumnya
  `grid-cols-2` / `grid-cols-3` di semua lebar — sekarang 1 kolom di HP,
  2 di tablet, 3–4 di desktop. Hero Total Saldo: `text-3xl` di HP (sebelumnya
  `text-4xl` dan angka Rp panjang bisa meluber) + `break-words`.
- Semua form (transaksi, aset, hutang, karyawan, slip gaji, tim, brand,
  settings): `grid-cols-1` di HP → 2 di tablet → 3 di desktop; input
  full-width, label di atas field.
- Daftar (transaksi, aset, karyawan): deskripsi `break-words` + `min-w-0`,
  angka Rp `whitespace-nowrap` + `shrink-0` supaya tidak pecah baris.
- `src/components/ui.tsx`: Card `p-4` di HP / `p-5` di desktop; StatCard
  `text-xl` di HP / `text-2xl` di desktop.
- `src/app/globals.css`: `overflow-x: hidden` di body + `max-width: 100%`
  untuk media, supaya tidak ada scroll horizontal di layar 390px.
- Login: kartu `p-6` di HP / `p-8` di desktop; sudah pas di layar ponsel.
- Gaya tetap Finora (gradasi biru), Bahasa Indonesia, Rp, DD/MM/YYYY.
  Aturan bisnis, peran, dan logika fee-split TIDAK diubah.

### 5. Login username (tanpa email asli) — 24 Nov 2026 01:49 WIB
Supabase Auth **wajib email** di belakang layar — tidak ada login
username-only bawaan. Solusi: app mengubah username jadi email teknis
internal sebelum `signInWithPassword` (`src/lib/auth.ts` → `toLoginEmail`):
`januar` → `januar@vektora.id`, dst. Domain `@vektora.id` adalah email
teknis internal yang tidak perlu dibuka/dipunya siapa pun; dari sisi
pengguna, login cukup **username + kata sandi**. Input yang mengandung "@"
dipakai apa adanya (Mattin: `tiasaustin32@gmail.com`).
- Halaman `/login`: label jadi "Username / Email", placeholder `januar`,
  hint "Ketik username saja (mis. januar) atau email lengkap".
- Halaman `/team`: daftar pengguna menampilkan "Username: januar" (bukan
  email mentah `@vektora.id`); petunjuk tambah pengguna diperbarui.
- `seed.sql` TIDAK diubah — email placeholder di sana sudah cocok dengan
  skema ini.
- **Langkah pembuatan akun (Mattin):** Supabase Dashboard → Authentication →
  Users → Add user → email `username@vektora.id` (januar / febri /
  komisaris-utama / komisaris-2 / lemuel) → centang **Auto Confirm User** →
  isi kata sandi → beri tahu kata sandi itu ke orangnya di luar app.
  **JANGAN bagikan password lewat chat di sini**; password tidak ada di
  kode/seed. Detail lengkap + tabel username ada di README.md → "Login &
  peran".
- Catatan implementasi: percobaan pertama mengekspor helper dari file
  `page.tsx` gagal build (Next.js melarang export tambahan dari page) —
  helper dipindah ke `src/lib/auth.ts` dan build lulus.

### Yang masih harus Mattin cek di sisinya (tidak bisa diverifikasi dari sini)
1. Jalankan ulang `seed-latest-2026-11-24.sql` (versi perbaikan) di SQL Editor,
   **setelah** `schema.sql` → `seed.sql`, di project Supabase YANG SAMA dengan
   yang ditunjuk env Vercel (`NEXT_PUBLIC_SUPABASE_URL`). Lalu cek dengan
   query verifikasi di akhir file (income 4.179.000, dst. — lihat §1).
2. Pastikan akun Auth-nya dibuat dengan email yang SAMA PERSIS seperti seed
   (`tiasaustin32@gmail.com` untuk Mattin; `januar@vektora.id` dst. untuk
   yang lain) — kalau email Auth berbeda, baris profil tidak muncul dan RLS
   menolak semua pembacaan (dashboard sekarang menampilkan peringatannya).
3. Setelah push, tunggu redeploy Vercel selesai lalu hard-refresh
   (Ctrl+Shift+R) — deploy lama tidak punya perbaikan ini.
4. Hal yang TIDAK bisa diverifikasi tanpa akses Supabase-nya: isi tabel di
   project live-nya (apakah seed-latest versi lama sudah terlanjur jalan,
   apakah ada duplikat, apakah env Vercel menunjuk project yang benar).

## ADDENDUM — 24 Nov 2026 (02:10–02:14 WIB): slip management, dividen tahunan, bayar hutang, editor penerima fee

### Hasil build — LULUS
- `npm run typecheck` (`tsc --noEmit`) — lulus. `npm run build` — Compiled successfully, 14 halaman.
- TIDAK di-push ke GitHub (sesuai tugas) — parent yang push.

### 1. Slip gaji untuk management juga + OPEX yang benar
- `generate()` di `/payslips` memang sudah mencakup semua tim aktif (tidak ada
  filter `is_management`) — dipertahankan. Copy UI "karyawan aktif" diubah jadi
  "tim aktif (karyawan + management)".
- **BUG diperbaiki:** `opexFromPayslips()` dulu menghitung SEMUA slip yang
  dibayar sebagai OPEX, termasuk slip management. Sekarang hanya slip karyawan
  (`!is_management`); helper baru `managementFeeFromPayslips()` menghitung slip
  management yang sudah dibayar. Query slip diperluas ke
  `employees(..., is_management)`; kartu "Sudah dibayar (masuk OPEX)" menampilkan
  total OPEX saja + baris "Dibayar dari Management Fee: RpX"; kartu "Total gaji
  bersih" tetap total semua slip yang tampil.
- **Dropdown Tim di form generate** (`/payslips`): pilih "Semua tim di brand ini"
  atau satu orang dari tim aktif brand itu — tidak ada ketik nama manual. Pilih
  satu orang = generate slip dia saja (bila gajinya 0, pesan menyebut namanya).
  Ganti brand me-reset pilihan ke "Semua tim".

### 2. Dividen Tahunan (cair 1x per tahun)
- **File migrasi yang HARUS Mattin jalankan (satu-satunya file):**
  `supabase/migration-dividend-payouts.sql` — jalankan SEKALI di Supabase SQL
  Editor, di project yang sama dengan env Vercel. Aman di-run ulang (idempotent).
  File ini JUGA berisi kolom bayar-hutang (§3) — jadi cukup satu file ini.
- Tabel baru `dividend_payouts` (brand, tahun, nama penerima, % dividen, jumlah,
  status belum/sudah dibayar, paid_at, unique brand+tahun+penerima) + RLS: baca
  admin/management/komisaris/investor, tulis admin + management. Tabel yang sama
  ditambahkan ke `supabase/schema.sql` (fresh setup ikut dapat).
- **Penyimpangan RLS yang disengaja (dicatat di schema.sql):** pola fee_splits
  tulisnya admin saja, tapi tombol "Buat pencairan dividen" dibuka untuk admin
  DAN management (sesuai instruksi) — jadi tulis dividend_payouts mengizinkan
  admin + management, kalau tidak insert dari management ditolak database.
- UI: bagian "Dividen Tahunan" di `/fee-split` (di bawah kartu fee bulanan):
  pilih tahun (2025–2027, default 2026) → laba tahunan per brand dihitung dari
  transaksi tahun itu saja (query rentang tanggal, bukan load 500 baris) →
  pool dividen + rincian per penerima → tombol "Buat pencairan dividen {tahun}"
  (admin/management). **Jumlah per penerima DIBEKUKAN saat dibuat** (upsert
  `ignoreDuplicates` — klik ulang tidak menimpa jumlah lama). Tiap baris
  pencairan bisa "Tandai sudah dibayar / Batalkan" (paid_at tercatat).
  Komisaris/investor lihat read-only.

### 3. Bayar hutang (dropdown di Transaksi + hutang → aset)
- **ATURAN ANTI DOUBLE COUNT (Mattin, 24 Nov 2026) — baca ini dulu:** aset yang
  dibeli lewat hutang (mis. printer P2S) SUDAH tercatat sebagai aset. Cicilan
  yang dibayar HANYA mengurangi hutang — cicilan itu BUKAN pengeluaran
  operasional: **tidak masuk total pengeluaran, tidak mengurangi laba, tidak
  menambah total nilai aset**. Cicilan = pergerakan neraca (kas berkurang,
  hutang berkurang), bukan beban. Kalau dicatat sebagai expense biasa, total
  pengeluaran membengkak, laba mengecil, fee-split ikut salah.
- Implementasi: `summarize()` di `src/lib/types.ts` mengecualikan expense dengan
  `liability_id` terisi dari `expense` & `net` (seperti Belum reimburse: dicatat
  tapi tidak masuk hitungan). View `v_brand_monthly_summary` dan
  `v_investor_summary` ditulis ulang dengan aturan yang sama — di `schema.sql`
  DAN di file migrasi (`create or replace view`). Dashboard / fee-split /
  ringkasan memakai `summarize()`, jadi laba tidak berubah saat ada pembayaran
  cicilan.
- Form tambah pengeluaran (`/transactions`): dropdown "Bayar hutang (opsional)"
  berisi hutang aktif brand itu (kreditur + sisa). Bila dipilih: transaksi
  tercatat kategori "Pelunasan Hutang", deskripsi "Bayar hutang: {kreditur}",
  `liability_id` terisi; sisa hutang berkurang sebesar bayaran (floor 0); sisa
  0 → status `lunas`. **Bayaran tidak boleh melebihi sisa hutang — ditolak
  dengan pesan** (dipilih tolak, bukan dibatasi ke sisa). Daftar transaksi
  menampilkan "Bayar hutang: {kreditur} — tidak masuk total pengeluaran".
- Hutang → aset: kolom baru `liabilities.asset_id` (nullable) + dropdown
  "Aset terkait" di form tambah hutang; `transactions.liability_id` (nullable)
  melacak pembayaran ke hutangnya. Daftar hutang menampilkan "Sudah dibayar RpX
  dari total RpY" dan, bila ada aset terkait, "Aset: {nama} — kepemilikan
  perusahaan RpX dari RpY" (HANYA info kepemilikan, BUKAN tambahan angka aset);
  saat lunas: "Lunas — aset sepenuhnya milik perusahaan". Total nilai aset TIDAK
  berubah saat cicilan dibayar.
- Kolom baru ada di `schema.sql` (fresh setup) dan di file migrasi (ALTER TABLE
  ... ADD COLUMN IF NOT EXISTS). RLS mengikuti tabel yang bersangkutan (tidak
  ada policy baru untuk kolom).
- Catatan: hutang Febri yang SUDAH ADA (pinjaman P2S Rp5.380.000) tidak otomatis
  terhubung ke aset P2S — tautan hanya bisa diisi saat hutang dibuat (belum ada
  form edit hutang). Bila mau dihubungkan, jalankan sekali di SQL Editor:
  `update public.liabilities set asset_id = (select id from public.assets where name = 'Bambulab P2S Combo') where creditor = 'Febri' and amount = 5380000;`

### 4. Editor penerima fee + turunan Management Fee jelas
- Kartu Management Fee tiap brand sekarang menampilkan rincian lengkap tiap
  penerima: **nama, % dari fee pool, dan jumlah Rp** (dihitung dari laba periode
  itu). Sama untuk Dividen (nama, % dari dividen, Rp). `computeFeeSplit()` kini
  mengembalikan `pct` di tiap baris breakdown.
- **Editor "Edit penerima fee" (admin saja, `canEditFeeSplit`)** di tiap kartu:
  tambah baris penerima (nama + %), hapus baris, ubah %, pilih Tim dari dropdown
  (anggota tim brand itu; boleh kosong bila penerima bukan tim). Total % tiap
  daftar ditampilkan berjalan dan **simpan ditolak bila total ≠ 100%** (daftar
  kosong dibolehkan = belum ada penerima). Simpan ke
  `fee_splits.management_fee_recipients` / `dividend_recipients` (jsonb).
  Editor yang sama dipakai untuk penerima Dividen.
- **Penerima → slip gaji:** tiap baris penerima bisa dihubungkan ke employee
  lewat dropdown "Tim"; tautan disimpan sebagai field opsional `employee_id` di
  dalam objek recipient jsonb (struktur tabel TIDAK berubah). Bila terhubung,
  tampil tautan "Lihat slip" ke `/payslips`. Slip orang itu tetap dibuat lewat
  generate seperti biasa; gaji pokok mereka dibayar dari Management Fee, bukan
  OPEX (lihat §1). Management/komisaris/investor hanya melihat (tidak bisa edit).

### 5. Penerima fee IKUT SHEET (koreksi 24 Nov 2026 ~02:14 WIB)
- Placeholder lama "Manajemen & operasional (sisa, belum dirinci) 86%" **DIHAPUS**
  dari `seed.sql` dan dari semua teks app. Penerima Management Fee WhereIsIt
  sekarang 8 penerima persis seperti tab "Struktur Pembagian" (total 100%):
  Direktur Utama (Matias) 25%, Direktur Operasional (Januar) 20%, Komisaris
  Utama 7%, Komisaris 2 7%, Keuangan 10.25%, Pemasaran 10.25%, Operasional
  10.25%, Administrasi 10.25%. Dividen tetap Febri 70% / Matias 30%.
  Cek angka Nov 2026: laba 417.118 → Dividen 83.424, Fee 229.415, Ditahan
  104.279 — cocok dengan app.
- Keuangan / Pemasaran / Operasional / Administrasi adalah POSISI — di seed
  `employee_id: null`, orangnya diisi nanti lewat editor penerima (dropdown
  Tim) tanpa mengubah %. **Tidak di-hardcode di seed** (Avrina/Januar/Matias
  belum ada di tabel employees). Moonimo tetap penerima kosong.
- Karena baris fee_splits lama sudah ada di database, `seed.sql` berisi UPDATE
  khusus (hanya bila masih mengandung "belum dirinci") — insert NOT EXISTS saja
  tidak akan mengubah baris lama. Jalankan ulang `seed.sql` versi baru supaya
  perbaikannya masuk; contoh/teks "sisa 86%" di app juga sudah dihapus.

### Yang TIDAK bisa diverifikasi tanpa akses Supabase Mattin
1. Migrasi `migration-dividend-payouts.sql` belum dijalankan di project live —
   sampai dijalankan, tabel `dividend_payouts` + kolom `asset_id` /
   `liability_id` belum ada dan fitur baru akan error saat dipakai. Mattin harus
   menjalankan file itu (satu file saja) di SQL Editor.
2. Perilaku RLS live (apakah management bisa insert payout, apakah komisaris
   bisa baca) — policy mengikuti pola fee_splits, tapi belum diuji terhadap
   database live.
3. Total tahunan terhadap data asli (apakah transaksi 2025/2026 lengkap) dan
   tampilan nyata di browser — tidak ada akses browser/live di sini.

## Addendum — 24 Nov 2026 ~02:21–02:23 WIB (dropdown karyawan, slip dividen, slip fee, toggle bayar hutang)

### 6. "Tambah karyawan" — Nama jadi dropdown (Mattin: "mana ini namanya belum bisa dropdown")
- Form di `src/app/employees/page.tsx` sekarang memuat `profiles` (query yang
  sama seperti `/team`: `select * from profiles` aktif, diurutkan nama) dan
  menampilkan dropdown **"Pilih tim terdaftar…"** berisi semua profil
  (nama + label peran). Opsi terakhir: **"Orang baru — ketik manual"**.
- Bila profil dipilih: nama terisi otomatis dan ditampilkan read-only, peran
  disarankan dari label peran profil (`ROLE_LABELS`, mis. "Admin (Dirut)" /
  "Management") dan tetap bisa diubah; tim TIDAK ditebak — dibiarkan kosong
  dan bisa diisi manual. Bila "Orang baru": input nama manual seperti dulu.
- Anti-duplikat: bila profil yang dipilih sudah punya `employee_id` yang
  menunjuk ke baris employees yang ada, simpan ditolak dengan pesan "Orang
  ini sudah terdaftar sebagai karyawan".
- Setelah insert berhasil, profil ditautkan balik (`profiles.employee_id` =
  id karyawan baru) supaya orangnya bisa melihat slip gajinya sendiri di
  `/payslips`. RLS `profiles` hanya mengizinkan tulis untuk admin — bila
  yang menyimpan adalah management, insert tetap berhasil dan pesannya
  menjelaskan tautan belum dibuat (perlu admin). Penautan yang gagal TIDAK
  membatalkan insert.

### 7. Slip dividen (Mattin: "slip gaji/fee harus ada untuk semua, termasuk untuk kirim dividen nanti")
- Kolom baru `sent_at` + `sent_via` di `dividend_payouts` — ditambahkan ke
  `supabase/schema.sql` DAN `supabase/migration-dividend-payouts.sql`
  (migrasi belum dijalankan Mattin, jadi mengeditnya aman; ada juga
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` untuk yang sudah menjalankan
  versi lama). Tipe diperbarui di `DividendPayout` (`src/lib/types.ts`).
- Tiap baris pencairan di bagian "Dividen Tahunan" (`/fee-split`) punya
  tombol **"Lihat slip"** yang membuka kartu Slip Dividen (class
  `payslip-print`, gaya cetak sama seperti slip gaji): header PT Vektora,
  "Slip Dividen", penerima, brand, tahun, % dividen, jumlah Rp, status
  (Belum/Sudah dibayar + tanggal), info terkirim, garis tanda tangan.
  Tombol: Cetak (window.print), Bagikan via WhatsApp (wa.me + ringkasan
  slip), Salin tautan, Tandai terkirim (pilih via WhatsApp/Email/Langsung),
  Tandai sudah dibayar / Batalkan (admin/management).

### 8. Slip fee untuk semua penerima, termasuk jajaran direktur (Mattin: "termasuk jajaran direktur")
- Tiap baris penerima di kartu fee-split — Dividen maupun Management Fee —
  punya tombol **"Slip"** yang membuka kartu slip fee: nama + fungsi/peran
  penerima, brand, pemilih bulan (default bulan berjalan, mis. 2026-11),
  laba bersih brand bulan itu, bagian % dan jumlah Rp.
- Slip fee adalah **dokumen tampilan dari data live, BUKAN tabel baru**:
  dihitung dari transaksi bulan itu per brand (query rentang tanggal,
  pola yang sama seperti laba tahunan). Angka berubah bila ada transaksi
  baru di bulan itu; bila laba bulan itu ≤ 0, bagian Rp0.
- Direktur (Dirut Matias, Dirops Januar) dan komisaris mendapat slip fee
  dari fee pool — mereka TIDAK dipaksa masuk sistem gaji bulanan
  (`monthly_salary` / slip gaji). Slip gaji tetap untuk tim yang punya
  gaji bulanan; slip fee untuk bagian dari fee/dividen.

### 9. Toggle "Bayar hutang" di form Tambah Transaksi (Mattin ~02:23 WIB)
- Masalah: dropdown "Bayar hutang (opsional) — pilih hutang…" selalu
  kelihatan seperti ada yang terpilih, membingungkan bila pengeluarannya
  bukan bayar hutang.
- Sekarang: checkbox/toggle **"Ini pembayaran hutang (cicilan)"**, default
  MATI. Toggle mati → tidak ada pilihan hutang sama sekali, transaksi
  disimpan sebagai pengeluaran biasa (`liability_id` null), dengan teks
  kecil "Pengeluaran biasa — masuk total pengeluaran & laba."
- Toggle nyala → baru muncul dropdown **"Pilih hutang"** (hutang aktif
  brand itu, format "{kreditur} — sisa {remaining}"), WAJIB dipilih —
  toggle nyala tanpa hutang terpilih ditolak simpan dengan pesan jelas.
  Teks kecil: "Cicilan — hanya mengurangi sisa hutang, TIDAK masuk total
  pengeluaran & laba."
- Perilaku simpan + validasi "bayar melebihi sisa ditolak" tidak berubah;
  reset form setelah simpan mengembalikan toggle ke MATI. Status Bayar /
  Belum reimburse di form ini tidak diubah.

### 10. Hapus karyawan + pisah karyawan vs management (Mattin ~02:24 WIB)
- Tombol **"Hapus"** di tiap baris karyawan (admin saja) di
  `src/app/employees/page.tsx`. Sebelum hapus, dihitung dulu jumlah slip
  gajinya; dialog konfirmasi menyebut peringatan bila sudah punya N slip
  ("slip lama tetap tersimpan dan tetap bisa dibuka"). Saat hapus:
  `profiles.employee_id` yang menunjuk ke karyawan itu di-set null,
  lalu baris employees dihapus.
- **Temuan penting saat implementasi:** `payslips.employee_id` tadinya
  `NOT NULL ... ON DELETE CASCADE` — menghapus karyawan ikut MENGHAPUS
  semua slip gajinya, bertentangan dengan permintaan Mattin. Diperbaiki:
  `employee_id` sekarang boleh null + `ON DELETE SET NULL` (di
  `schema.sql` dan di migrasi — `ALTER TABLE ... DROP NOT NULL`, drop +
  re-add FK). Selain itu `payslips` sekarang menyimpan snapshot
  `employee_name` (diisi saat generate, dan di-backfill untuk slip lama
  di migrasi) — tampilan slip (`/payslips`) membaca nama dari join
  employees, jatuh ke snapshot bila karyawan sudah dihapus.
- **Pemisahan daftar:** halaman tetap "Karyawan & Gaji (OPEX)" tapi
  daftar dipisah dua bagian — "Karyawan operasional (OPEX)"
  (`is_management = false`) dan "Management (dibayar dari Management
  Fee)" (`is_management = true`). Lemuel (Manager Marketing, Management
  Fee) sekarang tampil di bagian Management, bukan di daftar karyawan.
  Total gaji tetap / bulan (OPEX) di atas tetap hanya menghitung karyawan
  operasional (`fixedCostOpex`, sudah begitu sejak awal). Form tambah
  tetap satu, dengan radio sumber gaji yang sudah ada.
- Baris Lemuel di seed TIDAK dihapus — Mattin yang memutuskan sendiri
  lewat tombol Hapus setelah fitur ini live.
