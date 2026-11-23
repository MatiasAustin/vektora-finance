"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { AssetRow, Brand } from "@/lib/types";
import { formatDateID, formatIDR } from "@/lib/format";
import { BrandSelect, Card, EmptySupabase, ReadOnlyNotice } from "@/components/ui";
import { canEdit, useAuth } from "@/lib/auth";

import { useBrandsChannels } from "@/lib/useData";

export default function AssetsPage() {
  const { role, loading: authLoading } = useAuth();
  const editable = canEdit(role);
  const { brands } = useBrandsChannels();
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [brandId, setBrandId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ brand_id: "", name: "", category: "Printer 3D", qty: "1", unit_price: "", purchased_at: new Date().toISOString().slice(0, 10), notes: "" });

  async function load() {
    const sb = getSupabase();
    if (!sb) return setLoading(false);
    const { data } = await sb.from("assets").select("*, brands(name)").order("purchased_at", { ascending: false });
    if (data) setRows(data as AssetRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (brands.length && !form.brand_id) setForm((f) => ({ ...f, brand_id: brands[0].id })); }, [brands, form.brand_id]);

  const filtered = useMemo(() => rows.filter((r) => brandId === "all" || r.brand_id === brandId), [rows, brandId]);
  const total = filtered.reduce((s, r) => s + r.total_price, 0);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!editable) return;
    const sb = getSupabase();
    if (!sb) return;
    const qty = Number(form.qty), unit = Number(form.unit_price);
    await sb.from("assets").insert({ brand_id: form.brand_id, name: form.name, category: form.category, qty, unit_price: unit, total_price: qty * unit, purchased_at: form.purchased_at, condition: "Baru", notes: form.notes || null });
    setForm((f) => ({ ...f, name: "", unit_price: "", notes: "" }));
    load();
  }

  if (!isSupabaseConfigured) return <EmptySupabase />;
  if (loading || authLoading) return <p className="text-slate-500">Memuat…</p>;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Aset &amp; Investasi</h2><BrandSelect brands={brands} value={brandId} onChange={setBrandId} /></div>
      <Card><p className="text-xs font-semibold uppercase text-slate-500">Total nilai aset</p><p className="mt-1 text-3xl font-black">{formatIDR(total)}</p><p className="text-xs text-slate-500">Aset dibeli dari modal/investasi. Filamen &amp; printer dicatat di sini, bukan sebagai pengeluaran operasional.</p></Card>
      <Card>
        <h3 className="font-bold">Tambah aset</h3>
        {editable ? (<form onSubmit={add} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <select value={form.brand_id} onChange={(e) => setForm({ ...form, brand_id: e.target.value })} className="rounded-xl border px-3 py-2" required><option value="">Brand…</option>{brands.map((b: Brand) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama aset (mis. Bambulab P2S Combo)" className="rounded-xl border px-3 py-2" required />
          <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Kategori" className="rounded-xl border px-3 py-2" />
          <input type="number" min="0" step="any" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} placeholder="Qty" className="rounded-xl border px-3 py-2" required />
          <input type="number" min="0" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} placeholder="Harga satuan (Rp)" className="rounded-xl border px-3 py-2" required />
          <input type="date" value={form.purchased_at} onChange={(e) => setForm({ ...form, purchased_at: e.target.value })} className="rounded-xl border px-3 py-2" />
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Catatan (nota, toko, cara bayar)" className="rounded-xl border px-3 py-2 md:col-span-2" />
          <button className="rounded-xl bg-vektora-500 px-4 py-2 font-semibold text-white">Simpan aset</button>
        </form>) : (<ReadOnlyNotice role={role} />)}
      </Card>
      <Card>
        <ul className="divide-y">
          {filtered.map((a) => (
            <li key={a.id} className="flex justify-between gap-2 py-3 text-sm">
              <div className="min-w-0 flex-1"><p className="break-words font-medium">{a.name}</p><p className="text-xs text-slate-500">{a.brands?.name} · {a.category ?? "—"} · Qty {a.qty} · {formatDateID(a.purchased_at)}{a.notes ? ` · ${a.notes}` : ""}</p></div>
              <b className="shrink-0 whitespace-nowrap">{formatIDR(a.total_price)}</b>
            </li>
          ))}
          {filtered.length === 0 && <li className="py-4 text-sm text-slate-500">Belum ada aset.</li>}
        </ul>
      </Card>
    </div>
  );
}
