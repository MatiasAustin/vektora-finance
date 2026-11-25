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

  const load = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    const [b, t, a, l, e, f] = await Promise.all([
      sb.from("brands").select("*").eq("is_active", true).order("name"),
      sb
        .from("transactions")
        .select("*, brands(name), channels(name)")
        .order("txn_date", { ascending: false })
        .limit(1000),
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

  // Ringkasan per brand untuk bagian "Cards" Finora
  const perBrandSummary = useMemo(() => {
    const byBrand = new Map<string, TransactionRow[]>();
    for (const t of txns) {
      const list = byBrand.get(t.brand_id) ?? [];
      list.push(t);
      byBrand.set(t.brand_id, list);
    }
    const m = new Map<string, ReturnType<typeof summarize>>();
    for (const [bid, list] of byBrand) m.set(bid, summarize(list));
    return m;
  }, [txns]);

  const activeSplit = useMemo(() => {
    if (brandId !== "all") return feeSplits.find((f) => f.brand_id === brandId);
    let best: FeeSplitRow | undefined;
    let bestNet = -Infinity;
    for (const f of feeSplits) {
      const n = perBrandSummary.get(f.brand_id)?.net ?? 0;
      if (n > bestNet) {
        bestNet = n;
        best = f;
      }
    }
    return best;
  }, [feeSplits, brandId, perBrandSummary]);

  const activeSplitNet = useMemo(
    () => (activeSplit ? perBrandSummary.get(activeSplit.brand_id)?.net ?? 0 : 0),
    [activeSplit, perBrandSummary]
  );
  const fee = useMemo(
    () => (activeSplit ? computeFeeSplit(activeSplitNet, activeSplit) : null),
    [activeSplitNet, activeSplit]
  );

  if (!isSupabaseConfigured) {
    return (
      <div className="space-y-5">
        {/* Hero Finora Preview walau Supabase belum terhubung */}
        <div className="pt-1">
          <p className="text-sm font-medium text-blue-200/80">Total Balance</p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-4xl font-black tracking-tight text-white sm:text-5xl">Rp0</span>
            <span className="text-xl font-bold text-blue-200/50">,00</span>
          </div>
        </div>
        <EmptySupabase />
        <Card>
          <h2 className="font-bold text-white">Struktur Multi-Brand Vektora Finance</h2>
          <p className="mt-2 text-sm text-blue-100/75">
            Holding PT Vektora → brand WhereIsIt &amp; Moonimo → channel (Direct TF, Shopee, Website, dan channel baru)
            → transaksi, aset, hutang, karyawan, slip gaji, dan fee split.
          </p>
        </Card>
      </div>
    );
  }

  if (loading || authLoading) {
    return (
      <div className="space-y-4 py-6">
        <div className="h-20 w-64 animate-pulse rounded-3xl bg-white/10" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-44 animate-pulse rounded-3xl bg-white/10" />
          <div className="h-44 animate-pulse rounded-3xl bg-white/10" />
        </div>
      </div>
    );
  }

  // Karyawan: hanya slip gaji sendiri — tanpa total perusahaan.
  if (role === "karyawan") {
    return (
      <div className="space-y-5">
        <Card>
          <p className="text-sm text-blue-200/80">Halo, {profile?.full_name ?? "karyawan Vektora"}!</p>
          <h2 className="mt-1 text-xl font-bold text-white">Slip Gaji Saya</h2>
          <p className="mt-2 text-sm text-blue-100/75">
            Kamu hanya bisa melihat slip gajimu sendiri. Total keuangan perusahaan, transaksi, dan fee split tidak
            ditampilkan untuk peran karyawan.
          </p>
          <Link
            href="/payslips"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30"
          >
            Lihat slip gaji saya →
          </Link>
        </Card>
      </div>
    );
  }

  // Quick Actions 8 item (2 baris x 4 kolom) persis seperti referensi Finora
  // Setiap tombol memiliki URL tujuan yang SPESIFIK (tidak lagi ambigu menuju /transactions tanpa parameter).
  const quickActions = [
    {
      href: "/transactions?action=income",
      label: "Income",
      sub: "Tambah masuk",
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v14" />
          <path d="m6 11 6 6 6-6" />
          <path d="M4 21h16" />
        </svg>
      ),
    },
    {
      href: "/transactions?action=expense",
      label: "Pengeluaran",
      sub: "Biaya OPEX",
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 17V3" />
          <path d="m6 9 6-6 6 6" />
          <path d="M4 21h16" />
        </svg>
      ),
    },
    {
      href: "/transactions?status=belum_reimburse",
      label: "Reimburse",
      sub: `${belumList.length} antrean`,
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
          <path d="M16 16h5v5" />
        </svg>
      ),
    },
    {
      href: "/transactions?action=debt",
      label: "Bayar Hutang",
      sub: "Cicilan",
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2.5" />
          <path d="M2 10h20" />
          <path d="M6 15h4" />
        </svg>
      ),
    },
    {
      href: "/assets",
      label: "Aset",
      sub: "Investasi",
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <path d="M3.27 6.96 12 12.01l8.73-5.05" />
          <path d="M12 22.08V12" />
        </svg>
      ),
    },
    {
      href: "/fee-split",
      label: "Fee Split",
      sub: "Dividen & Fee",
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
          <path d="M22 12A10 10 0 0 0 12 2v10z" />
        </svg>
      ),
    },
    {
      href: "/payslips",
      label: "Slip Gaji",
      sub: "Payroll",
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8" />
          <path d="M8 17h5" />
        </svg>
      ),
    },
    {
      href: editable ? "/employees" : "/liabilities",
      label: editable ? "Tim & OPEX" : "Pinjaman",
      sub: editable ? "Karyawan" : "Jadwal",
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="6" height="6" rx="1.5" />
          <rect x="14" y="4" width="6" height="6" rx="1.5" />
          <rect x="4" y="14" width="6" height="6" rx="1.5" />
          <rect x="14" y="14" width="6" height="6" rx="1.5" />
        </svg>
      ),
    },
  ];

  const activeBrandObj = brands.find((b) => b.id === brandId);

  return (
    <div className="space-y-6">
      {loadError && (
        <Card className="border-rose-400/30 bg-rose-950/50">
          <h3 className="font-bold text-rose-200">Data tidak bisa dibaca dari Supabase</h3>
          <p className="mt-1 text-sm text-rose-100/80">
            {loadError}. Bila ini soal izin (RLS), kemungkinan profil login kamu belum dibuat — minta admin membuatkan
            profil di halaman Tim &amp; Pengguna.
          </p>
        </Card>
      )}

      {!authLoading && profile === null && (
        <Card className="border-amber-400/30 bg-amber-950/50">
          <h3 className="font-bold text-amber-200">Profil belum dibuat — data tidak bisa dibaca</h3>
          <p className="mt-1 text-sm text-amber-100/85">
            Kamu sudah login, tapi tidak ada baris profil untuk akun ini di tabel <code>profiles</code>, sehingga RLS
            menolak pembacaan data. Minta admin (Matias) membuatkan profilmu di halaman Tim &amp; Pengguna.
          </p>
        </Card>
      )}

      {/* TOTAL BALANCE HERO — Persis gaya Finora di atas latar gradasi biru */}
      <section className="flex flex-col justify-between gap-4 pt-1 sm:flex-row sm:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="text-sm font-medium text-blue-100/85">
              Total Balance {activeBrandObj ? `· ${activeBrandObj.name}` : "(Semua Brand)"}
            </p>
            <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-white/15 bg-white/15 px-3 py-1 text-[11px] font-semibold leading-none text-blue-100">
              Terhitung
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-1">
            <span className="break-words text-4xl font-black tracking-tight text-white sm:text-5xl">
              {formatIDR(sum.net)}
            </span>
            <span className="text-xl font-bold text-blue-200/55">,00</span>
          </div>
          <p className="mt-2 text-xs text-blue-100/80 sm:text-sm">
            Income <b className="text-white">{formatIDR(sum.income)}</b> · Pengeluaran{" "}
            <b className="text-white">{formatIDR(sum.expense)}</b> · Belum reimburse{" "}
            <b className="text-amber-200">{formatIDR(sum.belumReimburse)}</b>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <BrandSelect brands={brands} value={brandId} onChange={setBrandId} />
          <button
            onClick={refresh}
            disabled={refreshing}
            title="Muat ulang data dari Supabase"
            className="inline-flex items-center gap-1.5 rounded-2xl border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-white/20 disabled:opacity-60"
          >
            <span>{refreshing ? "Memuat…" : "↻ Refresh"}</span>
          </button>
        </div>
      </section>

      {/* CARDS SECTION — Kartu glossy bergaya VISA / Mastercard Finora untuk tiap Brand + kartu Holding */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight text-white">Cards</h2>
            <span className="text-xs text-blue-200/70">· Klik kartu untuk filter brand</span>
          </div>
          {editable ? (
            <Link
              href="/brands"
              className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold leading-none text-blue-100 transition hover:bg-white/20 hover:text-white"
            >
              Add +
            </Link>
          ) : (
            <Link href="/brands" className="text-xs font-semibold text-blue-300 hover:text-white">
              Lihat Brand →
            </Link>
          )}
        </div>

        <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
          {/* Kartu tiap brand bergaya kartu bank glossy Finora */}
          {brands.map((b, idx) => {
            const bSum = perBrandSummary.get(b.id) ?? { income: 0, expense: 0, belumReimburse: 0, net: 0 };
            const bSplit = feeSplits.find((f) => f.brand_id === b.id);
            const isSelected = brandId === b.id;
            const codeTail = b.slug.slice(0, 4).toUpperCase().padEnd(4, "0");
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setBrandId(isSelected ? "all" : b.id)}
                className={`${
                  idx % 2 === 0 ? "finora-glossy-card" : "finora-glossy-card-alt"
                } group relative flex min-w-[260px] max-w-[300px] flex-1 shrink-0 flex-col justify-between rounded-3xl p-5 text-left text-white transition duration-200 hover:-translate-y-0.5 ${
                  isSelected ? "ring-2 ring-white" : ""
                }`}
              >
                {/* Dekorasi lengkungan cahaya seperti kartu referensi Finora */}
                <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/15 blur-2xl" />
                <div className="flex items-center justify-between gap-3">
                  {idx % 2 === 0 ? (
                    <span className="truncate text-base font-black italic tracking-wider text-white/95">
                      {b.name.toUpperCase()}
                    </span>
                  ) : (
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="h-5 w-5 shrink-0 rounded-full bg-white/80" />
                      <span className="-ml-3 h-5 w-5 shrink-0 rounded-full bg-blue-200/60" />
                      <span className="ml-1 truncate text-sm font-bold text-white/95">{b.name}</span>
                    </div>
                  )}
                  <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-white/15 bg-black/25 px-3 py-1 text-[11px] font-semibold leading-none text-blue-100">
                    {isSelected ? "Filter Aktif ✓" : b.is_active ? "Brand Aktif" : "Nonaktif"}
                  </span>
                </div>

                <div className="my-5">
                  <p className="truncate text-xs font-medium text-blue-100/80">
                    Total Balance · {b.name}
                  </p>
                  <p className="mt-1 truncate text-2xl font-black tracking-tight text-white">
                    {formatIDR(bSum.net)}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-blue-100/75">
                    {b.segment ? b.segment : `In: ${formatIDR(bSum.income)} · Out: ${formatIDR(bSum.expense)}`}
                  </p>
                </div>

                <div className="flex items-center justify-between text-xs font-medium text-blue-100/85">
                  <span className="tracking-widest">**** {codeTail}</span>
                  <span>
                    {bSplit ? `${bSplit.dividend_pct}/${bSplit.management_fee_pct}/${bSplit.retained_pct}` : "11/26"}
                  </span>
                </div>
              </button>
            );
          })}

          {/* Kartu Aset & Hutang Perusahaan */}
          <Link
            href="/assets"
            className="finora-glossy-card-alt relative flex min-w-[260px] max-w-[300px] flex-1 shrink-0 flex-col justify-between rounded-3xl p-5 text-left text-white transition duration-200 hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <span className="h-5 w-5 shrink-0 rounded-full bg-white/80" />
                <span className="-ml-2.5 h-5 w-5 shrink-0 rounded-full bg-blue-300/60" />
              </div>
              <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-white/15 bg-white/15 px-3 py-1 text-[11px] font-semibold leading-none text-white">
                Portfolio
              </span>
            </div>
            <div className="my-5">
              <p className="text-xs font-medium text-blue-100/80">Nilai Investasi &amp; Aset</p>
              <p className="mt-1 truncate text-2xl font-black tracking-tight text-white">{formatIDR(totalAssets)}</p>
              <p className="mt-1 truncate text-[11px] text-blue-100/75">
                Sisa Hutang PT: {formatIDR(companyDebt)}
              </p>
            </div>
            <div className="flex items-center justify-between text-xs font-medium text-blue-100/85">
              <span className="tracking-widest">**** ASET</span>
              <span>OPEX {formatIDR(opexFixed)}</span>
            </div>
          </Link>
        </div>
      </section>

      {/* QUICK ACTIONS — Grid 2x4 Ikon Bulat/Kotak Gelap persis Finora */}
      <Card className="p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">Quick Actions</h3>
          <span className="text-xs text-blue-200/70">Pintasan langsung tanpa ambigu</span>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-3 sm:gap-4">
          {quickActions.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="group flex flex-col items-center text-center transition"
            >
              <div className="flex h-13 w-13 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.06] p-3.5 text-blue-100 shadow-inner transition group-hover:scale-105 group-hover:border-blue-400/50 group-hover:bg-blue-500/20 group-hover:text-white">
                {item.icon}
              </div>
              <span className="mt-2 text-xs font-semibold text-slate-100 group-hover:text-blue-300">
                {item.label}
              </span>
              <span className="hidden text-[10px] text-slate-400 sm:block">{item.sub}</span>
            </Link>
          ))}
        </div>
      </Card>

      {/* 4 Metrik Ringkas */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard label="Total Income" value={formatIDR(sum.income)} sub="Pemasukan terhitung" tone="positive" />
        <StatCard label="Pengeluaran Lunas" value={formatIDR(sum.expense)} sub="Sudah dibayar saja" tone="negative" />
        <StatCard label="Nilai Aset" value={formatIDR(totalAssets)} sub="Printer, bahan, inventaris" />
        <StatCard label="Hutang Perusahaan" value={formatIDR(companyDebt)} sub="Di luar hutang investor" tone="warning" />
      </div>

      {/* LAST TRANSACTIONS & BELUM REIMBURSE — Gaya daftar Finora dengan ikon & tombol View All ↗ */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Last Transactions */}
        <Card className="flex flex-col justify-between p-5">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Last Transactions</h3>
              <Link
                href="/transactions"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300"
              >
                <span>View All</span>
                <span>↗</span>
              </Link>
            </div>

            <ul className="mt-4 space-y-2.5">
              {filteredTxns.slice(0, 6).map((t) => {
                const isIncome = t.kind === "income";
                const isDebt = Boolean(t.liability_id);
                const isPending = t.payment_status === "belum_reimburse";
                return (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-3 transition hover:bg-white/[0.06]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-black ${
                          isIncome
                            ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30"
                            : isDebt
                            ? "bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30"
                            : isPending
                            ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30"
                            : "bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/30"
                        }`}
                      >
                        {isIncome ? "IN" : isDebt ? "CIC" : "OUT"}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{t.description}</p>
                        <p className="truncate text-xs text-slate-400">
                          {formatDateID(t.txn_date)} · {t.brands?.name ?? "Vektora"} · {t.category ?? "Operasional"}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p
                        className={`text-sm font-bold ${
                          isIncome ? "text-emerald-300" : isPending ? "text-amber-300" : "text-white"
                        }`}
                      >
                        {isIncome ? "+" : "−"}
                        {formatIDR(t.amount)}
                      </p>
                      <span
                        className={`text-[10px] font-medium ${
                          isPending ? "text-amber-300" : isDebt ? "text-blue-300" : "text-slate-400"
                        }`}
                      >
                        {isPending ? "Belum reimburse" : isDebt ? "Cicilan hutang" : "Sudah dibayar"}
                      </span>
                    </div>
                  </li>
                );
              })}
              {filteredTxns.length === 0 && (
                <li className="rounded-2xl border border-white/5 bg-white/[0.02] py-8 text-center text-sm text-slate-400">
                  Belum ada transaksi tercatat.
                </li>
              )}
            </ul>
          </div>
        </Card>

        {/* Kolom Kanan: Belum Reimburse & Pembagian Fee */}
        <div className="space-y-4">
          {/* Belum Reimburse */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-white">
                  Antrean Reimburse · <span className="text-amber-300">{formatIDR(sum.belumReimburse)}</span>
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Dicatat tetapi belum mengurangi saldo sampai ditandai Sudah dibayar.
                </p>
              </div>
              <Link
                href="/transactions?status=belum_reimburse"
                className="shrink-0 rounded-xl border border-amber-400/30 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/25"
              >
                Kelola ↗
              </Link>
            </div>
            <ul className="mt-3 space-y-2">
              {belumList.length === 0 && (
                <li className="rounded-xl bg-white/[0.03] px-3 py-2.5 text-xs text-slate-400">
                  Tidak ada tunggakan reimburse. Semua pengeluaran sudah dibayar.
                </li>
              )}
              {belumList.slice(0, 4).map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-100">{t.description}</p>
                    <p className="text-[11px] text-slate-400">
                      {formatDateID(t.txn_date)} · {t.brands?.name}
                    </p>
                  </div>
                  <span className="shrink-0 font-bold text-amber-300">{formatIDR(t.amount)}</span>
                </li>
              ))}
            </ul>
          </Card>

          {/* Pembagian Fee Per Brand */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3 className="text-base font-bold text-white">Pembagian Fee</h3>
                  {activeSplit && (
                    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-blue-500/20 px-3.5 py-1 text-xs font-semibold leading-none text-blue-200 ring-1 ring-blue-400/30">
                      {brands.find((b) => b.id === activeSplit.brand_id)?.name ?? "—"} ·{" "}
                      {activeSplit.dividend_pct}/{activeSplit.management_fee_pct}/{activeSplit.retained_pct}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Laba bersih brand ini: <b className="text-white">{formatIDR(activeSplitNet)}</b> (dihitung per brand)
                </p>
              </div>
              <Link
                href="/fee-split"
                className="shrink-0 text-xs font-semibold text-blue-400 hover:text-blue-300"
              >
                Detail ↗
              </Link>
            </div>

            {activeSplitNet <= 0 && (
              <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Laba brand ini masih ≤ Rp0 — semua distribusi dividen &amp; fee otomatis Rp0.
              </p>
            )}

            {fee ? (
              <div className="mt-3 grid grid-cols-3 gap-2.5">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-[11px] text-blue-200/75">Dividen ({activeSplit?.dividend_pct}%)</p>
                  <p className="mt-1 text-sm font-bold text-white sm:text-base">{formatIDR(fee.dividend)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-[11px] text-blue-200/75">Mgmt Fee ({activeSplit?.management_fee_pct}%)</p>
                  <p className="mt-1 text-sm font-bold text-white sm:text-base">{formatIDR(fee.managementFee)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-[11px] text-blue-200/75">Ditahan ({activeSplit?.retained_pct}%)</p>
                  <p className="mt-1 text-sm font-bold text-white sm:text-base">{formatIDR(fee.retained)}</p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-400">Belum ada konfigurasi fee split untuk brand ini.</p>
            )}
          </Card>
        </div>
      </div>

      <p className="text-center text-xs text-slate-500">
        Sinkronisasi terakhir: {lastLoadedAt ? lastLoadedAt.toLocaleString("id-ID") : "—"} · {txns.length} transaksi
        dimuat
      </p>
    </div>
  );
}

