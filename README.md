# Vektora Finance

Aplikasi keuangan multi-brand untuk **PT Vektora Teknologi Nusantara** — satu manajemen,
banyak brand: **WhereIsIt** (3D print) dan **Moonimo** (segmen berbeda, akan diluncurkan).
Brand baru cukup ditambah di database / halaman Brand, tanpa ubah kode.

Stack: **Next.js 14 (App Router, TypeScript) + Tailwind CSS + Supabase (Postgres + Auth)**.
Tidak ada backend lain. Deploy di **Vercel**, repo GitHub yang disarankan: `vektora-finance`.

UI mengikuti referensi Finora: gradasi biru tua (`#1e5aff` → `#0a2a8f`), kartu putih
bersudut besar, aksen biru, Bahasa Indonesia, semua jumlah dalam Rupiah (Rp), tanggal DD/MM/YYYY.

## Arsitektur (teks)

```
                    ┌─────────────────────────────┐
                    │  Vercel — Next.js app       │
                    │  / dashboard /transactions  │
                    │  /assets /liabilities       │
                    │  /employees /fee-split      │
                    │  /brands /settings          │
                    └──────────────┬──────────────┘
                                   │ @supabase/supabase-js
                    ┌──────────────▼──────────────┐
                    │  Supabase Postgres          │
                    │  brands, channels, products │
                    │  customers, transactions,   │
                    │  reimbursements, assets,    │
                    │  liabilities,               │
                    │  loan_installments,         │
                    │  employees, fee_splits      │
                    │  + view v_brand_monthly_    │
                    │    summary + RLS            │
                    └─────────────────────────────┘
```

Holding → Brand → Channel/Produk → Transaksi/Aset/Hutang/Karyawan/FeeSplit.
Semua entitas operasional punya `brand_id`, jadi laporan bisa per brand atau
konsolidasi (brand switcher: Semua brand / WhereIsIt / Moonimo).

## Data model

| Tabel | Isi |
|---|---|
| `brands` | Brand di bawah PT Vektora (`slug` unik). |
| `channels` | Sumber pemasukan: Direct TF, Shopee, Official Website — `brand_id` null = global. Channel baru = INSERT, tanpa ubah kode. |
| `products`, `customers` | Produk & pelanggan per brand. |
| `transactions` | Income & expense dalam satu tabel: `kind`, `txn_date`, `description`, `category`, `amount`, `payment_method`, `ref`, `notes`, `channel_id`, `payment_status`, `reimbursed_at`. |
| `reimbursements` | Audit trail saat status diubah ke Sudah dibayar. |
| `assets` | Investasi/aset: nama, kategori, qty, harga satuan, total, tanggal beli, kondisi, catatan. |
| `liabilities` | Hutang: kreditur, jumlah, sisa, jatuh tempo, cicilan/bulan, jangka, `paid_by` (`company`/`investor`), status. |
| `loan_installments` | Jadwal amortisasi per hutang. |
| `employees` | Nama, peran, tim, `monthly_salary`, `is_fixed_cost`, `is_management`, aktif. |
| `fee_splits` | Per brand: `dividend_pct`, `management_fee_pct`, `retained_pct` (harus total 100), penerima dividen & fee sebagai JSONB. |
| `profiles` | User login: `id` FK `auth.users`, `email`, `full_name`, `role` (`admin`/`management`/`komisaris`/`investor`/`karyawan`), `brand_ids`, `employee_id`, `active`. |
| `payroll_periods`, `payslips` | Periode gaji (YYYY-MM) + slip per karyawan: gaji pokok, tunjangan/potongan (JSONB), gross, net, status, `sent_at`/`sent_via`. |
| `capital_contributions` | Penyertaan modal per brand: penyetor, peran (pemodal/eksekutor), `amount` (null = Belum dicatat), status. |
| `taxes` | Pajak per brand: jenis (PPN/PPh), periode, jumlah, status. |

## Login & peran (Supabase Auth, username + kata sandi)

Halaman `/login` (gaya Finora, biru gradient). Middleware melindungi semua route app
kecuali `/login`: yang belum login diarahkan ke `/login`; user yang profilnya
dinonaktifkan (`active = false`) di-logout otomatis. **Tidak ada kata sandi bawaan
atau hardcoded.**

**Login pakai username saja** (tanpa email asli): Supabase Auth wajib email di
belakang layar — tidak ada login username-only bawaan. Solusinya: app mengubah
username jadi email teknis internal `username@vektora.id` sebelum login
(`januar` → `januar@vektora.id`). Domain `@vektora.id` ini tidak perlu
dibuka atau dipunya siapa pun; dari sisi pengguna, login cukup **username +
kata sandi**. Input yang sudah mengandung "@" dipakai apa adanya (untuk Mattin:
`tiasaustin32@gmail.com`).

Username yang bisa dipakai (sesuai seed.sql):
| Username | Peran | Email teknis (di Supabase Auth) |
|---|---|---|
| — (email Gmail) | admin (Matias Austin, Dirut) | `tiasaustin32@gmail.com` |
| `januar` | management (Januar Amin, Dirops) | `januar@vektora.id` |
| `febri` | investor (Febri, pemodal) | `febri@vektora.id` |
| `komisaris-utama` | komisaris | `komisaris-utama@vektora.id` |
| `komisaris-2` | komisaris | `komisaris-2@vektora.id` |
| `avrina` | management (Avrina, Finance) | `avrina@vektora.id` |
| `rohimat` | karyawan (sementara — role belum ditentukan) | `rohimat@vektora.id` |
| `lemuel` | management (Manager Marketing — gaji dari Management Fee, bukan OPEX) | `lemuel@vektora.id` |

**Cara membuat akun (Mattin yang lakukan):** Supabase Dashboard → Authentication →
Users → Add user → email = `username@vektora.id` sesuai tabel di atas → centang
**Auto Confirm User** (atau "Confirm email") → isi kata sandi → Create user. Lalu
beri tahu kata sandi itu ke orangnya **di luar app** (WA / langsung) — **JANGAN
bagikan password lewat chat di sini**, dan password tidak ada di kode/seed.
Setelah akun Auth dibuat, profil + perannya muncul dari `seed.sql` (join by email)
atau dibuat di halaman `/team` (pakai Auth User ID-nya).

Matriks peran (ditegakkan di UI **dan** di RLS `supabase/schema.sql`):

| Peran | Bisa |
|---|---|
| **admin** (Matias Austin, Dirut) | Semua: transaksi, aset, hutang, karyawan, slip gaji, fee-split config, settings, kelola tim |
| **management** (Januar Amin, Direktur Operasional) | Semua operasional; **tidak** bisa ubah fee-split config atau kelola user admin; lihat daftar tim (baca saja) |
| **komisaris** (Komisaris Utama, Komisaris 2 — nama placeholder) | **Baca saja**: dashboard, laporan, pembagian fee (bagiannya). Tidak bisa tambah/edit/hapus apa pun, tidak lihat detail gaji |
| **investor** (Febri, pemodal) | **Baca saja** portfolio: modal, aset, hutang, laba/rugi, dividen yang jatuh tempo. Tidak lihat detail gaji / slip per karyawan (hanya total OPEX) |
| **karyawan** (mis. Lemuel) | Hanya profil sendiri + slip gaji sendiri. Tidak lihat total perusahaan, karyawan lain, transaksi, fee split, atau data investor |

Profil di-seed di `supabase/seed.sql` (join ke `auth.users` lewat email — baris
baru muncul setelah akun Auth-nya dibuat): Matias (admin), Januar (management),
Febri (investor), Komisaris Utama & Komisaris 2 (komisaris, nama placeholder),
Lemuel (karyawan, terkait ke karyawan Lemuel di `/employees`).

## Tim & pengguna (`/team`)

Admin: tambah/edit/nonaktifkan pengguna, atur peran + akses brand (kosong = semua
brand). Management: hanya lihat daftar. Menonaktifkan user memblokir login
(middleware + RLS). Akun Auth-nya sendiri dibuat di Supabase (bukan dari app) —
lihat petunjuk di halaman `/team`.

## Slip gaji (`/payslips`)

1. Admin/management buat periode (YYYY-MM) per brand → **Generate slip** dari
   karyawan aktif (gaji pokok = gaji bulanan di `/employees`; tunjangan/potongan
   default 0, bisa diedit per slip; karyawan bergaji 0 dilewati).
2. Detail slip: header PT Vektora, brand, nama/peran karyawan, periode, rincian
   penghasilan, potongan, gaji bersih, area tanda tangan.
3. **Cetak** (tombol Cetak, print CSS A4-ish, hanya slip yang tercetak) atau
   **kirim**: tandai terkirim dengan metode WhatsApp / Email / Langsung
   (`sent_at` tercatat) + tautan WhatsApp (`wa.me`) / salin tautan untuk dibagikan
   manual. **App tidak mengirim pesan otomatis.**
4. **Tandai sudah dibayar** → slip masuk OPEX bulan itu; yang belum dibayar
   tampil sebagai tunggakan. Karyawan hanya melihat slip miliknya sendiri.

## Modal & pajak

`capital_contributions`: penyetor, peran, jumlah (null = Belum dicatat — jangan
ditebak). Seed: Febri `amount = NULL`, status `belum_dicatat`; Matias eksekutor
Rp0 (sweat equity). `taxes`: PPN/PPh per periode (seed: PPN Nov 2026 Rp0,
`belum_dihitung`).

## Aturan bisnis (dari sheet WhereIsIt)

### 1. Status Bayar / Reimburse
`payment_status` = `sudah_dibayar` | `belum_reimburse` (dropdown di app).
- **Belum reimburse dicatat tapi TIDAK masuk** total pengeluaran dan saldo.
- Flip ke **Sudah dibayar** (tombol Reimburse, `reimbursed_at` terisi, baris masuk
  `reimbursements`) → otomatis masuk total, saldo berkurang.
- Implementasi: `src/lib/types.ts` → `countedAmount()` dan view
  `v_brand_monthly_summary` di `supabase/schema.sql`. Laporan Bulanan/Mingguan di
  sheet lama sudah diperbaiki dengan logika yang sama (18 Nov 2026).

### 2. Pembagian Fee (per brand, bisa diubah)
- Hanya bila **laba bersih > 0**; kalau negatif, semua pembagian = Rp0.
- Default WhereIsIt: **Dividen 20%** (Febri 70% / Matias 30%), **Management Fee 55%**
  (termasuk Komisaris 14% dari fee pool: Komisaris Utama 7% + Komisaris 2 7%),
  **Ditahan 25%**.
- Contoh Nov 2026: laba Rp159.395 → Dividen Rp31.879 (Febri Rp22.315 / Matias Rp9.564),
  Management Fee Rp87.667, Ditahan Rp39.849.
- Ubah persentase di halaman `/fee-split` (validasi total = 100).

### 3. OPEX & gaji (fixed cost)
- **OPEX = pengeluaran operasional yang tercatat + gaji tetap staf operasional.**
- Karyawan dengan `is_fixed_cost = true` dan aktif masuk total OPEX bulanan
  (`fixedCostOpex()` di `src/lib/types.ts`).
- **Manajemen dibayar dari Management Fee, bukan OPEX** (`is_management = true`
  → tidak masuk OPEX).
- Gaji tidak di-seed (belum ada angka terkonfirmasi) — isi di `/employees`.

### 4. Hutang: perusahaan vs investor
- `paid_by = 'company'` → hutang perusahaan, masuk total hutang.
- `paid_by = 'investor'` → dibayar investor, **bukan** hutang perusahaan.
  Contoh: eSUN PETG x8 Rp892.528 via SPayLater — investor yang bayar, jadi tercatat
  sebagai aset investasi, tapi tidak masuk total hutang perusahaan.
- Contoh hutang perusahaan: pinjaman Febri Rp5.380.000 untuk Bambulab P2S,
  jatuh tempo 2027-11-16, amortisasi 12 bulan, Rp448.333/bulan.

### 5. Investasi / aset
Aset (P2S Rp10.000.555, PETG Rp892.528, A1 Rp5.267.960 — total Rp16.161.043)
dicatat di `assets`, **bukan** sebagai pengeluaran operasional.

## Seed data (Nov 2026 WhereIsIt)
`supabase/seed.sql` berisi angka nyata dari sheet per 18 Nov 2026:
Income Rp1.470.000 (7 penjualan), pengeluaran terhitung Rp1.310.605,
saldo Rp159.395, Belum reimburse Rp437.700 (12 item Meeting Calon BA dari Notion).
Refund Emoney Livin Rp482.604 sudah dipakai untuk 7 kartu emoney offline
Rp280.000; sisa Rp202.604 di Januar. Moonimo di-seed kosong (brand saja).

## Setup Supabase
1. Buat project baru di https://supabase.com/dashboard.
2. SQL Editor → jalankan `supabase/schema.sql` (semua tabel, enum, index, view, RLS).
3. SQL Editor → jalankan `supabase/seed.sql`.
4. Settings → API Keys → salin **Publishable key** (`sb_publishable_...`,
   pengganti anon key) dan **Secret key** (`sb_secret_...`, pengganti
   service_role key, hanya untuk server). URL project ada di Settings →
   General → Project URL (`https://<project-ref>.supabase.co`). Key lama
   (anon/service_role) sudah diganti Supabase dengan format baru ini dan
   akan pensiun awal 2027 — pakai yang baru saja.
5. Di repo lokal: `cp .env.example .env.local` lalu isi
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   dan (bila perlu server) `SUPABASE_SECRET_KEY`.
6. **Auth (wajib untuk login):** Supabase Dashboard → Authentication → Providers →
   aktifkan **Email**. Lalu Authentication → Users → Add user untuk tiap orang
   dengan email `username@vektora.id` (januar / febri / komisaris-utama /
   komisaris-2 / lemuel; Mattin pakai `tiasaustin32@gmail.com`), centang **Auto
   Confirm User**, dan kata sandi masing-masing — lihat tabel username di atas.
   Jalankan ulang bagian profil di `seed.sql` bila akun dibuat setelah seed —
   atau tambahkan profilnya di halaman `/team` (butuh Auth User ID). Tanpa
   profil, user bisa login tapi tidak bisa melihat data (RLS membutuhkan
   `profiles.role` yang aktif) — dashboard akan menampilkan peringatan
   "Profil belum dibuat" dengan jelas, bukan angka 0 diam-diam.

## Jalankan lokal
```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # verifikasi build
npm run typecheck  # tsc --noEmit
```

Tanpa env Supabase, app menampilkan kartu “Hubungkan Supabase dulu” —
tidak ada data palsu yang ditampilkan sebagai data live.

## Deploy ke Vercel
1. Push repo ini ke GitHub (nama disarankan: `vektora-finance`).
2. Vercel → Add New Project → import repo → Framework: Next.js.
3. Environment Variables: isi `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (dan `SUPABASE_SECRET_KEY` bila dipakai server).
4. Deploy. Setiap push ke `main` akan redeploy otomatis.

## Yang masih perlu Mattin
- Buat project Supabase + jalankan schema/seed (atau beri akses agar bisa dijalankan).
- **Buat akun Auth untuk tim** (Matias, Januar, Febri, komisaris, Lemuel) di Supabase
  → Authentication → Users, dengan email yang sama seperti di `seed.sql`; profil
  + peran sudah di-seed (join by email) atau bisa ditambah di `/team`.
- Buat repo GitHub `vektora-finance` sendiri (pembuatan repo via connector gagal
  403, 19 Nov 2026) + beri akses ke Muse, baru kode bisa di-push.
- Isi `.env.local` / env Vercel.
- Isi gaji karyawan per brand/tim di `/employees` (Lemuel sudah ada sebagai karyawan
  contoh, gajinya masih 0 — angka belum ada yang terkonfirmasi; jangan ditebak).
- Isi jumlah penyertaan modal Febri di `capital_contributions` (masih kosong /
  Belum dicatat) dan nama asli kedua komisaris (saat ini placeholder).
- Tambah brand/channel/produk baru lewat UI saat Moonimo launch — tanpa ubah kode.
