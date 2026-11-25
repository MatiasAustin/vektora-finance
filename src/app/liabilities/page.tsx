"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { AssetRow, Brand, LiabilityRow } from "@/lib/types";
import { formatDateID, formatIDR } from "@/lib/format";
import { AccessDenied, BrandSelect, Card, EmptySupabase, ReadOnlyNotice, StatCard } from "@/components/ui";
import { canEdit, canViewOperations, useAuth } from "@/lib/auth";
import { useBrandsChannels } from "@/lib/useData";

export default function LiabilitiesPage() {
  const { role, loading: authLoading } = useAuth();
  const editable = canEdit(role);
  const { brands } = useBrandsChannels();
  const [rows, setRows] = useState<LiabilityRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [brandId, setBrandId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({
    brand_id: "",
    creditor: "",
    amount: "",
    due_date: "",
    monthly_installment: "",
    months: "12",
    paid_by: "company" as "company" | "investor",
    notes: "",
    asset_id: "",
  });

  async function load() {
    const sb = getSupabase();
    if (!sb) return setLoading(false);
    const [l, a] = await Promise.all([
      sb.from("liabilities").select("*, brands(name), assets(name)").order("due_date", { ascending: true }),
      sb.from("assets").select("*").order("name"),
    ]);
    if (l.data) setRows(l.data as LiabilityRow[]);
    if (a.data) setAssets(a.data as AssetRow[]);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (brands.length && !form.brand_id) setForm((f) => ({ ...f, brand_id: brands[0].id }));
  }, [brands, form.brand_id]);

  const filtered = useMemo(
    () => rows.filter((r) => brandId === "all" || r.brand_id === brandId),
    [rows, brandId]
  );
  const companyDebt = filtered
    .filter((r) => r.paid_by === "company")
    .reduce((s, r) => s + r.remaining_amount, 0);
  const investorPaid = filtered
    .filter((r) => r.paid_by === "investor")
    .reduce((s, r) => s + r.remaining_amount, 0);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!editable) return;
    const sb = getSupabase();
    if (!sb) return;
    setMsg("");
    const amount = Number(form.amount);
    const { error } = await sb.from("liabilities").insert({
      brand_id: form.brand_id || null,
      creditor: form.creditor,
      amount,
      remaining_amount: amount,
      due_date: form.due_date || null,
      monthly_installment: form.monthly_installment ? Number(form.monthly_installment) : null,
      months: form.months ? Number(form.months) : null,
      paid_by: form.paid_by,
      status: "aktif",
      notes: form.notes || null,
      asset_id: form.asset_id || null,
    });
    if (error) {
      setMsg("Gagal simpan hutang: " + error.message);
      return;
    }
    setMsg(`Pinjaman "${form.creditor}" senilai ${formatIDR(amount)} tersimpan.`);
    setForm((f) => ({ ...f, creditor: "", amount: "", notes: "", asset_id: "" }));
    load();
  }

  if (!isSupabaseConfigured) return <EmptySupabase />;
  if (loading || authLoading) return <p className="text-blue-200/70">Memuat data hutang…</p>;
  if (!canViewOperations(role)) return <AccessDenied />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white sm:text-lg">Hutang &amp; Pinjaman</h2>
          <p className="text-[11px] text-blue-200/75">
            Pemisahan tegas antara hutang perusahaan vs tanggung jawab investor, lengkap dengan pintasan bayar cicilan.
          </p>
        </div>
        <BrandSelect brands={brands} value={brandId} onChange={setBrandId} />
      </div>

      <div className="grid gap-3.5 md:grid-cols-2">
        <StatCard
          label="Hutang Perusahaan (Sisa)"
          value={formatIDR(companyDebt)}
          sub="Kewajiban yang dibayar dari kas PT Vektora"
          tone="warning"
        />
        <StatCard
          label="Ditanggung Investor (Non-Hutang PT)"
          value={formatIDR(investorPaid)}
          sub="Contoh: SPayLater bahan baku — dicatat agar transparan, bukan beban PT"
        />
      </div>

      <Card>
        <h3 className="text-sm font-bold text-white">Catat Hutang / Pinjaman Baru</h3>
        {editable ? (
          <form onSubmit={add} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-xs text-blue-200/80">
              Brand
              <select
                value={form.brand_id}
                onChange={(e) => setForm({ ...form, brand_id: e.target.value })}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              >
                <option value="">Holding PT Vektora (Umum)</option>
                {brands.map((b: Brand) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-blue-200/80">
              Kreditur / Pemberi Pinjaman
              <input
                value={form.creditor}
                onChange={(e) => setForm({ ...form, creditor: e.target.value })}
                placeholder="Mis. Febri / Cicilan Printer P2S"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                required
              />
            </label>

            <label className="block text-xs text-blue-200/80">
              Total Pokok Pinjaman (Rp)
              <input
                type="number"
                min="1"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-bold"
                required
              />
            </label>

            <label className="block text-xs text-blue-200/80">
              Tanggal Jatuh Tempo
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </label>

            <label className="block text-xs text-blue-200/80">
              Cicilan per Bulan (Rp)
              <input
                type="number"
                min="0"
                value={form.monthly_installment}
                onChange={(e) => setForm({ ...form, monthly_installment: e.target.value })}
                placeholder="Opsional"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </label>

            <label className="block text-xs text-blue-200/80">
              Tenor / Jangka Waktu (Bulan)
              <input
                type="number"
                min="1"
                value={form.months}
                onChange={(e) => setForm({ ...form, months: e.target.value })}
                placeholder="12"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </label>

            <label className="block text-xs text-blue-200/80">
              Penanggung Pembayaran
              <select
                value={form.paid_by}
                onChange={(e) => setForm({ ...form, paid_by: e.target.value as "company" | "investor" })}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              >
                <option value="company">Dibayar Perusahaan (Masuk Hutang PT)</option>
                <option value="investor">Dibayar Investor (Bukan Hutang PT)</option>
              </select>
            </label>

            <label className="block text-xs text-blue-200/80 sm:col-span-2">
              Aset Terkait (Bila pinjaman ini dipakai membeli aset)
              <select
                value={form.asset_id}
                onChange={(e) => setForm({ ...form, asset_id: e.target.value })}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              >
                <option value="">Tidak terhubung ke aset spesifik</option>
                {assets
                  .filter((a) => !form.brand_id || a.brand_id === form.brand_id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} — {formatIDR(a.total_price)}
                    </option>
                  ))}
              </select>
            </label>

            <label className="block text-xs text-blue-200/80 sm:col-span-2">
              Catatan
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Rincian kesepakatan cicilan"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </label>

            <div className="flex items-end">
              <button className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500">
                Simpan Pinjaman
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-3">
            <ReadOnlyNotice role={role} />
          </div>
        )}
        {msg && <p className="mt-3 text-xs font-medium text-blue-200">{msg}</p>}
      </Card>

      <Card>
        <h3 className="text-sm font-bold text-white">Daftar Hutang &amp; Progres Pelunasan ({filtered.length})</h3>
        <ul className="mt-3 space-y-2.5">
          {filtered.map((l) => {
            const paid = Math.max(0, l.amount - l.remaining_amount);
            const pct = l.amount > 0 ? Math.min(100, Math.round((paid / l.amount) * 100)) : 100;
            const isLunas = l.status === "lunas" || l.remaining_amount <= 0;
            return (
              <li
                key={l.id}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5 text-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-white">
                        {l.creditor} — {l.brands?.name ?? "PT Vektora"}
                      </p>
                      <span
                        className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1 text-[10px] font-semibold leading-none ${
                          isLunas
                            ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30"
                            : l.paid_by === "investor"
                            ? "bg-blue-500/20 text-blue-200 ring-1 ring-blue-400/30"
                            : "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30"
                        }`}
                      >
                        {isLunas ? "Lunas ✓" : l.paid_by === "investor" ? "Tanggungan Investor" : "Hutang Aktif"}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Total awal: {formatIDR(l.amount)} · Terbayar: <b className="text-emerald-300">{formatIDR(paid)}</b> ({pct}%) · Jatuh tempo:{" "}
                      {formatDateID(l.due_date)} · Cicilan:{" "}
                      {l.monthly_installment ? `${formatIDR(l.monthly_installment)}/bln` : "—"} ({l.months ?? "—"} bln)
                      {l.notes ? ` · ${l.notes}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400">Sisa Hutang</p>
                      <p className="text-sm font-black text-white sm:text-base">{formatIDR(l.remaining_amount)}</p>
                    </div>
                    {editable && !isLunas && (
                      <Link
                        href={`/transactions?action=debt&liability_id=${l.id}${l.brand_id ? `&brand_id=${l.brand_id}` : ""}`}
                        className="rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow shadow-indigo-600/30 transition hover:bg-indigo-500"
                      >
                        Bayar Cicilan →
                      </Link>
                    )}
                  </div>
                </div>

                {/* Progress bar pelunasan */}
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isLunas ? "bg-emerald-400" : "bg-gradient-to-r from-blue-500 to-indigo-400"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {l.asset_id && l.assets?.name && (
                  <p className="mt-2 text-xs text-blue-200/80">
                    {isLunas
                      ? `Aset Terkait: ${l.assets.name} — Lunas, aset sepenuhnya milik perusahaan.`
                      : `Aset Terkait: ${l.assets.name} — porsi kepemilikan perusahaan saat ini ${formatIDR(
                          paid
                        )} dari ${formatIDR(l.amount)}.`}
                  </p>
                )}
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="rounded-2xl border border-white/5 bg-white/[0.02] py-8 text-center text-sm text-slate-400">
              Belum ada catatan hutang atau pinjaman.
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}

