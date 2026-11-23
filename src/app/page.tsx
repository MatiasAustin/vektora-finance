"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { computeFeeSplit, fixedCostOpex, summarize } from "@/lib/types";
import type { AssetRow, Brand, EmployeeRow, FeeSplitRow, LiabilityRow, TransactionRow } from "@/lib/types";
import { formatDateID, formatIDR } from "@/lib/format";
import { BrandSelect, Card, EmptySupabase, StatCard } from "@/components/ui";
import { canEdit, useAuth } from "@/lib/auth";

export default function DashboardPage() {
  const { role, profile, loading: authLoading } = useAuth();
  const editable = canEdit(role);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [txns, setTxns] = useState<TransactionRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [liabilities, setLiabilities] = useState<LiabilityRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [feeSplits, setFeeSplits] = useState<FeeSplitRow[]>([]);
  const [brandId, setBrandId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  // BUG 24 Nov 2026 (diperbaiki): error Supabase sebelumnya dibuang diam-diam
  // (`if (data) set...` tanpa membaca `error`) — bila RLS menolak baca
  // (mis. profil login belum dibuat sehingga current_user_role() NULL),
  // dashboard hanya menampilkan angka 0 / "Belum ada transaksi" tanpa
  // penjelasan apa pun. Sekarang error ditampilkan apa adanya.
  const load = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    const [b, t, a, l, e, f] = await Promise.all([
      sb.from("brands").select("*").eq("is_active", true).order("name"),
      sb.from("transactions").select("*, brands(name), channels(name)").order("txn_date", { ascending: false }).limit(1000),
      sb.from("assets").select("*, brands(name)"),
      sb.from("liabilities").select("*, brands(name)"),
      sb.from("employees").select("*, brands(name)").eq("is_active", true),
      sb.from("fee_splits").select("*, brands(name)"),
    ]);
    const firstError = [b, t, a, l, e, f].find((r) => r.error)?.error;
    if (firstError) {
      setLoadError(firstError.message);
    } else {
      setLoadError("");
    }
    if (b.data) setBrands(b.data as Brand[]);
    if (t.data) setTxns(t.data as TransactionRow[]);
    if (a.data) setAssets(a.data as AssetRow[]);
    if (l.data) setLiabilities(l.data as LiabilityRow[]);
    if (e.data) setEmployees(e.data as EmployeeRow[]);
    if (f.data) setFeeSplits(f.data as FeeSplitRow[]);
    setLastLoadedAt(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const filteredTxns = useMemo(
    () => (brandId === "all" ? txns : txns.filter((t) => t.brand_id === brandId)),
    [txns, brandId]
  );
  const sum = useMemo(() => summarize(filteredTxns), [filteredTxns]);
  const totalAssets = useMemo(
    () =>
      assets
        .filter((a) => brandId === "all" || a.brand_id === brandId)
        .reduce((s, a) => s + a.total_price, 0),
    [assets, brandId]
  );
  const companyDebt = useMemo(
    () =>
      liabilities
        .filter((l) => l.paid_by === "company" && (brandId === "all" || l.brand_id === brandId))
        .reduce((s, l) => s + l.remaining_amount, 0),
    [liabilities, brandId]
  );
  const opexFixed = useMemo(
    () => fixedCostOpex(employees.filter((e) => brandId === "all" || e.brand_id === brandId)),
    [employees, brandId]
  );
  const belumList = useMemo(
    () => filteredTxns.filter((t) => t.payment_status === "belum_reimburse"),
    [filteredTxns]
  );
  // BUG 24 Nov 2026 (diperbaiki): sebelumnya saat filter "Semua brand",
  // widget fee memakai split brand pertama hasil order("name") — yaitu
  // Moonimo (alfabetis) — dengan laba GLOBAL semua brand, sehingga
  // pembagian Moonimo ikut menampilkan angka WhereIsIt. Sekarang widget
  // memakai laba PER BRAND: bila satu brand dipilih, pakai laba brand itu;
  // bila "Semua brand", pakai brand dengan laba terbesar (WhereIsIt, karena
  // Moonimo labanya 0). Halaman /fee-split menampilkan tiap brand dengan
  // labanya sendiri.
  const perBrandNet = useMemo(() => {
    const byBrand = new Map<string, TransactionRow[]>();
    for (const t of txns) {
      const list = byBrand.get(t.brand_id) ?? [];
      list.push(t);
      byBrand.set(t.brand_id, list);
    }
    const m = new Map<string, number>();
    for (const [bid, list] of byBrand) m.set(bid, summarize(list).net);
    return m;
  }, [txns]);
  const activeSplit = useMemo(() => {
    if (brandId !== "all") return feeSplits.find((f) => f.brand_id === brandId);
    let best: FeeSplitRow | undefined;
    let bestNet = -Infinity;
    for (const f of feeSplits) {
      const n = perBrandNet.get(f.brand_id) ?? 0;
      if (n > bestNet) {
        bestNet = n;
        best = f;
      }
    }
    return best;
  }, [feeSplits, brandId, perBrandNet]);
  const activeSplitNet = useMemo(
    () => (activeSplit ? perBrandNet.get(activeSplit.brand_id) ?? 0 : 0),
    [activeSplit, perBrandNet]
  );
  const fee = useMemo(
    () => (activeSplit ? computeFeeSplit(activeSplitNet, activeSplit) : null),
    [activeSplitNet, activeSplit]
  );

  if (!isSupabaseConfigured) {
    return (
      <div className="space-y-4">
        <EmptySupabase />
        <Card>
          <h2 className="font-bold">Struktur app (tanpa database pun bisa dibaca)</h2>
          <p className="mt-2 text-sm text-slate-600">
            Holding PT Vektora → brand WhereIsIt &amp; Moonimo → channel (Direct TF, Shopee, Website, dan
            channel baru) → transaksi, aset, hutang, karyawan, fee split. Lihat README.md untuk diagram
            lengkapnya.
          </p>
        </Card>
      </div>
    );
  }
  if (loading || authLoading) return <p className="text-slate-500">Memuat data…</p>;

  // Karyawan: hanya slip gaji sendiri — tanpa total perusahaan.
  if (role === "karyawan") {
    return (
      <div className="space-y-5">
        <Card>
          <p className="text-sm text-slate-500">Halo, {profile?.full_name ?? "karyawan Vektora"}!</p>
          <h2 className="mt-1 text-xl font-bold">Slip Gaji Saya</h2>
          <p className="mt-2 text-sm text-slate-600">
            Kamu hanya bisa melihat slip gajimu sendiri. Total keuangan perusahaan, transaksi, dan fee split
            tidak ditampilkan untuk peran karyawan.
          </p>
          <Link href="/payslips" className="mt-4 inline-block rounded-full bg-vektora-500 px-4 py-2 text-sm font-semibold text-white">
            Lihat slip gaji saya →
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">Halo, {profile?.full_name ?? "tim Vektora"}!</p>
          <h2 className="text-xl font-bold">Ringkasan keuangan</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandSelect brands={brands} value={brandId} onChange={setBrandId} />
          <button
            onClick={refresh}
            disabled={refreshing}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-vektora-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-60"
          >
            {refreshing ? "Memuat ulang…" : "↻ Muat ulang data"}
          </button>
        </div>
      </div>

      {loadError && (
        <Card className="border-rose-200 bg-rose-50">
          <h3 className="font-bold text-rose-800">Data tidak bisa dibaca dari Supabase</h3>
          <p className="mt-1 text-sm text-rose-700">
            {loadError}. Bila ini soal izin (RLS), kemungkinan profil login kamu belum dibuat — minta
            admin membuatkan profil di halaman Tim &amp; Pengguna — atau schema.sql belum dijalankan di
            project Supabase yang sama dengan yang dipakai Vercel.
          </p>
        </Card>
      )}

      {!authLoading && profile === null && (
        <Card className="border-amber-200 bg-amber-50">
          <h3 className="font-bold text-amber-800">Profil belum dibuat — data tidak bisa dibaca</h3>
          <p className="mt-1 text-sm text-amber-800">
            Kamu sudah login, tapi tidak ada baris profil untuk akun ini di tabel <code>profiles</code>,
            sehingga aturan keamanan database (RLS) menolak semua pembacaan data dan angka di bawah
            tampil 0 / kosong. Ini bukan data yang hilang — minta admin (Matias) membuatkan profilmu
            dengan peran yang benar di halaman Tim &amp; Pengguna, atau jalankan ulang bagian profil di{" "}
            <code>seed.sql</code> setelah akun Auth dibuat dengan email yang sama.
          </p>
        </Card>
      )}

      <p className="text-xs text-slate-500">
        Data per {lastLoadedAt ? lastLoadedAt.toLocaleString("id-ID") : "—"} · {txns.length} transaksi
        dimuat{brandId !== "all" ? ` · filter: ${brands.find((b) => b.id === brandId)?.name ?? brandId}` : " · semua brand"}
      </p>

      {/* Total Balance — gaya Finora */}
      <div className="rounded-3xl bg-gradient-to-br from-vektora-500 via-vektora-600 to-vektora-900 p-5 text-white shadow-lg sm:p-6">
        <p className="text-sm text-blue-200">Total Saldo (terhitung)</p>
        <p className="mt-1 break-words text-3xl font-black sm:text-4xl">{formatIDR(sum.net)}</p>
        <p className="mt-2 text-sm text-blue-100">
          Income {formatIDR(sum.income)} · Pengeluaran terhitung {formatIDR(sum.expense)} · Belum
          reimburse {formatIDR(sum.belumReimburse)} (tidak masuk total)
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {brands.map((b) => (
            <span key={b.id} className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
              {b.name} · {b.segment ?? ""}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Income" value={formatIDR(sum.income)} sub="Semua channel" />
        <StatCard label="Pengeluaran" value={formatIDR(sum.expense)} sub="Sudah dibayar saja" />
        <StatCard label="Nilai Investasi / Aset" value={formatIDR(totalAssets)} sub="P2S, A1, PETG, dst." />
        <StatCard label="Hutang Perusahaan" value={formatIDR(companyDebt)} sub="Bukan hutang investor" />
      </div>

      {/* Quick Actions — hanya admin/management */}
      {editable && (<Card>
        <h3 className="font-bold">Quick Actions</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { href: "/transactions", label: "+ Tambah Income" },
            { href: "/transactions", label: "+ Tambah Pengeluaran" },
            { href: "/assets", label: "+ Tambah Aset" },
            { href: "/liabilities", label: "+ Hutang" },
            { href: "/employees", label: "+ Karyawan / Gaji" },
            { href: "/transactions?status=belum_reimburse", label: "Reimburse" },
          ].map((a) => (
            <Link key={a.label} href={a.href} className="rounded-full bg-vektora-500 px-4 py-2 text-sm font-semibold text-white hover:bg-vektora-600">
              {a.label}
            </Link>
          ))}
        </div>
      </Card>)}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Belum Reimburse */}
        <Card>
          <h3 className="font-bold">Belum Reimburse — {formatIDR(sum.belumReimburse)}</h3>
          <p className="text-xs text-slate-500">Dicatat, tidak masuk total. Flip ke Sudah dibayar di halaman Transaksi.</p>
          <ul className="mt-3 space-y-2">
            {belumList.length === 0 && <li className="text-sm text-slate-500">Tidak ada. Semua sudah dibayar.</li>}
            {belumList.slice(0, 6).map((t) => (
              <li key={t.id} className="flex justify-between gap-2 text-sm">
                <span>{t.description}</span>
                <span className="font-semibold">{formatIDR(t.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Fee distribution */}
        <Card>
          <h3 className="font-bold">Pembagian Fee {activeSplit ? `(${activeSplit.dividend_pct}/${activeSplit.management_fee_pct}/${activeSplit.retained_pct})` : ""}</h3>
          <p className="text-xs text-slate-500">
            Hanya bila laba bersih &gt; 0. Laba {activeSplit ? brands.find((b) => b.id === activeSplit.brand_id)?.name ?? "" : ""} sekarang: {formatIDR(activeSplitNet)} (laba per brand, bukan laba gabungan)
          </p>
          {activeSplitNet <= 0 && (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Belum ada transaksi / belum ada laba — pembagian Rp0.
            </p>
          )}
          {fee ? (
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex justify-between"><span>Dividen {activeSplit?.dividend_pct}%</span><b>{formatIDR(fee.dividend)}</b></li>
              {fee.dividendBreakdown.map((r) => (
                <li key={r.name} className="flex justify-between pl-4 text-slate-600"><span>{r.name}</span><span>{formatIDR(r.amount)}</span></li>
              ))}
              <li className="flex justify-between"><span>Management Fee {activeSplit?.management_fee_pct}%</span><b>{formatIDR(fee.managementFee)}</b></li>
              {fee.feeBreakdown.map((r) => (
                <li key={r.name} className="flex justify-between pl-4 text-slate-600"><span>{r.name}</span><span>{formatIDR(r.amount)}</span></li>
              ))}
              <li className="flex justify-between"><span>Ditahan perusahaan {activeSplit?.retained_pct}%</span><b>{formatIDR(fee.retained)}</b></li>
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Belum ada konfigurasi fee split untuk brand ini.</p>
          )}
        </Card>

        {/* OPEX fixed cost */}
        <Card>
          <h3 className="font-bold">OPEX — Gaji Tetap / Bulan</h3>
          <p className="mt-1 text-2xl font-bold">{formatIDR(opexFixed)}</p>
          <p className="text-xs text-slate-500">
            Gaji staf operasional (fixed cost). Manajemen dibayar dari Management Fee, bukan OPEX.
          </p>
        </Card>

        {/* Last transactions */}
        <Card>
          <h3 className="font-bold">Transaksi Terakhir</h3>
          <ul className="mt-3 space-y-2">
            {filteredTxns.slice(0, 6).map((t) => (
              <li key={t.id} className="flex justify-between gap-2 text-sm">
                <span>
                  {t.description}
                  <span className="block text-xs text-slate-500">
                    {formatDateID(t.txn_date)} · {t.brands?.name} · {t.channels?.name ?? "—"} ·{" "}
                    {t.payment_status === "belum_reimburse" ? "Belum reimburse" : "Sudah dibayar"}
                  </span>
                </span>
                <span className={`font-semibold ${t.kind === "income" ? "text-emerald-600" : "text-rose-600"}`}>
                  {t.kind === "income" ? "+" : "−"}{formatIDR(t.amount)}
                </span>
              </li>
            ))}
            {filteredTxns.length === 0 && <li className="text-sm text-slate-500">Belum ada transaksi.</li>}
          </ul>
          <Link href="/transactions" className="mt-3 inline-block text-sm font-semibold text-vektora-600">
            Lihat semua →
          </Link>
        </Card>
      </div>
    </div>
  );
}
