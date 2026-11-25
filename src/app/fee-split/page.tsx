"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { computeFeeSplit, summarize } from "@/lib/types";
import type { DividendPayout, FeeSplitRow, Profile, TransactionRow } from "@/lib/types";
import { formatDateID, formatIDR } from "@/lib/format";
import { AccessDenied, BrandSelect, Card, EmptySupabase, ReadOnlyNotice } from "@/components/ui";
import { canEdit, canEditFeeSplit, canViewOperations, ROLE_LABELS, useAuth } from "@/lib/auth";
import { useBrandsChannels } from "@/lib/useData";

type RecipientDraft = {
  name: string;
  pct: number;
  employee_id: string | null;
  profile_id: string | null;
};

type SplitPctDraft = {
  dividend_pct: number;
  management_fee_pct: number;
  retained_pct: number;
};

export default function FeeSplitPage() {
  const { role, loading: authLoading } = useAuth();
  const { brands } = useBrandsChannels();
  const [splits, setSplits] = useState<FeeSplitRow[]>([]);
  const [txns, setTxns] = useState<TransactionRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [brandId, setBrandId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { dividend: RecipientDraft[]; fee: RecipientDraft[] }>>({});
  const [pctDrafts, setPctDrafts] = useState<Record<string, SplitPctDraft>>({});
  const [year, setYear] = useState(2026);
  const [yearTxns, setYearTxns] = useState<TransactionRow[]>([]);
  const [payouts, setPayouts] = useState<DividendPayout[]>([]);
  const [divMsg, setDivMsg] = useState("");
  const [selectedPayout, setSelectedPayout] = useState<DividendPayout | null>(null);
  const [sendVia, setSendVia] = useState<"whatsapp" | "email" | "langsung">("whatsapp");
  const [feeSlip, setFeeSlip] = useState<{ kind: "fee" | "dividend"; splitId: string; name: string } | null>(null);
  const [feeSlipMonth, setFeeSlipMonth] = useState(new Date().toISOString().slice(0, 7));
  const [monthTxns, setMonthTxns] = useState<TransactionRow[]>([]);

  async function load() {
    const sb = getSupabase();
    if (!sb) return setLoading(false);
    const [f, t, p] = await Promise.all([
      sb.from("fee_splits").select("*, brands(name)").order("effective_from", { ascending: false }),
      sb.from("transactions").select("*").order("txn_date", { ascending: false }).limit(500),
      sb.from("profiles").select("*").eq("active", true).order("full_name"),
    ]);
    if (f.data) setSplits(f.data as FeeSplitRow[]);
    if (t.data) setTxns(t.data as TransactionRow[]);
    if (p.data) setProfiles(p.data as Profile[]);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const d: Record<string, { dividend: RecipientDraft[]; fee: RecipientDraft[] }> = {};
    const p: Record<string, SplitPctDraft> = {};
    for (const s of splits) {
      d[s.id] = {
        dividend: (s.dividend_recipients ?? []).map((r) => ({
          name: r.name,
          pct: r.pct_of_dividend,
          employee_id: r.employee_id ?? null,
          profile_id: r.profile_id ?? null,
        })),
        fee: (s.management_fee_recipients ?? []).map((r) => ({
          name: r.name,
          pct: r.pct_of_fee,
          employee_id: r.employee_id ?? null,
          profile_id: r.profile_id ?? null,
        })),
      };
      p[s.id] = {
        dividend_pct: Number(s.dividend_pct) || 0,
        management_fee_pct: Number(s.management_fee_pct) || 0,
        retained_pct: Number(s.retained_pct) || 0,
      };
    }
    setDrafts(d);
    setPctDrafts(p);
  }, [splits]);

  async function loadAnnual(y: number) {
    const sb = getSupabase();
    if (!sb) return;
    const [t, p] = await Promise.all([
      sb.from("transactions").select("*").gte("txn_date", `${y}-01-01`).lte("txn_date", `${y}-12-31`).limit(5000),
      sb
        .from("dividend_payouts")
        .select("*, brands(name)")
        .eq("year", y)
        .order("brand_id")
        .order("recipient_name"),
    ]);
    if (t.data) setYearTxns(t.data as TransactionRow[]);
    if (p.data) setPayouts(p.data as DividendPayout[]);
  }
  useEffect(() => {
    loadAnnual(year);
  }, [year]);

  const visibleSplits = useMemo(
    () => splits.filter((s) => brandId === "all" || s.brand_id === brandId),
    [splits, brandId]
  );
  const brandSum = useMemo(
    () => (bid: string) => summarize(txns.filter((t) => t.brand_id === bid)),
    [txns]
  );
  const totalNet = useMemo(
    () => visibleSplits.reduce((s, sp) => s + brandSum(sp.brand_id).net, 0),
    [visibleSplits, brandSum]
  );

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  function profileDisplayName(id: string | null | undefined): string {
    if (!id) return "";
    const p = profileById.get(id);
    return p ? p.full_name ?? p.email ?? "" : "";
  }
  function recipientLabel(name: string, profile_id?: string | null): string {
    const person = profileDisplayName(profile_id);
    if (!person) return name;
    if (name.toLowerCase().includes(person.toLowerCase().split(" ")[0])) return name;
    return `${name} — ${person}`;
  }
  function pickProfileForDraft(
    splitId: string,
    kind: "dividend" | "fee",
    idx: number,
    profileId: string
  ) {
    const p = profileId ? profileById.get(profileId) : undefined;
    updateDraft(splitId, kind, idx, {
      profile_id: profileId || null,
      employee_id: p?.employee_id ?? null,
    });
  }

  const payoutLabel = useMemo(() => {
    if (!selectedPayout) return "";
    const split = splits.find((s) => s.brand_id === selectedPayout.brand_id);
    const rec = split?.dividend_recipients?.find((r) => r.name === selectedPayout.recipient_name);
    return recipientLabel(selectedPayout.recipient_name, rec?.profile_id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPayout, splits, profileById]);

  const editable = canEdit(role);
  const annualSum = useMemo(
    () => (bid: string) => summarize(yearTxns.filter((t) => t.brand_id === bid)),
    [yearTxns]
  );
  const annualFee = useMemo(
    () => (s: FeeSplitRow) => computeFeeSplit(annualSum(s.brand_id).net, s),
    [annualSum]
  );
  const payoutsFor = useMemo(
    () => (bid: string) => payouts.filter((p) => p.brand_id === bid),
    [payouts]
  );

  async function createPayouts() {
    if (!editable) return;
    const sb = getSupabase();
    if (!sb) return;
    const rows: {
      brand_id: string;
      year: number;
      recipient_name: string;
      pct_of_dividend: number;
      amount: number;
      status: string;
    }[] = [];
    for (const s of visibleSplits) {
      const fee = annualFee(s);
      if (fee.dividend <= 0) continue;
      const pctByName = new Map(
        (s.dividend_recipients ?? []).map((r) => [r.name, r.pct_of_dividend])
      );
      for (const r of fee.dividendBreakdown) {
        rows.push({
          brand_id: s.brand_id,
          year,
          recipient_name: r.name,
          pct_of_dividend: pctByName.get(r.name) ?? 0,
          amount: r.amount,
          status: "belum_dibayar",
        });
      }
    }
    if (rows.length === 0) {
      setDivMsg(
        `Tidak ada dividen untuk dicairkan di ${year} (laba tahunan ≤ 0 untuk brand yang tampil).`
      );
      return;
    }
    const { error } = await sb
      .from("dividend_payouts")
      .upsert(rows, { onConflict: "brand_id,year,recipient_name", ignoreDuplicates: true });
    if (error) setDivMsg("Gagal buat pencairan: " + error.message);
    else {
      setDivMsg(
        `Pencairan dividen ${year} dibuat (${rows.length} penerima). Jumlah dibekukan saat dibuat.`
      );
      loadAnnual(year);
    }
  }

  async function togglePayout(p: DividendPayout) {
    if (!editable) return;
    const sb = getSupabase();
    if (!sb) return;
    const paid = p.status !== "sudah_dibayar";
    const { error } = await sb
      .from("dividend_payouts")
      .update({
        status: paid ? "sudah_dibayar" : "belum_dibayar",
        paid_at: paid ? new Date().toISOString() : null,
      })
      .eq("id", p.id);
    if (error) setDivMsg("Gagal ubah status: " + error.message);
    else loadAnnual(year);
  }

  async function updatePayout(p: DividendPayout, patch: Partial<DividendPayout>) {
    if (!editable) return;
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from("dividend_payouts").update(patch).eq("id", p.id);
    if (error) setDivMsg("Gagal simpan: " + error.message);
    else {
      setSelectedPayout((cur) => (cur && cur.id === p.id ? { ...cur, ...patch } : cur));
      loadAnnual(year);
    }
  }

  function waLinkDiv(p: DividendPayout): string {
    const text = `Slip Dividen — PT Vektora Teknologi Nusantara\n${
      payoutLabel || p.recipient_name
    } · ${p.brands?.name ?? ""}\nTahun: ${p.year}\nBagian dividen: ${p.pct_of_dividend}% = ${formatIDR(
      p.amount
    )}\nStatus: ${p.status === "sudah_dibayar" ? "Sudah dibayar" : "Belum dibayar"}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  async function loadMonthTxns(bId: string, month: string) {
    const sb = getSupabase();
    if (!sb) return;
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const { data } = await sb
      .from("transactions")
      .select("*")
      .eq("brand_id", bId)
      .gte("txn_date", `${month}-01`)
      .lte("txn_date", `${month}-${String(lastDay).padStart(2, "0")}`)
      .limit(5000);
    if (data) setMonthTxns(data as TransactionRow[]);
  }
  useEffect(() => {
    if (!feeSlip) return;
    const split = splits.find((s) => s.id === feeSlip.splitId);
    if (split) loadMonthTxns(split.brand_id, feeSlipMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeSlip, feeSlipMonth]);

  const feeSlipData = useMemo(() => {
    if (!feeSlip) return null;
    const split = splits.find((s) => s.id === feeSlip.splitId);
    if (!split) return null;
    const net = summarize(monthTxns.filter((t) => t.brand_id === split.brand_id)).net;
    const fee = computeFeeSplit(net, split);
    const row =
      feeSlip.kind === "fee"
        ? fee.feeBreakdown.find((r) => r.name === feeSlip.name)
        : fee.dividendBreakdown.find((r) => r.name === feeSlip.name);
    if (!row) return null;
    return { split, net, fee, row, label: recipientLabel(row.name, row.profile_id) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeSlip, splits, monthTxns, profileById]);

  function waLinkFee(): string {
    if (!feeSlip || !feeSlipData) return "";
    const { split, row, label } = feeSlipData;
    const text = `Slip ${label} — PT Vektora Teknologi Nusantara\n${label} · ${
      split.brands?.name ?? ""
    }\nPeriode: ${feeSlipMonth}\nBagian ${
      feeSlip.kind === "fee" ? "Management Fee" : "dividen"
    }: ${row.pct}% = ${formatIDR(row.amount)}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  async function savePct(e: React.FormEvent, split: FeeSplitRow) {
    e.preventDefault();
    if (!canEditFeeSplit(role)) return;
    const sb = getSupabase();
    if (!sb) return;
    const pd = pctDrafts[split.id] ?? {
      dividend_pct: split.dividend_pct,
      management_fee_pct: split.management_fee_pct,
      retained_pct: split.retained_pct,
    };
    const totalPct =
      Number(pd.dividend_pct) + Number(pd.management_fee_pct) + Number(pd.retained_pct);
    if (Math.round(totalPct * 100) !== 10000) {
      setMsg(`Total persentase saat ini ${totalPct}%, harus tepat 100%.`);
      return;
    }
    const { error } = await sb
      .from("fee_splits")
      .update({
        dividend_pct: Number(pd.dividend_pct),
        management_fee_pct: Number(pd.management_fee_pct),
        retained_pct: Number(pd.retained_pct),
      })
      .eq("id", split.id);
    if (error) setMsg("Gagal simpan: " + error.message);
    else {
      setMsg(`Rasio pembagian fee ${split.brands?.name ?? ""} berhasil disimpan.`);
      load();
    }
  }

  function draftTotal(list: RecipientDraft[]): number {
    return list.reduce((s, r) => s + (Number(r.pct) || 0), 0);
  }

  async function saveRecipients(split: FeeSplitRow) {
    if (!canEditFeeSplit(role)) return;
    const d = drafts[split.id];
    if (!d) return;
    const divTotal = draftTotal(d.dividend);
    const feeTotal = draftTotal(d.fee);
    if (d.dividend.length > 0 && Math.round(divTotal * 100) !== 10000) {
      setMsg(
        `Total % penerima dividen ${split.brands?.name ?? ""} = ${divTotal}%, harus tepat 100%.`
      );
      return;
    }
    if (d.fee.length > 0 && Math.round(feeTotal * 100) !== 10000) {
      setMsg(
        `Total % penerima Management Fee ${
          split.brands?.name ?? ""
        } = ${feeTotal}%, harus tepat 100%.`
      );
      return;
    }
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb
      .from("fee_splits")
      .update({
        dividend_recipients: d.dividend.map((r) => ({
          name: r.name.trim(),
          pct_of_dividend: Number(r.pct) || 0,
          employee_id: r.employee_id || null,
          profile_id: r.profile_id || null,
        })),
        management_fee_recipients: d.fee.map((r) => ({
          name: r.name.trim(),
          pct_of_fee: Number(r.pct) || 0,
          employee_id: r.employee_id || null,
          profile_id: r.profile_id || null,
        })),
      })
      .eq("id", split.id);
    if (error) setMsg("Gagal simpan penerima: " + error.message);
    else {
      setMsg(`Daftar penerima fee & dividen ${split.brands?.name ?? ""} tersimpan.`);
      load();
    }
  }

  function updateDraft(
    splitId: string,
    kind: "dividend" | "fee",
    idx: number,
    patch: Partial<RecipientDraft>
  ) {
    setDrafts((prev) => {
      const cur = prev[splitId];
      if (!cur) return prev;
      const list = [...cur[kind]];
      list[idx] = { ...list[idx], ...patch };
      return { ...prev, [splitId]: { ...cur, [kind]: list } };
    });
  }

  function addDraftRow(splitId: string, kind: "dividend" | "fee") {
    setDrafts((prev) => {
      const cur = prev[splitId];
      if (!cur) return prev;
      return {
        ...prev,
        [splitId]: {
          ...cur,
          [kind]: [...cur[kind], { name: "", pct: 0, employee_id: null, profile_id: null }],
        },
      };
    });
  }

  function removeDraftRow(splitId: string, kind: "dividend" | "fee", idx: number) {
    setDrafts((prev) => {
      const cur = prev[splitId];
      if (!cur) return prev;
      const list = [...cur[kind]];
      list.splice(idx, 1);
      return { ...prev, [splitId]: { ...cur, [kind]: list } };
    });
  }

  if (!isSupabaseConfigured) return <EmptySupabase />;
  if (loading || authLoading) return <p className="text-blue-200/70">Memuat pembagian fee…</p>;
  if (!canViewOperations(role)) return <AccessDenied />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Pembagian Fee &amp; Dividen</h2>
          <p className="text-xs text-blue-200/75">
            Distribusi Laba Bersih per Brand ke Dividen Pemodal, Management Fee, dan Laba Ditahan Perusahaan.
          </p>
        </div>
        <BrandSelect brands={brands} value={brandId} onChange={setBrandId} />
      </div>

      {/* Ringkasan Laba Per Brand */}
      <Card>
        <p className="text-xs text-blue-100/80">
          Laba bersih dihitung <b className="text-white">terpisah per brand</b> (Income − Pengeluaran Lunas; Belum
          reimburse &amp; cicilan hutang tidak mengurangi laba). <b className="text-amber-200">Bila laba ≤ Rp0, distribusi otomatis Rp0.</b>
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {visibleSplits.map((s) => {
            const bs = brandSum(s.brand_id);
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5"
              >
                <span className="font-bold text-white">{s.brands?.name}</span>
                <span className="text-xs text-slate-300">
                  Laba Bersih: <b className="text-sm text-emerald-300">{formatIDR(bs.net)}</b> (Income{" "}
                  {formatIDR(bs.income)} − Pengeluaran {formatIDR(bs.expense)})
                </span>
              </li>
            );
          })}
          <li className="flex flex-wrap justify-between gap-2 border-t border-white/10 pt-2 text-sm">
            <span className="text-slate-300">Total Laba Bersih Brand yang Ditampilkan</span>
            <b className="text-white">{formatIDR(totalNet)}</b>
          </li>
        </ul>
        {msg && (
          <p className="mt-3 rounded-xl border border-blue-400/30 bg-blue-500/15 px-3 py-2 text-xs text-blue-200">
            {msg}
          </p>
        )}
      </Card>

      {/* Kartu Konfigurasi & Rincian per Brand */}
      {visibleSplits.map((s) => {
        const bs = brandSum(s.brand_id);
        const fee = computeFeeSplit(bs.net, s);
        const pd = pctDrafts[s.id] ?? {
          dividend_pct: s.dividend_pct,
          management_fee_pct: s.management_fee_pct,
          retained_pct: s.retained_pct,
        };
        const sumPct =
          (Number(pd.dividend_pct) || 0) +
          (Number(pd.management_fee_pct) || 0) +
          (Number(pd.retained_pct) || 0);

        return (
          <Card key={s.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-white">
                  {s.brands?.name} — Rasio {s.dividend_pct}% / {s.management_fee_pct}% / {s.retained_pct}%
                </h3>
                <p className="text-xs text-blue-200/80">
                  Laba Bersih {s.brands?.name}: <b className="text-white">{formatIDR(bs.net)}</b>
                </p>
              </div>
              <span className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-200 ring-1 ring-blue-400/30">
                Dividen / Mgmt Fee / Ditahan
              </span>
            </div>

            {bs.net <= 0 && (
              <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-200">
                Belum ada transaksi / laba bersih masih ≤ Rp0 — seluruh pembagian untuk brand ini Rp0.
              </p>
            )}

            {/* Form Persentase Terkontrol dengan Validasi Live 100% */}
            {canEditFeeSplit(role) ? (
              <form
                onSubmit={(e) => savePct(e, s)}
                className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-black/20 p-3.5"
              >
                <label className="text-xs text-blue-200/80">
                  Dividen (%)
                  <input
                    type="number"
                    step="0.01"
                    value={pd.dividend_pct}
                    onChange={(e) =>
                      setPctDrafts((prev) => ({
                        ...prev,
                        [s.id]: { ...pd, dividend_pct: Number(e.target.value) },
                      }))
                    }
                    className="mt-1 block w-24 rounded-xl border px-3 py-1.5 text-sm font-bold"
                  />
                </label>
                <label className="text-xs text-blue-200/80">
                  Management Fee (%)
                  <input
                    type="number"
                    step="0.01"
                    value={pd.management_fee_pct}
                    onChange={(e) =>
                      setPctDrafts((prev) => ({
                        ...prev,
                        [s.id]: { ...pd, management_fee_pct: Number(e.target.value) },
                      }))
                    }
                    className="mt-1 block w-24 rounded-xl border px-3 py-1.5 text-sm font-bold"
                  />
                </label>
                <label className="text-xs text-blue-200/80">
                  Ditahan Perusahaan (%)
                  <input
                    type="number"
                    step="0.01"
                    value={pd.retained_pct}
                    onChange={(e) =>
                      setPctDrafts((prev) => ({
                        ...prev,
                        [s.id]: { ...pd, retained_pct: Number(e.target.value) },
                      }))
                    }
                    className="mt-1 block w-24 rounded-xl border px-3 py-1.5 text-sm font-bold"
                  />
                </label>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                      sumPct === 100
                        ? "bg-emerald-500/20 text-emerald-200"
                        : "bg-rose-500/20 text-rose-200"
                    }`}
                  >
                    Total: {sumPct}%
                  </span>
                  <button
                    type="submit"
                    disabled={sumPct !== 100}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow shadow-blue-600/30 transition hover:bg-blue-500 disabled:opacity-40"
                  >
                    Simpan Rasio
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-3">
                <ReadOnlyNotice role={role} />
              </div>
            )}

            {/* 3 Kolom Distribusi: Dividen, Management Fee, Ditahan */}
            <div className="mt-4 grid grid-cols-1 gap-3.5 lg:grid-cols-3">
              {/* Dividen */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-200/75">
                  Pool Dividen ({s.dividend_pct}%)
                </p>
                <p className="mt-1 text-2xl font-black text-white">{formatIDR(fee.dividend)}</p>
                <ul className="mt-3 space-y-2">
                  {fee.dividendBreakdown.map((r) => (
                    <li
                      key={r.name}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-black/20 px-3 py-2 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-white">{recipientLabel(r.name, r.profile_id)}</p>
                        <p className="text-slate-400">
                          {r.pct}% · <b className="text-emerald-300">{formatIDR(r.amount)}</b>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFeeSlip({ kind: "dividend", splitId: s.id, name: r.name })}
                        className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-2.5 py-1 text-[11px] font-semibold text-blue-200 hover:bg-blue-500/30"
                      >
                        Cetak Slip Dividen
                      </button>
                    </li>
                  ))}
                  {fee.dividendBreakdown.length === 0 && (
                    <li className="text-xs text-slate-400">Belum ada penerima dividen.</li>
                  )}
                </ul>
              </div>

              {/* Management Fee */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-200/75">
                  Pool Management Fee ({s.management_fee_pct}%)
                </p>
                <p className="mt-1 text-2xl font-black text-white">{formatIDR(fee.managementFee)}</p>
                <ul className="mt-3 space-y-2">
                  {fee.feeBreakdown.map((r) => (
                    <li
                      key={r.name}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-black/20 px-3 py-2 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-white">{recipientLabel(r.name, r.profile_id)}</p>
                        <p className="text-slate-400">
                          {r.pct}% pool · <b className="text-blue-300">{formatIDR(r.amount)}</b>
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setFeeSlip({ kind: "fee", splitId: s.id, name: r.name })}
                          className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-2.5 py-1 text-[11px] font-semibold text-blue-200 hover:bg-blue-500/30"
                        >
                          Cetak Slip Fee
                        </button>
                        {r.employee_id && (
                          <Link
                            href="/payslips"
                            title="Buka halaman Slip Gaji OPEX"
                            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10"
                          >
                            Gaji OPEX ↗
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                  {fee.feeBreakdown.length === 0 && (
                    <li className="text-xs text-slate-400">Belum ada penerima Management Fee.</li>
                  )}
                </ul>
              </div>

              {/* Ditahan Perusahaan */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-200/75">
                  Laba Ditahan Perusahaan ({s.retained_pct}%)
                </p>
                <p className="mt-1 text-2xl font-black text-white">{formatIDR(fee.retained)}</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  Cadangan kas &amp; modal putar kembali untuk ekspansi brand {s.brands?.name} (tidak dibagikan ke
                  individu).
                </p>
              </div>
            </div>

            {/* Editor Penerima Fee (Khusus Admin) */}
            {canEditFeeSplit(role) && drafts[s.id] && (
              <details className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                <summary className="cursor-pointer text-sm font-bold text-blue-200 hover:text-white">
                  ⚙ Edit Daftar &amp; Porsi Penerima Fee / Dividen ({s.brands?.name})
                </summary>
                <p className="mt-2 text-xs text-slate-400">
                  Total porsi tiap daftar harus tepat 100%. Hubungkan tiap posisi ke akun profil terdaftar agar nama
                  pejabat otomatis muncul di slip.
                </p>
                {(["dividend", "fee"] as const).map((kind) => {
                  const list = drafts[s.id][kind];
                  const total = draftTotal(list);
                  return (
                    <div key={kind} className="mt-4 border-t border-white/10 pt-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-white">
                        {kind === "dividend" ? "Penerima Dividen" : "Penerima Management Fee"} — Total{" "}
                        <span className={total === 100 ? "text-emerald-300" : "text-rose-300"}>
                          {total}%
                        </span>{" "}
                        {list.length > 0 && total !== 100 && (
                          <span className="text-rose-300">(Wajib 100%)</span>
                        )}
                      </p>
                      <div className="mt-2 space-y-2">
                        {list.map((r, idx) => (
                          <div key={idx} className="flex flex-wrap items-center gap-2">
                            <input
                              value={r.name}
                              onChange={(e) =>
                                updateDraft(s.id, kind, idx, { name: e.target.value })
                              }
                              placeholder="Jabatan / Nama penerima"
                              className="min-w-0 flex-1 rounded-xl border px-3 py-1.5 text-xs"
                            />
                            <label className="flex items-center gap-1 text-xs">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={r.pct}
                                onChange={(e) =>
                                  updateDraft(s.id, kind, idx, { pct: Number(e.target.value) })
                                }
                                className="w-20 rounded-xl border px-2.5 py-1.5 text-xs font-bold"
                              />
                              %
                            </label>
                            <select
                              value={r.profile_id ?? ""}
                              onChange={(e) =>
                                pickProfileForDraft(s.id, kind, idx, e.target.value)
                              }
                              className="rounded-xl border px-2.5 py-1.5 text-xs"
                            >
                              <option value="">Hubungkan ke Profil — (opsional)</option>
                              {profiles.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.full_name ?? p.email} — {ROLE_LABELS[p.role]}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => removeDraftRow(s.id, kind, idx)}
                              className="rounded-xl border border-rose-400/25 bg-rose-500/15 px-2.5 py-1 text-xs font-semibold text-rose-200 hover:bg-rose-500/30"
                            >
                              Hapus
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => addDraftRow(s.id, kind)}
                        className="mt-2 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-blue-200 hover:bg-white/10"
                      >
                        + Tambah Baris Penerima
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => saveRecipients(s)}
                  className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow shadow-blue-600/30 hover:bg-blue-500"
                >
                  Simpan Daftar Penerima
                </button>
              </details>
            )}
          </Card>
        );
      })}

      {/* Dividen Tahunan */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white">Pencairan Dividen Tahunan</h3>
            <p className="text-xs text-slate-400">
              Dicairkan 1x per tahun dari laba bersih tahun berjalan. Nilai dibekukan saat pencairan dibuat.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-blue-200">
            Tahun Buku
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-xl border px-3 py-1.5 text-xs font-bold text-white"
            >
              {[2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>

        {visibleSplits.map((s) => {
          const bs = annualSum(s.brand_id);
          const fee = annualFee(s);
          const paid = payoutsFor(s.brand_id);
          return (
            <div key={s.id} className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-white">
                  {s.brands?.name} — Tahun {year}
                </p>
                <p className="text-xs text-slate-300">
                  Laba Tahunan: <b className="text-white">{formatIDR(bs.net)}</b> · Total Dividen ({s.dividend_pct}%):{" "}
                  <b className="text-emerald-300">{formatIDR(fee.dividend)}</b>
                </p>
              </div>
              {bs.net <= 0 && (
                <p className="mt-2 text-xs text-amber-300">Belum ada laba bersih di tahun {year} — dividen Rp0.</p>
              )}
              {paid.length > 0 && (
                <ul className="mt-3 space-y-2 text-xs">
                  {paid.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/25 px-3.5 py-2.5"
                    >
                      <span className="text-slate-200">
                        <b className="text-white">{p.recipient_name}</b> · {formatIDR(p.amount)} ·{" "}
                        <span
                          className={
                            p.status === "sudah_dibayar" ? "text-emerald-300" : "text-amber-300"
                          }
                        >
                          {p.status === "sudah_dibayar" ? "Sudah dibayar" : "Belum dibayar"}
                        </span>
                        {p.sent_at ? ` · Terkirim (${p.sent_via})` : ""}
                      </span>
                      <span className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedPayout(p)}
                          className="rounded-lg border border-blue-400/30 bg-blue-500/20 px-2.5 py-1 font-semibold text-blue-200 hover:bg-blue-500/30"
                        >
                          Buka Slip
                        </button>
                        {editable && (
                          <button
                            onClick={() => togglePayout(p)}
                            className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 font-semibold text-slate-200 hover:bg-white/15"
                          >
                            {p.status === "sudah_dibayar" ? "Batalkan Lunas" : "✓ Tandai Dibayar"}
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        {editable && (
          <button
            onClick={createPayouts}
            className="mt-4 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow shadow-blue-600/30 hover:bg-blue-500"
          >
            Buat Pencairan Dividen {year}
          </button>
        )}
        {divMsg && <p className="mt-2 text-xs text-blue-200">{divMsg}</p>}
      </Card>

      {/* MODAL SLIP DIVIDEN TAHUNAN */}
      {selectedPayout && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setSelectedPayout(null)}
        >
          <div className="max-w-xl flex-1" onClick={(e) => e.stopPropagation()}>
            <Card className="payslip-print">
              <div className="flex items-start justify-between border-b border-white/10 pb-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">
                    PT Vektora Teknologi Nusantara
                  </p>
                  <h3 className="text-lg font-black text-white">SLIP PENCAIRAN DIVIDEN</h3>
                  <p className="text-xs text-slate-300">
                    Tahun Buku {selectedPayout.year} · {payoutLabel} · {selectedPayout.brands?.name ?? ""}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedPayout(null)}
                  className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white print:hidden"
                >
                  ✕ Tutup
                </button>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <p className="flex justify-between">
                  <span className="text-slate-300">Penerima</span>
                  <b className="text-white">{payoutLabel}</b>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-300">Brand</span>
                  <b className="text-white">{selectedPayout.brands?.name ?? "—"}</b>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-300">Porsi Dividen</span>
                  <b className="text-white">{selectedPayout.pct_of_dividend}%</b>
                </p>
                <p className="flex justify-between rounded-xl border border-blue-400/30 bg-blue-500/15 p-3 text-base">
                  <span className="font-bold text-blue-100">Total Dividen Diterima</span>
                  <b className="text-white">{formatIDR(selectedPayout.amount)}</b>
                </p>
                <p className="text-xs text-slate-400">
                  Status:{" "}
                  {selectedPayout.status === "sudah_dibayar"
                    ? `Sudah dibayar${selectedPayout.paid_at ? " · " + formatDateID(selectedPayout.paid_at) : ""}`
                    : "Belum dibayar"}
                </p>
              </div>
              <div className="mt-6 flex justify-between text-xs text-slate-400">
                <span>
                  Disetujui,
                  <br />
                  <br />
                  <br />
                  _________________<br />
                  PT Vektora
                </span>
                <span className="text-right">
                  Diterima oleh,
                  <br />
                  <br />
                  <br />
                  _________________<br />
                  {payoutLabel}
                </span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-3 print:hidden">
                <button
                  onClick={() => window.print()}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white"
                >
                  🖨 Cetak Slip
                </button>
                <a
                  href={waLinkDiv(selectedPayout)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white"
                >
                  Kirim WhatsApp ↗
                </a>
                {editable && (
                  <>
                    <select
                      value={sendVia}
                      onChange={(e) => setSendVia(e.target.value as "whatsapp" | "email" | "langsung")}
                      className="rounded-xl border px-2.5 py-1 text-xs"
                    >
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">Email</option>
                      <option value="langsung">Langsung</option>
                    </select>
                    <button
                      onClick={() =>
                        updatePayout(selectedPayout, {
                          sent_at: new Date().toISOString(),
                          sent_via: sendVia,
                        })
                      }
                      className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Catat Terkirim
                    </button>
                  </>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* MODAL SLIP MANAGEMENT FEE / DIVIDEN BULANAN */}
      {feeSlip && feeSlipData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setFeeSlip(null)}
        >
          <div className="max-w-xl flex-1" onClick={(e) => e.stopPropagation()}>
            <Card className="payslip-print">
              <div className="flex items-start justify-between border-b border-white/10 pb-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">
                    PT Vektora Teknologi Nusantara
                  </p>
                  <h3 className="text-lg font-black text-white">
                    SLIP {feeSlip.kind === "fee" ? "MANAGEMENT FEE" : "DIVIDEN"}
                  </h3>
                  <p className="text-xs text-slate-300">
                    {feeSlipData.label} · Brand {feeSlipData.split.brands?.name ?? ""}
                  </p>
                </div>
                <button
                  onClick={() => setFeeSlip(null)}
                  className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white print:hidden"
                >
                  ✕ Tutup
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs print:hidden">
                <label className="text-blue-200">
                  Pilih Periode Bulan:
                  <input
                    type="month"
                    value={feeSlipMonth}
                    onChange={(e) => setFeeSlipMonth(e.target.value)}
                    className="ml-2 rounded-xl border px-2.5 py-1 text-xs font-bold text-white"
                  />
                </label>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <p className="flex justify-between">
                  <span className="text-slate-300">Penerima</span>
                  <b className="text-white">{feeSlipData.label}</b>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-300">Brand</span>
                  <b className="text-white">{feeSlipData.split.brands?.name ?? "—"}</b>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-300">Periode</span>
                  <b className="text-white">{feeSlipMonth}</b>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-300">Laba Bersih Brand Bulan Itu</span>
                  <b className="text-white">{formatIDR(feeSlipData.net)}</b>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-300">
                    Porsi {feeSlip.kind === "fee" ? "Management Fee" : "Dividen"}
                  </span>
                  <b className="text-white">{feeSlipData.row.pct}%</b>
                </p>
                <p className="flex justify-between rounded-xl border border-blue-400/30 bg-blue-500/15 p-3 text-base">
                  <span className="font-bold text-blue-100">Nominal Diterima</span>
                  <b className="text-white">{formatIDR(feeSlipData.row.amount)}</b>
                </p>
              </div>
              <div className="mt-6 flex justify-between text-xs text-slate-400">
                <span>
                  Disetujui,
                  <br />
                  <br />
                  <br />
                  _________________<br />
                  PT Vektora
                </span>
                <span className="text-right">
                  Diterima oleh,
                  <br />
                  <br />
                  <br />
                  _________________<br />
                  {feeSlipData.label}
                </span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-3 print:hidden">
                <button
                  onClick={() => window.print()}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white"
                >
                  🖨 Cetak Slip
                </button>
                <a
                  href={waLinkFee()}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white"
                >
                  Kirim WhatsApp ↗
                </a>
                <button
                  onClick={() => navigator.clipboard?.writeText(waLinkFee())}
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white"
                >
                  Salin Tautan WA
                </button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

