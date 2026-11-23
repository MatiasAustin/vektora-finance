"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { computeFeeSplit, summarize } from "@/lib/types";
import type { Brand, DividendPayout, EmployeeRow, FeeSplitRow, TransactionRow } from "@/lib/types";
import { formatIDR } from "@/lib/format";
import { BrandSelect, Card, EmptySupabase, ReadOnlyNotice } from "@/components/ui";
import { canEdit, canEditFeeSplit, useAuth } from "@/lib/auth";
import { useBrandsChannels } from "@/lib/useData";

export default function FeeSplitPage() {
  const { role, loading: authLoading } = useAuth();
  const { brands } = useBrandsChannels();
  const [splits, setSplits] = useState<FeeSplitRow[]>([]);
  const [txns, setTxns] = useState<TransactionRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [brandId, setBrandId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  // Draft editor penerima fee (24 Nov 2026): diedit per kartu brand,
  // disimpan sekaligus ke fee_splits (jsonb). Bukan state global — tiap
  // kartu punya draft sendiri yang di-reset dari data tersimpan tiap load.
  type RecipientDraft = { name: string; pct: number; employee_id: string | null };
  const [drafts, setDrafts] = useState<Record<string, { dividend: RecipientDraft[]; fee: RecipientDraft[] }>>({});
  // Dividen tahunan (24 Nov 2026): cair 1x per tahun.
  const [year, setYear] = useState(2026);
  const [yearTxns, setYearTxns] = useState<TransactionRow[]>([]);
  const [payouts, setPayouts] = useState<DividendPayout[]>([]);
  const [divMsg, setDivMsg] = useState("");

  async function load() {
    const sb = getSupabase();
    if (!sb) return setLoading(false);
    const [f, t, e] = await Promise.all([
      sb.from("fee_splits").select("*, brands(name)").order("effective_from", { ascending: false }),
      sb.from("transactions").select("*").order("txn_date", { ascending: false }).limit(500),
      sb.from("employees").select("*").eq("is_active", true).order("name"),
    ]);
    if (f.data) setSplits(f.data as FeeSplitRow[]);
    if (t.data) setTxns(t.data as TransactionRow[]);
    if (e.data) setEmployees(e.data as EmployeeRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  // Draft editor mengikuti data tersimpan (di-reset tiap splits berubah,
  // mis. setelah simpan berhasil).
  useEffect(() => {
    const d: Record<string, { dividend: RecipientDraft[]; fee: RecipientDraft[] }> = {};
    for (const s of splits) {
      d[s.id] = {
        dividend: (s.dividend_recipients ?? []).map((r) => ({ name: r.name, pct: r.pct_of_dividend, employee_id: r.employee_id ?? null })),
        fee: (s.management_fee_recipients ?? []).map((r) => ({ name: r.name, pct: r.pct_of_fee, employee_id: r.employee_id ?? null })),
      };
    }
    setDrafts(d);
  }, [splits]);

  // Laba tahunan dihitung dari transaksi tahun itu SAJA (query rentang
  // tanggal, bukan dari load 500 baris di atas) supaya totalnya tepat.
  async function loadAnnual(y: number) {
    const sb = getSupabase();
    if (!sb) return;
    const [t, p] = await Promise.all([
      sb.from("transactions").select("*").gte("txn_date", `${y}-01-01`).lte("txn_date", `${y}-12-31`).limit(5000),
      sb.from("dividend_payouts").select("*, brands(name)").eq("year", y).order("brand_id").order("recipient_name"),
    ]);
    if (t.data) setYearTxns(t.data as TransactionRow[]);
    if (p.data) setPayouts(p.data as DividendPayout[]);
  }
  useEffect(() => { loadAnnual(year); }, [year]);

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

  // ---------- Dividen tahunan ----------
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

  // Buat pencairan: satu baris per penerima, jumlah DIBEKUKAN saat dibuat.
  // ignoreDuplicates: baris yang sudah ada TIDAK ditimpa — klik ulang hanya
  // menambah penerima yang belum ada, tidak mengubah jumlah lama.
  async function createPayouts() {
    if (!editable) return;
    const sb = getSupabase();
    if (!sb) return;
    const rows: { brand_id: string; year: number; recipient_name: string; pct_of_dividend: number; amount: number; status: string }[] = [];
    for (const s of visibleSplits) {
      const fee = annualFee(s);
      if (fee.dividend <= 0) continue;
      const pctByName = new Map((s.dividend_recipients ?? []).map((r) => [r.name, r.pct_of_dividend]));
      for (const r of fee.dividendBreakdown) {
        rows.push({
          brand_id: s.brand_id, year, recipient_name: r.name,
          pct_of_dividend: pctByName.get(r.name) ?? 0, amount: r.amount, status: "belum_dibayar",
        });
      }
    }
    if (rows.length === 0) {
      setDivMsg(`Tidak ada dividen untuk dicairkan di ${year} (laba tahunan ≤ 0 untuk brand yang tampil).`);
      return;
    }
    const { error } = await sb.from("dividend_payouts").upsert(rows, { onConflict: "brand_id,year,recipient_name", ignoreDuplicates: true });
    if (error) setDivMsg("Gagal buat pencairan: " + error.message);
    else {
      setDivMsg(`Pencairan dividen ${year} dibuat (${rows.length} penerima). Jumlah dibekukan saat dibuat — laba sesudah ini tidak mengubahnya.`);
      loadAnnual(year);
    }
  }

  async function togglePayout(p: DividendPayout) {
    if (!editable) return;
    const sb = getSupabase();
    if (!sb) return;
    const paid = p.status !== "sudah_dibayar";
    const { error } = await sb.from("dividend_payouts").update({
      status: paid ? "sudah_dibayar" : "belum_dibayar",
      paid_at: paid ? new Date().toISOString() : null,
    }).eq("id", p.id);
    if (error) setDivMsg("Gagal ubah status: " + error.message);
    else loadAnnual(year);
  }

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

  // ---------- Editor penerima fee (admin saja, 24 Nov 2026) ----------
  // Aturan: daftar boleh kosong (belum ada penerima), tapi bila ada isinya
  // total % HARUS 100% dari pool-nya — kalau bukan 100%, simpan ditolak.
  function draftTotal(list: RecipientDraft[]): number {
    return list.reduce((s, r) => s + (Number(r.pct) || 0), 0);
  }

  async function saveRecipients(split: FeeSplitRow) {
    if (!canEditFeeSplit(role)) return;
    const d = drafts[split.id];
    if (!d) return;
    const divTotal = draftTotal(d.dividend);
    const feeTotal = draftTotal(d.fee);
    if (d.dividend.length > 0 && divTotal !== 100) {
      setMsg(`Total % penerima dividen ${split.brands?.name ?? ""} = ${divTotal}%, harus 100%. Perbaiki dulu sebelum simpan.`);
      return;
    }
    if (d.fee.length > 0 && feeTotal !== 100) {
      setMsg(`Total % penerima Management Fee ${split.brands?.name ?? ""} = ${feeTotal}%, harus 100%. Perbaiki dulu sebelum simpan.`);
      return;
    }
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from("fee_splits").update({
      dividend_recipients: d.dividend.map((r) => ({ name: r.name.trim(), pct_of_dividend: Number(r.pct) || 0, employee_id: r.employee_id || null })),
      management_fee_recipients: d.fee.map((r) => ({ name: r.name.trim(), pct_of_fee: Number(r.pct) || 0, employee_id: r.employee_id || null })),
    }).eq("id", split.id);
    if (error) setMsg("Gagal simpan penerima: " + error.message);
    else { setMsg("Daftar penerima tersimpan."); load(); }
  }

  function updateDraft(splitId: string, kind: "dividend" | "fee", idx: number, patch: Partial<RecipientDraft>) {
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
      return { ...prev, [splitId]: { ...cur, [kind]: [...cur[kind], { name: "", pct: 0, employee_id: null }] } };
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
              <div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Dividen</p><p className="text-xl font-bold">{formatIDR(fee.dividend)}</p>
                {fee.dividendBreakdown.map((r) => (
                  <p key={r.name} className="text-sm text-slate-600">{r.name} — {r.pct}%: <b>{formatIDR(r.amount)}</b>
                    {r.employee_id && <> · <Link href="/payslips" className="font-semibold text-vektora-600 underline">Lihat slip</Link></>}
                  </p>
                ))}
                {fee.dividendBreakdown.length === 0 && <p className="text-sm text-slate-500">Belum ada penerima dividen.</p>}
              </div>
              <div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Management Fee</p><p className="text-xl font-bold">{formatIDR(fee.managementFee)}</p>
                {fee.feeBreakdown.map((r) => (
                  <p key={r.name} className="text-sm text-slate-600">{r.name} — {r.pct}% dari fee pool: <b>{formatIDR(r.amount)}</b>
                    {r.employee_id && <> · <Link href="/payslips" className="font-semibold text-vektora-600 underline">Lihat slip</Link></>}
                  </p>
                ))}
                {fee.feeBreakdown.length === 0 && <p className="text-sm text-slate-500">Belum ada penerima Management Fee.</p>}
              </div>
              <div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Ditahan perusahaan</p><p className="text-xl font-bold">{formatIDR(fee.retained)}</p><p className="text-sm text-slate-600">Untuk perusahaan, bukan dibagikan.</p></div>
            </div>
            {canEditFeeSplit(role) && drafts[s.id] && (
              <div className="mt-4 rounded-2xl border border-slate-200 p-4">
                <h4 className="font-bold">Edit penerima fee</h4>
                <p className="mt-1 text-xs text-slate-500">
                  Tambah / hapus / ubah % tiap penerima. Total % tiap daftar harus 100% — simpan ditolak
                  bila bukan 100%. Pilih "Tim" bila penerima adalah anggota tim (slip gajinya tetap
                  dibuat lewat generate di /payslips; gaji tim dibayar dari Management Fee, bukan OPEX).
                  Kosongkan bila penerima bukan tim (mis. komisaris eksternal).
                </p>
                {(["dividend", "fee"] as const).map((kind) => {
                  const list = drafts[s.id][kind];
                  const total = draftTotal(list);
                  return (
                    <div key={kind} className="mt-3">
                      <p className="text-sm font-semibold">{kind === "dividend" ? "Penerima Dividen" : "Penerima Management Fee"} — total {total}% {list.length > 0 && total !== 100 && <span className="text-rose-600">(harus 100%)</span>}</p>
                      <div className="mt-2 space-y-2">
                        {list.map((r, idx) => (
                          <div key={idx} className="flex flex-wrap items-center gap-2">
                            <input value={r.name} onChange={(e) => updateDraft(s.id, kind, idx, { name: e.target.value })} placeholder="Nama penerima" className="min-w-0 flex-1 rounded-xl border px-2 py-1 text-sm" />
                            <label className="flex items-center gap-1 text-sm"><input type="number" min="0" max="100" step="0.01" value={r.pct} onChange={(e) => updateDraft(s.id, kind, idx, { pct: Number(e.target.value) })} className="w-20 rounded-xl border px-2 py-1 text-sm" />%</label>
                            <select value={r.employee_id ?? ""} onChange={(e) => updateDraft(s.id, kind, idx, { employee_id: e.target.value || null })} className="rounded-xl border px-2 py-1 text-sm">
                              <option value="">Tim — (bukan tim)</option>
                              {employees.filter((x) => x.brand_id === s.brand_id).map((x) => (
                                <option key={x.id} value={x.id}>{x.name}{x.role ? ` — ${x.role}` : ""}</option>
                              ))}
                            </select>
                            <button onClick={() => removeDraftRow(s.id, kind, idx)} className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">Hapus</button>
                          </div>
                        ))}
                        {list.length === 0 && <p className="text-xs text-slate-500">Belum ada penerima — tambah di bawah.</p>}
                      </div>
                      <button onClick={() => addDraftRow(s.id, kind)} className="mt-2 rounded-xl bg-slate-100 px-3 py-1 text-xs font-semibold">+ Tambah penerima</button>
                    </div>
                  );
                })}
                <button onClick={() => saveRecipients(s)} className="mt-4 rounded-xl bg-vektora-500 px-4 py-2 text-sm font-semibold text-white">Simpan penerima</button>
              </div>
            )}
            <p className="mt-3 text-xs text-slate-500">Contoh WhereIsIt Nov 2026 (setelah seed-latest): laba Rp417.118 → Dividen Rp83.424 (Febri 70% Rp58.397 / Matias 30% Rp25.027), Management Fee Rp229.415, Ditahan Rp104.279. Penerima Management Fee ikut sheet "Struktur Pembagian": Dirut 25%, Dirops 20%, Komisaris Utama 7%, Komisaris 2 7%, Keuangan 10.25%, Pemasaran 10.25%, Operasional 10.25%, Administrasi 10.25%. Daftar penerima diubah di editor "Edit penerima fee" di atas (admin saja); posisi fungsi (Keuangan, Pemasaran, dst.) dihubungkan ke orangnya lewat dropdown Tim tanpa mengubah %.</p>
          </Card>
        );
      })}
      {visibleSplits.length === 0 && <Card><p className="text-sm text-slate-500">Belum ada konfigurasi fee split untuk brand ini.</p></Card>}

      {/* ---------- Dividen Tahunan (cair 1x per tahun) ---------- */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold">Dividen Tahunan</h3>
          <label className="text-sm">Tahun
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="ml-2 rounded-xl border bg-white px-3 py-2">
              {[2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Dividen dicairkan <b>satu kali setahun</b> dari laba bersih tahun itu (Income − Pengeluaran
          terhitung; Belum reimburse dan pembayaran hutang tidak masuk hitungan). Jumlah per penerima{" "}
          <b>dibekukan saat pencairan dibuat</b> — laba yang masuk sesudah itu tidak mengubah jumlahnya.
        </p>
        {visibleSplits.map((s) => {
          const bs = annualSum(s.brand_id);
          const fee = annualFee(s);
          const paid = payoutsFor(s.brand_id);
          return (
            <div key={s.id} className="mt-4 border-t pt-3">
              <p className="font-semibold">{s.brands?.name} — {year}</p>
              <p className="text-sm text-slate-600">
                Laba tahunan <b>{formatIDR(bs.net)}</b> (Income {formatIDR(bs.income)} − Pengeluaran{" "}
                {formatIDR(bs.expense)}) · Dividen {s.dividend_pct}% = <b>{formatIDR(fee.dividend)}</b>
              </p>
              {bs.net <= 0 && (
                <p className="mt-1 text-sm text-amber-700">Belum ada laba tahun {year} — dividen Rp0.</p>
              )}
              <ul className="mt-2 space-y-1 text-sm">
                {fee.dividendBreakdown.map((r) => (
                  <li key={r.name} className="flex flex-wrap justify-between gap-2">
                    <span>{r.name}</span><b>{formatIDR(r.amount)}</b>
                  </li>
                ))}
              </ul>
              {paid.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {paid.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                      <span>{p.recipient_name} · {formatIDR(p.amount)} · {p.status === "sudah_dibayar" ? "Sudah dibayar" : "Belum dibayar"}</span>
                      {editable && (
                        <button onClick={() => togglePayout(p)} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
                          {p.status === "sudah_dibayar" ? "Batalkan" : "Tandai sudah dibayar"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {editable ? (
          <button onClick={createPayouts} className="mt-4 rounded-xl bg-vektora-500 px-4 py-2 text-sm font-semibold text-white">
            Buat pencairan dividen {year}
          </button>
        ) : (
          <p className="mt-4 text-xs text-slate-500">Mode baca saja — hanya admin / management yang bisa membuat pencairan dan menandai dibayar.</p>
        )}
        {divMsg && <p className="mt-2 text-sm">{divMsg}</p>}
      </Card>
    </div>
  );
}
