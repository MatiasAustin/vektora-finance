"use client";

import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    async function load() {
      const sb = getSupabase();
      if (!sb) {
        setLoading(false);
        return;
      }
      const [b, t, a, l, e, f] = await Promise.all([
        sb.from("brands").select("*").eq("is_active", true).order("name"),
        sb.from("transactions").select("*, brands(name), channels(name)").order("txn_date", { ascending: false }).limit(200),
        sb.from("assets").select("*, brands(name)"),
        sb.from("liabilities").select("*, brands(name)"),
        sb.from("employees").select("*, brands(name)").eq("is_active", true),
        sb.from("fee_splits").select("*, brands(name)"),
      ]);
      if (b.data) setBrands(b.data as Brand[]);
      if (t.data) setTxns(t.data as TransactionRow[]);
      if (a.data) setAssets(a.data as AssetRow[]);
      if (l.data) setLiabilities(l.data as LiabilityRow[]);
      if (e.data) setEmployees(e.data as EmployeeRow[]);
      if (f.data) setFeeSplits(f.data as FeeSplitRow[]);
      setLoading(false);
    }
    load();
  }, []);

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
  const activeSplit = useMemo(
    () => feeSplits.find((f) => (brandId === "all" ? f.brand_id === brands[0]?.id : f.brand_id === brandId)),
    [feeSplits, brandId, brands]
  );
  const fee = useMemo(
    () => (activeSplit ? computeFeeSplit(sum.net, activeSplit) : null),
    [sum.net, activeSplit]
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
        <div>
          <p className="text-sm text-slate-500">Halo, {profile?.full_name ?? "tim Vektora"}!</p>
          <h2 className="text-xl font-bold">Ringkasan keuangan</h2>
        </div>
        <BrandSelect brands={brands} value={brandId} onChange={setBrandId} />
      </div>

      {/* Total Balance — gaya Finora */}
      <div className="rounded-3xl bg-gradient-to-br from-vektora-500 via-vektora-600 to-vektora-900 p-6 text-white shadow-lg">
        <p className="text-sm text-blue-200">Total Saldo (terhitung)</p>
        <p className="mt-1 text-4xl font-black">{formatIDR(sum.net)}</p>
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
            Hanya bila laba bersih &gt; 0. Laba sekarang: {formatIDR(sum.net)}
          </p>
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
