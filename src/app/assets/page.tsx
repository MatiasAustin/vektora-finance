"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { AssetRow, Brand } from "@/lib/types";
import { formatDateID, formatIDR } from "@/lib/format";
import { AccessDenied, BrandSelect, Card, EmptySupabase, ReadOnlyNotice } from "@/components/ui";
import { canEdit, canManageTeam, canViewOperations, useAuth } from "@/lib/auth";
import { useBrandsChannels } from "@/lib/useData";

export default function AssetsPage() {
  const { role, loading: authLoading } = useAuth();
  const editable = canEdit(role);
  const canDelete = canManageTeam(role);
  const { brands } = useBrandsChannels();
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [brandId, setBrandId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({
    brand_id: "",
    name: "",
    category: "Printer 3D",
    qty: "1",
    unit_price: "",
    purchased_at: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  async function load() {
    const sb = getSupabase();
    if (!sb) return setLoading(false);
    const { data } = await sb.from("assets").select("*, brands(name)").order("purchased_at", { ascending: false });
    if (data) setRows(data as AssetRow[]);
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
  const total = filtered.reduce((s, r) => s + r.total_price, 0);
  const previewTotal = (Number(form.qty) || 0) * (Number(form.unit_price) || 0);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!editable) return;
    const sb = getSupabase();
    if (!sb) return;
    setMsg("");
    const qty = Number(form.qty);
    const unit = Number(form.unit_price);
    const { error } = await sb.from("assets").insert({
      brand_id: form.brand_id,
      name: form.name,
      category: form.category,
      qty,
      unit_price: unit,
      total_price: qty * unit,
      purchased_at: form.purchased_at,
      condition: "Baru",
      notes: form.notes || null,
    });
    if (error) {
      setMsg("Gagal simpan aset: " + error.message);
      return;
    }
    setMsg(`Aset "${form.name}" berhasil disimpan (${formatIDR(qty * unit)}).`);
    setForm((f) => ({ ...f, name: "", unit_price: "", notes: "" }));
    load();
  }

  async function removeAsset(a: AssetRow) {
    if (!canDelete) return;
    const sb = getSupabase();
    if (!sb) return;
    if (!window.confirm(`Hapus aset "${a.name}" senilai ${formatIDR(a.total_price)}?`)) return;
    const { error } = await sb.from("assets").delete().eq("id", a.id);
    if (error) setMsg("Gagal hapus aset: " + error.message);
    else {
      setMsg(`Aset "${a.name}" dihapus.`);
      load();
    }
  }

  if (!isSupabaseConfigured) return <EmptySupabase />;
  if (loading || authLoading) return <p className="text-blue-200/70">Memuat aset…</p>;
  if (!canViewOperations(role)) return <AccessDenied />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Aset &amp; Investasi</h2>
          <p className="text-xs text-blue-200/75">
            Mesin, printer 3D, filamen modal, dan inventaris yang dibeli dari investasi (bukan beban OPEX).
          </p>
        </div>
        <BrandSelect brands={brands} value={brandId} onChange={setBrandId} />
      </div>

      {/* Kartu Hero Aset Bergaya Glossy Finora */}
      <div className="finora-glossy-card rounded-3xl p-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-100/80">Total Nilai Aset &amp; Inventaris</p>
        <p className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{formatIDR(total)}</p>
        <p className="mt-2 text-xs text-blue-100/85">
          {filtered.length} item terdaftar · Pembelian aset dari modal/pinjaman dicatat di sini agar tidak mengurangi laba operasional.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-white">Tambah Aset Baru</h3>
          {editable && previewTotal > 0 && (
            <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-blue-500/20 px-3.5 py-1.5 text-xs font-bold leading-none text-blue-200 ring-1 ring-blue-400/30">
              Pratinjau Total: {formatIDR(previewTotal)}
            </span>
          )}
        </div>
        {editable ? (
          <form onSubmit={add} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-xs text-blue-200/80">
              Brand
              <select
                value={form.brand_id}
                onChange={(e) => setForm({ ...form, brand_id: e.target.value })}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                required
              >
                <option value="">Pilih brand…</option>
                {brands.map((b: Brand) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-blue-200/80">
              Nama Aset
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Mis. Bambulab P2S Combo"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block text-xs text-blue-200/80">
              Kategori
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              >
                {[
                  "Printer 3D",
                  "Filamen / Investasi",
                  "Mesin & Peralatan",
                  "Perangkat / Elektronik",
                  "Inventaris Kantor",
                  "Lainnya",
                ].map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-blue-200/80">
              Jumlah (Qty)
              <input
                type="number"
                min="0.01"
                step="any"
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })}
                placeholder="1"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block text-xs text-blue-200/80">
              Harga Satuan (Rp)
              <input
                type="number"
                min="0"
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                placeholder="0"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-bold"
                required
              />
            </label>
            <label className="block text-xs text-blue-200/80">
              Tanggal Pembelian
              <input
                type="date"
                value={form.purchased_at}
                onChange={(e) => setForm({ ...form, purchased_at: e.target.value })}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-blue-200/80 sm:col-span-2">
              Catatan (Nota, Toko, Sumber Dana)
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Mis. Pembelian via Tokopedia Official Store"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </label>
            <div className="flex items-end">
              <button className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500">
                Simpan Aset {previewTotal > 0 ? `(${formatIDR(previewTotal)})` : ""}
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
        <h3 className="text-base font-bold text-white">Daftar Aset Terdaftar ({filtered.length})</h3>
        <ul className="mt-4 space-y-2.5">
          {filtered.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="break-words font-semibold text-white">{a.name}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {a.brands?.name} · {a.category ?? "—"} · Qty {a.qty} × {formatIDR(a.unit_price)} · Beli:{" "}
                  {formatDateID(a.purchased_at)}
                  {a.notes ? ` · ${a.notes}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <b className="shrink-0 whitespace-nowrap text-base text-white">{formatIDR(a.total_price)}</b>
                {canDelete && (
                  <button
                    onClick={() => removeAsset(a)}
                    className="rounded-xl border border-rose-400/25 bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-200 hover:bg-rose-500/30"
                  >
                    Hapus
                  </button>
                )}
              </div>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="rounded-2xl border border-white/5 bg-white/[0.02] py-8 text-center text-sm text-slate-400">
              Belum ada aset tercatat.
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}

