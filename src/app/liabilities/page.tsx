"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Brand, LiabilityRow } from "@/lib/types";
import { formatDateID, formatIDR } from "@/lib/format";
import { BrandSelect, Card, EmptySupabase, ReadOnlyNotice } from "@/components/ui";
import { canEdit, useAuth } from "@/lib/auth";

import { useBrandsChannels } from "@/lib/useData";

export default function LiabilitiesPage() {
  const { role, loading: authLoading } = useAuth();
  const editable = canEdit(role);
  const { brands } = useBrandsChannels();
  const [rows, setRows] = useState<LiabilityRow[]>([]);
  const [brandId, setBrandId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ brand_id: "", creditor: "", amount: "", due_date: "", monthly_installment: "", months: "12", paid_by: "company" as "company" | "investor", notes: "" });

  async function load() {
    const sb = getSupabase();
    if (!sb) return setLoading(false);
    const { data } = await sb.from("liabilities").select("*, brands(name)").order("due_date", { ascending: true });
    if (data) setRows(data as LiabilityRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (brands.length && !form.brand_id) setForm((f) => ({ ...f, brand_id: brands[0].id })); }, [brands, form.brand_id]);

  const filtered = useMemo(() => rows.filter((r) => brandId === "all" || r.brand_id === brandId), [rows, brandId]);
  const companyDebt = filtered.filter((r) => r.paid_by === "company").reduce((s, r) => s + r.remaining_amount, 0);
  const investorPaid = filtered.filter((r) => r.paid_by === "investor").reduce((s, r) => s + r.remaining_amount, 0);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!editable) return;
    const sb = getSupabase();
    if (!sb) return;
    const amount = Number(form.amount);
    await sb.from("liabilities").insert({
      brand_id: form.brand_id || null, creditor: form.creditor, amount, remaining_amount: amount,
      due_date: form.due_date || null, monthly_installment: form.monthly_installment ? Number(form.monthly_installment) : null,
      months: form.months ? Number(form.months) : null, paid_by: form.paid_by, status: "aktif", notes: form.notes || null,
    });
    setForm((f) => ({ ...f, creditor: "", amount: "", notes: "" }));
    load();
  }

  if (!isSupabaseConfigured) return <EmptySupabase />;
  if (loading || authLoading) return <p className="text-slate-500">Memuat…</p>;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Hutang &amp; Pinjaman</h2><BrandSelect brands={brands} value={brandId} onChange={setBrandId} /></div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card><p className="text-xs font-semibold uppercase text-slate-500">Hutang perusahaan (sisa)</p><p className="mt-1 text-2xl font-bold">{formatIDR(companyDebt)}</p></Card>
        <Card><p className="text-xs font-semibold uppercase text-slate-500">Dibayar investor — bukan hutang perusahaan</p><p className="mt-1 text-2xl font-bold">{formatIDR(investorPaid)}</p><p className="text-xs text-slate-500">Contoh: SPayLater PETG. Dicatat di sini supaya jelas, tapi tidak masuk total hutang perusahaan.</p></Card>
      </div>
      <Card>
        <h3 className="font-bold">Tambah hutang / pinjaman</h3>
        {editable ? (<form onSubmit={add} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <select value={form.brand_id} onChange={(e) => setForm({ ...form, brand_id: e.target.value })} className="rounded-xl border px-3 py-2"><option value="">Brand (opsional)</option>{brands.map((b: Brand) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <input value={form.creditor} onChange={(e) => setForm({ ...form, creditor: e.target.value })} placeholder="Kreditur (mis. Febri)" className="rounded-xl border px-3 py-2" required />
          <input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Jumlah (Rp)" className="rounded-xl border px-3 py-2" required />
          <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="rounded-xl border px-3 py-2" />
          <input type="number" min="0" value={form.monthly_installment} onChange={(e) => setForm({ ...form, monthly_installment: e.target.value })} placeholder="Cicilan / bulan (Rp)" className="rounded-xl border px-3 py-2" />
          <input type="number" min="0" value={form.months} onChange={(e) => setForm({ ...form, months: e.target.value })} placeholder="Jangka (bulan)" className="rounded-xl border px-3 py-2" />
          <select value={form.paid_by} onChange={(e) => setForm({ ...form, paid_by: e.target.value as "company" | "investor" })} className="rounded-xl border px-3 py-2">
            <option value="company">Dibayar perusahaan</option>
            <option value="investor">Dibayar investor (bukan hutang perusahaan)</option>
          </select>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Catatan" className="rounded-xl border px-3 py-2 md:col-span-2" />
          <button className="rounded-xl bg-vektora-500 px-4 py-2 font-semibold text-white">Simpan</button>
        </form>) : (<ReadOnlyNotice role={role} />)}
      </Card>
      <Card>
        <ul className="divide-y">
          {filtered.map((l) => (
            <li key={l.id} className="py-3 text-sm">
              <div className="flex justify-between gap-2"><p className="font-medium">{l.creditor} — {l.brands?.name ?? "PT Vektora"}</p><b>{formatIDR(l.remaining_amount)}</b></div>
              <p className="text-xs text-slate-500">
                Total {formatIDR(l.amount)} · Jatuh tempo {formatDateID(l.due_date)} · Cicilan {l.monthly_installment ? formatIDR(l.monthly_installment) + "/bln" : "—"} · {l.months ?? "—"} bulan · {l.paid_by === "investor" ? "Dibayar investor" : "Dibayar perusahaan"} · {l.status}
                {l.notes ? ` · ${l.notes}` : ""}
              </p>
            </li>
          ))}
          {filtered.length === 0 && <li className="py-4 text-sm text-slate-500">Belum ada hutang.</li>}
        </ul>
      </Card>
    </div>
  );
}
