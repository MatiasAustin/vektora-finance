"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { computeFeeSplit, summarize } from "@/lib/types";
import type { Brand, DividendPayout, FeeSplitRow, Profile, TransactionRow } from "@/lib/types";
import { formatDateID, formatIDR } from "@/lib/format";
import { BrandSelect, Card, EmptySupabase, ReadOnlyNotice } from "@/components/ui";
import { canEdit, canEditFeeSplit, ROLE_LABELS, useAuth } from "@/lib/auth";
import { useBrandsChannels } from "@/lib/useData";

export default function FeeSplitPage() {
  const { role, loading: authLoading } = useAuth();
  const { brands } = useBrandsChannels();
  const [splits, setSplits] = useState<FeeSplitRow[]>([]);
  const [txns, setTxns] = useState<TransactionRow[]>([]);
  // Profil terdaftar (24 Nov 2026): penerima fee/dividen dihubungkan ke
  // PROFIL, bukan hanya ke employee — investor & komisaris adalah profil,
  // bukan karyawan (contoh: Febri = investor + komisaris, dapat dividen
  // sekaligus fee). Query sama seperti /team dan /employees.
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [brandId, setBrandId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  // Draft editor penerima fee (24 Nov 2026): diedit per kartu brand,
  // disimpan sekaligus ke fee_splits (jsonb). Bukan state global — tiap
  // kartu punya draft sendiri yang di-reset dari data tersimpan tiap load.
  type RecipientDraft = { name: string; pct: number; employee_id: string | null; profile_id: string | null };
  const [drafts, setDrafts] = useState<Record<string, { dividend: RecipientDraft[]; fee: RecipientDraft[] }>>({});
  // Dividen tahunan (24 Nov 2026): cair 1x per tahun.
  const [year, setYear] = useState(2026);
  const [yearTxns, setYearTxns] = useState<TransactionRow[]>([]);
  const [payouts, setPayouts] = useState<DividendPayout[]>([]);
  const [divMsg, setDivMsg] = useState("");
  // Slip dividen (24 Nov 2026): kartu slip yang bisa dicetak / dibagikan
  // per baris pencairan, seperti slip gaji di /payslips.
  const [selectedPayout, setSelectedPayout] = useState<DividendPayout | null>(null);
  const [sendVia, setSendVia] = useState<"whatsapp" | "email" | "langsung">("whatsapp");
  // Slip fee (24 Nov 2026): dokumen tampilan dari data live per bulan —
  // BUKAN tabel baru. Untuk SEMUA penerima fee/dividen, termasuk jajaran
  // direktur & komisaris yang tidak punya slip gaji (bagian mereka dari
  // fee pool, bukan dari monthly_salary).
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
  useEffect(() => { load(); }, []);

  // Draft editor mengikuti data tersimpan (di-reset tiap splits berubah,
  // mis. setelah simpan berhasil).
  useEffect(() => {
    const d: Record<string, { dividend: RecipientDraft[]; fee: RecipientDraft[] }> = {};
    for (const s of splits) {
      d[s.id] = {
        dividend: (s.dividend_recipients ?? []).map((r) => ({ name: r.name, pct: r.pct_of_dividend, employee_id: r.employee_id ?? null, profile_id: r.profile_id ?? null })),
        fee: (s.management_fee_recipients ?? []).map((r) => ({ name: r.name, pct: r.pct_of_fee, employee_id: r.employee_id ?? null, profile_id: r.profile_id ?? null })),
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

  // ---------- Tautan penerima ke profil terdaftar (24 Nov 2026) ----------
  // Satu orang bisa pegang dua peran: Febri = investor (dividen 70%) +
  // komisaris (fee 7%) — dapat dividen SEKALIGUS fee. Jadi penerima
  // dihubungkan ke profil, bukan hanya ke employee. Tampilan: "Komisaris
  // Utama — Febri"; bila nama penerima sudah sama dengan nama profil
  // (mis. "Febri (pemodal)"), tampil apa adanya tanpa pengulangan.
  // (Didefinisikan di sini — SEBELUM feeSlipData — karena memo slip fee
  // di bawah memakai recipientLabel saat render.)
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  function profileDisplayName(id: string | null | undefined): string {
    if (!id) return "";
    const p = profileById.get(id);
    return p ? (p.full_name ?? p.email ?? "") : "";
  }
  function recipientLabel(name: string, profile_id?: string | null): string {
    const person = profileDisplayName(profile_id);
    if (!person) return name;
    // Jangan gandakan bila nama penerima sudah menyebut orangnya.
    if (name.toLowerCase().includes(person.toLowerCase().split(" ")[0])) return name;
    return `${name} — ${person}`;
  }
  // Pilih profil di editor: isi profile_id, dan ikut isi employee_id dari
  // profil itu bila ada (supaya "Lihat slip gaji" tetap jalan). Kosongkan
  // pilihan = lepas tautan (kedua id jadi null).
  function pickProfileForDraft(splitId: string, kind: "dividend" | "fee", idx: number, profileId: string) {
    const p = profileId ? profileById.get(profileId) : undefined;
    updateDraft(splitId, kind, idx, {
      profile_id: profileId || null,
      employee_id: p?.employee_id ?? null,
    });
  }

  // Label slip dividen: cari tautan profil penerima dividen yang namanya
  // cocok dengan pencairan ini (nama unik per daftar penerima).
  const payoutLabel = useMemo(() => {
    if (!selectedPayout) return "";
    const split = splits.find((s) => s.brand_id === selectedPayout.brand_id);
    const rec = split?.dividend_recipients?.find((r) => r.name === selectedPayout.recipient_name);
    return recipientLabel(selectedPayout.recipient_name, rec?.profile_id ?? null);
  }, [selectedPayout, splits, profileById]);

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
    const text = `Slip Dividen — PT Vektora Teknologi Nusantara\n${payoutLabel || p.recipient_name} · ${p.brands?.name ?? ""}\nTahun: ${p.year}\nBagian dividen: ${p.pct_of_dividend}% = ${formatIDR(p.amount)}\nStatus: ${p.status === "sudah_dibayar" ? "Sudah dibayar" : "Belum dibayar"}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  // ---------- Slip fee per bulan (dokumen tampilan, bukan tabel baru) ----------
  // Dihitung dari transaksi bulan itu SAJA (query rentang tanggal),
  // sama polanya dengan laba tahunan di atas.
  async function loadMonthTxns(brandId: string, month: string) {
    const sb = getSupabase();
    if (!sb) return;
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const { data } = await sb
      .from("transactions")
      .select("*")
      .eq("brand_id", brandId)
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

  // Data slip fee yang sedang dibuka: dicari dari breakdown bulan itu
  // berdasarkan nama penerima (nama unik per daftar penerima).
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
  }, [feeSlip, splits, monthTxns, profileById]);

  function waLinkFee(): string {
    if (!feeSlip || !feeSlipData) return "";
    const { split, row } = feeSlipData;
    const label = feeSlipData.label;
    const text = `Slip ${label} — PT Vektora Teknologi Nusantara\n${label} · ${split.brands?.name ?? ""}\nPeriode: ${feeSlipMonth}\nBagian ${feeSlip.kind === "fee" ? "Management Fee" : "dividen"}: ${row.pct}% = ${formatIDR(row.amount)}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
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
      dividend_recipients: d.dividend.map((r) => ({ name: r.name.trim(), pct_of_dividend: Number(r.pct) || 0, employee_id: r.employee_id || null, profile_id: r.profile_id || null })),
      management_fee_recipients: d.fee.map((r) => ({ name: r.name.trim(), pct_of_fee: Number(r.pct) || 0, employee_id: r.employee_id || null, profile_id: r.profile_id || null })),
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
      return { ...prev, [splitId]: { ...cur, [kind]: [...cur[kind], { name: "", pct: 0, employee_id: null, profile_id: null }] } };
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
                  <p key={r.name} className="text-sm text-slate-600">{recipientLabel(r.name, r.profile_id)} — {r.pct}%: <b>{formatIDR(r.amount)}</b>
                    {r.employee_id && <> · <Link href="/payslips" className="font-semibold text-vektora-600 underline">Lihat slip gaji</Link></>}
                    {" · "}<button onClick={() => setFeeSlip({ kind: "dividend", splitId: s.id, name: r.name })} className="font-semibold text-vektora-600 underline">Slip</button>
                  </p>
                ))}
                {fee.dividendBreakdown.length === 0 && <p className="text-sm text-slate-500">Belum ada penerima dividen.</p>}
              </div>
              <div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Management Fee</p><p className="text-xl font-bold">{formatIDR(fee.managementFee)}</p>
                {fee.feeBreakdown.map((r) => (
                  <p key={r.name} className="text-sm text-slate-600">{recipientLabel(r.name, r.profile_id)} — {r.pct}% dari fee pool: <b>{formatIDR(r.amount)}</b>
                    {r.employee_id && <> · <Link href="/payslips" className="font-semibold text-vektora-600 underline">Lihat slip gaji</Link></>}
                    {" · "}<button onClick={() => setFeeSlip({ kind: "fee", splitId: s.id, name: r.name })} className="font-semibold text-vektora-600 underline">Slip</button>
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
                  bila bukan 100%. Pilih "Orang" untuk menghubungkan penerima ke orang terdaftar
                  (profil apa saja: tim, investor, komisaris). Satu orang bisa pegang dua peran — contoh
                  Febri: investor (dividen 70%) SEKALIGUS komisaris (fee 7%), jadi dia dapat dividen
                  dan fee; hubungkan kedua barisnya ke profil Febri (kursi komisarisnya — Utama atau 2 —
                  dipilih di sini, jangan ditebak). Bila profil yang dipilih punya baris karyawan,
                  tautan slip gaji ikut terisi otomatis. Kosongkan bila penerima belum diisi orangnya.
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
                            <select value={r.profile_id ?? ""} onChange={(e) => pickProfileForDraft(s.id, kind, idx, e.target.value)} className="rounded-xl border px-2 py-1 text-sm">
                              <option value="">Orang — (belum diisi)</option>
                              {profiles.map((p) => (
                                <option key={p.id} value={p.id}>{p.full_name ?? p.email} — {ROLE_LABELS[p.role]}</option>
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
            <p className="mt-3 text-xs text-slate-500">Contoh WhereIsIt Nov 2026 (setelah seed-latest): laba Rp417.118 → Dividen Rp83.424 (Febri 70% Rp58.397 / Matias 30% Rp25.027), Management Fee Rp229.415, Ditahan Rp104.279. Penerima Management Fee ikut sheet "Struktur Pembagian": Dirut 25%, Dirops 20%, Komisaris Utama 7%, Komisaris 2 7%, Keuangan 10.25%, Pemasaran 10.25%, Operasional 10.25%, Administrasi 10.25%. Daftar penerima diubah di editor "Edit penerima fee" di atas (admin saja); posisi fungsi (Keuangan, Pemasaran, dst.) dihubungkan ke orangnya lewat dropdown Orang tanpa mengubah %. Satu orang bisa pegang dua peran: Febri = investor (dividen 70%) + komisaris (fee 7%) — hubungkan kedua barisnya ke profil Febri; kursi komisarisnya (Utama atau 2) dipilih di editor, jangan ditebak.</p>
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
                    <span>{recipientLabel(r.name, r.profile_id)}</span><b>{formatIDR(r.amount)}</b>
                  </li>
                ))}
              </ul>
              {paid.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {paid.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                      <span>{p.recipient_name} · {formatIDR(p.amount)} · {p.status === "sudah_dibayar" ? "Sudah dibayar" : "Belum dibayar"}{p.sent_at ? ` · Terkirim ${p.sent_via ?? ""}` : ""}</span>
                      <span className="flex items-center gap-2">
                        <button onClick={() => setSelectedPayout(p)} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">Lihat slip</button>
                        {editable && (
                          <button onClick={() => togglePayout(p)} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
                            {p.status === "sudah_dibayar" ? "Batalkan" : "Tandai sudah dibayar"}
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
        {editable ? (
          <button onClick={createPayouts} className="mt-4 rounded-xl bg-vektora-500 px-4 py-2 text-sm font-semibold text-white">
            Buat pencairan dividen {year}
          </button>
        ) : (
          <p className="mt-4 text-xs text-slate-500">Mode baca saja — hanya admin / management yang bisa membuat pencairan dan menandai dibayar.</p>
        )}
        {divMsg && <p className="mt-2 text-sm">{divMsg}</p>}
      </Card>

      {/* ---------- Slip dividen (per pencairan) ---------- */}
      {selectedPayout && (
        <Card className="payslip-print">
          <div className="border-b pb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-vektora-600">PT Vektora Teknologi Nusantara</p>
            <h3 className="text-lg font-black">Slip Dividen</h3>
            <p className="text-sm text-slate-500">Tahun {selectedPayout.year} · {payoutLabel} · {selectedPayout.brands?.name ?? ""}</p>
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <p className="flex justify-between"><span>Penerima</span><b>{payoutLabel}</b></p>
            <p className="flex justify-between"><span>Brand</span><b>{selectedPayout.brands?.name ?? "—"}</b></p>
            <p className="flex justify-between"><span>Bagian dividen</span><b>{selectedPayout.pct_of_dividend}%</b></p>
            <p className="flex justify-between border-t pt-2 text-base"><span>Jumlah dividen</span><b>{formatIDR(selectedPayout.amount)}</b></p>
            <p className="text-xs text-slate-500">Status: {selectedPayout.status === "sudah_dibayar" ? `Sudah dibayar${selectedPayout.paid_at ? " · " + formatDateID(selectedPayout.paid_at) : ""}` : "Belum dibayar"}{selectedPayout.sent_at ? ` · Terkirim ${selectedPayout.sent_via ?? ""} · ${formatDateID(selectedPayout.sent_at)}` : ""}</p>
            <p className="text-xs text-slate-500">Jumlah dibekukan saat pencairan dibuat — laba sesudah itu tidak mengubah jumlah ini.</p>
          </div>
          <div className="mt-6 flex justify-between text-xs text-slate-500">
            <span>Disetujui,<br /><br /><br />_________________<br />PT Vektora</span>
            <span>Diterima oleh,<br /><br /><br />_________________<br />{payoutLabel}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 print:hidden">
            <button onClick={() => window.print()} className="rounded-xl bg-vektora-500 px-4 py-2 text-sm font-semibold text-white">Cetak slip</button>
            <a href={waLinkDiv(selectedPayout)} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Bagikan via WhatsApp</a>
            <button onClick={() => navigator.clipboard?.writeText(waLinkDiv(selectedPayout))} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold">Salin tautan slip</button>
            {editable && (
              <>
                <select value={sendVia} onChange={(e) => setSendVia(e.target.value as "whatsapp" | "email" | "langsung")} className="rounded-xl border px-2 py-1 text-sm">
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                  <option value="langsung">Langsung</option>
                </select>
                <button onClick={() => updatePayout(selectedPayout, { sent_at: new Date().toISOString(), sent_via: sendVia })} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold">Tandai terkirim</button>
                <button
                  onClick={() =>
                    updatePayout(
                      selectedPayout,
                      selectedPayout.status === "sudah_dibayar"
                        ? { status: "belum_dibayar", paid_at: null }
                        : { status: "sudah_dibayar", paid_at: new Date().toISOString() }
                    )
                  }
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold"
                >
                  {selectedPayout.status === "sudah_dibayar" ? "Batalkan dibayar" : "Tandai sudah dibayar"}
                </button>
              </>
            )}
            <button onClick={() => setSelectedPayout(null)} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold">Tutup</button>
          </div>
        </Card>
      )}

      {/* ---------- Slip fee per bulan (semua penerima, termasuk direktur) ---------- */}
      {feeSlip && feeSlipData && (
        <Card className="payslip-print">
          <div className="border-b pb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-vektora-600">PT Vektora Teknologi Nusantara</p>
            <h3 className="text-lg font-black">Slip {feeSlip.kind === "fee" ? "Management Fee" : "Dividen"}</h3>
            <p className="text-sm text-slate-500">{feeSlipData.label} · {feeSlipData.split.brands?.name ?? ""}</p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm print:hidden">
            <label>Periode
              <input type="month" value={feeSlipMonth} onChange={(e) => setFeeSlipMonth(e.target.value)} className="ml-2 rounded-xl border px-2 py-1" />
            </label>
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <p className="flex justify-between"><span>Penerima</span><b>{feeSlipData.label}</b></p>
            <p className="flex justify-between"><span>Brand</span><b>{feeSlipData.split.brands?.name ?? "—"}</b></p>
            <p className="flex justify-between"><span>Periode</span><b>{feeSlipMonth}</b></p>
            <p className="flex justify-between"><span>Laba bersih brand bulan itu</span><b>{formatIDR(feeSlipData.net)}</b></p>
            <p className="flex justify-between"><span>Bagian {feeSlip.kind === "fee" ? "Management Fee" : "dividen"}</span><b>{feeSlipData.row.pct}%</b></p>
            <p className="flex justify-between border-t pt-2 text-base"><span>Jumlah</span><b>{formatIDR(feeSlipData.row.amount)}</b></p>
            {feeSlipData.net <= 0 && <p className="text-xs text-amber-700">Belum ada laba bulan {feeSlipMonth} — bagian Rp0.</p>}
            <p className="text-xs text-slate-500">
              Slip ini dihitung dari transaksi live bulan {feeSlipMonth} (bukan dokumen tersimpan) — angka
              berubah bila ada transaksi baru di bulan itu. Bagian ini dari {feeSlip.kind === "fee" ? "Management Fee" : "dividen"}, bukan gaji bulanan.
            </p>
          </div>
          <div className="mt-6 flex justify-between text-xs text-slate-500">
            <span>Disetujui,<br /><br /><br />_________________<br />PT Vektora</span>
            <span>Diterima oleh,<br /><br /><br />_________________<br />{feeSlipData.label}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 print:hidden">
            <button onClick={() => window.print()} className="rounded-xl bg-vektora-500 px-4 py-2 text-sm font-semibold text-white">Cetak slip</button>
            <a href={waLinkFee()} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Bagikan via WhatsApp</a>
            <button onClick={() => navigator.clipboard?.writeText(waLinkFee())} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold">Salin tautan slip</button>
            <button onClick={() => setFeeSlip(null)} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold">Tutup</button>
          </div>
        </Card>
      )}
    </div>
  );
}
