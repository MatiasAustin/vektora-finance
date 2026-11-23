"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { computeFeeSplit, summarize } from "@/lib/types";
import type { Brand, FeeSplitRow, TransactionRow } from "@/lib/types";
import { formatIDR } from "@/lib/format";
import { BrandSelect, Card, EmptySupabase, ReadOnlyNotice } from "@/components/ui";
import { canEditFeeSplit, useAuth } from "@/lib/auth";
import { useBrandsChannels } from "@/lib/useData";

export default function FeeSplitPage() {
  const { role, loading: authLoading } = useAuth();
  const { brands } = useBrandsChannels();
  const [splits, setSplits] = useState<FeeSplitRow[]>([]);
  const [txns, setTxns] = useState<TransactionRow[]>([]);
  const [brandId, setBrandId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  async function load() {
    const sb = getSupabase();
    if (!sb) return setLoading(false);
    const [f, t] = await Promise.all([
      sb.from("fee_splits").select("*, brands(name)").order("effective_from", { ascending: false }),
      sb.from("transactions").select("*").order("txn_date", { ascending: false }).limit(500),
    ]);
    if (f.data) setSplits(f.data as FeeSplitRow[]);
    if (t.data) setTxns(t.data as TransactionRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  // BUG 24 Nov 2026 (diperbaiki): sebelumnya halaman ini menghitung SATU laba
  // global dari semua transaksi, lalu menerapkan laba yang sama ke tiap kartu
  // fee-split per brand — sehingga Moonimo (belum ada transaksi) ikut
  // menampilkan pembagian WhereIsIt. Sekarang laba dihitung PER BRAND dari
  // transaksi brand itu sendiri; brand tanpa transaksi / laba <= 0 = Rp0.
  // Filter brand: "Semua brand" menampilkan semua kartu (masing-masing dengan
  // labanya sendiri); satu brand menampilkan hanya kartu brand itu.
  const visibleSplits = useMemo(() => splits.filter((s) => brandId === "all" || s.brand_id === brandId), [splits, brandId]);
  const brandSum = useMemo(
    () => (bid: string) => summarize(txns.filter((t) => t.brand_id === bid)),
    [txns]
  );
  const totalNet = useMemo(
    () => visibleSplits.reduce((s, sp) => s + brandSum(sp.brand_id).net, 0),
    [visibleSplits, brandSum]
  );

  async function save(e: React.FormEvent, split: FeeSplitRow, patch: Partial<FeeSplitRow>) {
    e.preventDefault();
    if (!canEditFeeSplit(role)) return;
    const sb = getSupabase();
    if (!sb) return;
    const next = { ...split, ...patch };
    if (Number(next.dividend_pct) + Number(next.management_fee_pct) + Number(next.retained_pct) !== 100) {
      setMsg("Total persentase harus 100%.");
      return;
    }
    const { error } = await sb.from("fee_splits").update({
      dividend_pct: next.dividend_pct, management_fee_pct: next.management_fee_pct, retained_pct: next.retained_pct,
    }).eq("id", split.id);
    if (error) setMsg("Gagal simpan: " + error.message);
    else { setMsg("Fee split tersimpan."); load(); }
  }

  if (!isSupabaseConfigured) return <EmptySupabase />;
  if (loading || authLoading) return <p className="text-slate-500">Memuat…</p>;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Pembagian Fee</h2><BrandSelect brands={brands} value={brandId} onChange={setBrandId} /></div>
      <Card>
        <p className="text-sm text-slate-600">
          Laba bersih dihitung <b>per brand</b> dari transaksi brand itu sendiri (Income − Pengeluaran
          terhitung; Belum reimburse tidak masuk hitungan). <b>Bila laba ≤ 0, semua pembagian = Rp0.</b>
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          {visibleSplits.map((s) => {
            const bs = brandSum(s.brand_id);
            return (
              <li key={s.id} className="flex flex-wrap justify-between gap-2">
                <span>{s.brands?.name}</span>
                <span>
                  Laba <b>{formatIDR(bs.net)}</b> (Income {formatIDR(bs.income)} − Pengeluaran{" "}
                  {formatIDR(bs.expense)})
                </span>
              </li>
            );
          })}
          <li className="flex flex-wrap justify-between gap-2 border-t pt-1">
            <span>Total yang tampil</span>
            <b>{formatIDR(totalNet)}</b>
          </li>
        </ul>
        {msg && <p className="mt-2 text-sm">{msg}</p>}
      </Card>
      {visibleSplits.map((s) => {
        const bs = brandSum(s.brand_id);
        const fee = computeFeeSplit(bs.net, s);
        return (
          <Card key={s.id}>
            <h3 className="font-bold">{s.brands?.name} — {s.dividend_pct}% / {s.management_fee_pct}% / {s.retained_pct}%</h3>
            <p className="text-sm text-slate-600">
              Laba {s.brands?.name}: <b>{formatIDR(bs.net)}</b>
            </p>
            {bs.net <= 0 && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Belum ada transaksi / belum ada laba — pembagian Rp0. Bukan angka brand lain.
              </p>
            )}
            {canEditFeeSplit(role) ? (<form onSubmit={(e) => save(e, s, {})} className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-sm">Dividen % <input type="number" step="0.01" defaultValue={s.dividend_pct} onChange={(e) => { s.dividend_pct = Number(e.target.value); }} className="ml-1 w-20 rounded-xl border px-2 py-1" /></label>
              <label className="text-sm">Management Fee % <input type="number" step="0.01" defaultValue={s.management_fee_pct} onChange={(e) => { s.management_fee_pct = Number(e.target.value); }} className="ml-1 w-20 rounded-xl border px-2 py-1" /></label>
              <label className="text-sm">Ditahan % <input type="number" step="0.01" defaultValue={s.retained_pct} onChange={(e) => { s.retained_pct = Number(e.target.value); }} className="ml-1 w-20 rounded-xl border px-2 py-1" /></label>
              <button className="rounded-xl bg-vektora-500 px-4 py-2 text-sm font-semibold text-white">Simpan persentase</button>
            </form>) : (<ReadOnlyNotice role={role} />)}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Dividen</p><p className="text-xl font-bold">{formatIDR(fee.dividend)}</p>{fee.dividendBreakdown.map((r) => <p key={r.name} className="text-sm text-slate-600">{r.name}: {formatIDR(r.amount)}</p>)}</div>
              <div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Management Fee</p><p className="text-xl font-bold">{formatIDR(fee.managementFee)}</p>{fee.feeBreakdown.map((r) => <p key={r.name} className="text-sm text-slate-600">{r.name}: {formatIDR(r.amount)}</p>)}</div>
              <div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Ditahan perusahaan</p><p className="text-xl font-bold">{formatIDR(fee.retained)}</p><p className="text-sm text-slate-600">Untuk perusahaan, bukan dibagikan.</p></div>
            </div>
            <p className="mt-3 text-xs text-slate-500">Contoh WhereIsIt Nov 2026 (setelah seed-latest): laba Rp417.118 → Dividen Rp83.424 (Febri 70% Rp58.397 / Matias 30% Rp25.027), Management Fee Rp229.415, Ditahan Rp104.279. Penerima di dalam fee (mis. Komisaris 7% + 7% dari fee pool) diubah di Supabase / tabel fee_splits.</p>
          </Card>
        );
      })}
      {visibleSplits.length === 0 && <Card><p className="text-sm text-slate-500">Belum ada konfigurasi fee split untuk brand ini.</p></Card>}
    </div>
  );
}
