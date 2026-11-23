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

  const filtered = useMemo(() => (brandId === "all" ? txns : txns.filter((t) => t.brand_id === brandId)), [txns, brandId]);
  const sum = useMemo(() => summarize(filtered), [filtered]);
  const visibleSplits = useMemo(() => splits.filter((s) => brandId === "all" || s.brand_id === brandId), [splits, brandId]);

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
          Laba bersih periode ini (semua transaksi yang tampil): <b>{formatIDR(sum.net)}</b> — Income{" "}
          {formatIDR(sum.income)} − Pengeluaran terhitung {formatIDR(sum.expense)}. Belum reimburse{" "}
          {formatIDR(sum.belumReimburse)} tidak masuk hitungan. <b>Bila laba ≤ 0, semua pembagian = Rp0.</b>
        </p>
        {msg && <p className="mt-2 text-sm">{msg}</p>}
      </Card>
      {visibleSplits.map((s) => {
        const fee = computeFeeSplit(sum.net, s);
        return (
          <Card key={s.id}>
            <h3 className="font-bold">{s.brands?.name} — {s.dividend_pct}% / {s.management_fee_pct}% / {s.retained_pct}%</h3>
            {canEditFeeSplit(role) ? (<form onSubmit={(e) => save(e, s, {})} className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-sm">Dividen % <input type="number" step="0.01" defaultValue={s.dividend_pct} onChange={(e) => { s.dividend_pct = Number(e.target.value); }} className="ml-1 w-20 rounded-xl border px-2 py-1" /></label>
              <label className="text-sm">Management Fee % <input type="number" step="0.01" defaultValue={s.management_fee_pct} onChange={(e) => { s.management_fee_pct = Number(e.target.value); }} className="ml-1 w-20 rounded-xl border px-2 py-1" /></label>
              <label className="text-sm">Ditahan % <input type="number" step="0.01" defaultValue={s.retained_pct} onChange={(e) => { s.retained_pct = Number(e.target.value); }} className="ml-1 w-20 rounded-xl border px-2 py-1" /></label>
              <button className="rounded-xl bg-vektora-500 px-4 py-2 text-sm font-semibold text-white">Simpan persentase</button>
            </form>) : (<ReadOnlyNotice role={role} />)}
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Dividen</p><p className="text-xl font-bold">{formatIDR(fee.dividend)}</p>{fee.dividendBreakdown.map((r) => <p key={r.name} className="text-sm text-slate-600">{r.name}: {formatIDR(r.amount)}</p>)}</div>
              <div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Management Fee</p><p className="text-xl font-bold">{formatIDR(fee.managementFee)}</p>{fee.feeBreakdown.map((r) => <p key={r.name} className="text-sm text-slate-600">{r.name}: {formatIDR(r.amount)}</p>)}</div>
              <div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Ditahan perusahaan</p><p className="text-xl font-bold">{formatIDR(fee.retained)}</p><p className="text-sm text-slate-600">Untuk perusahaan, bukan dibagikan.</p></div>
            </div>
            <p className="mt-3 text-xs text-slate-500">Contoh WhereIsIt Nov 2026: laba Rp159.395 → Dividen Rp31.879 (Febri 70% Rp22.315 / Matias 30% Rp9.564), Management Fee Rp87.667, Ditahan Rp39.849. Penerima di dalam fee (mis. Komisaris 7% + 7% dari fee pool) diubah di Supabase / tabel fee_splits.</p>
          </Card>
        );
      })}
      {visibleSplits.length === 0 && <Card><p className="text-sm text-slate-500">Belum ada konfigurasi fee split untuk brand ini.</p></Card>}
    </div>
  );
}
