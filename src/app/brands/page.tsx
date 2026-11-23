"use client";

import { useEffect, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Brand } from "@/lib/types";
import { Card, EmptySupabase, ReadOnlyNotice } from "@/components/ui";
import { canEdit, useAuth } from "@/lib/auth";


export default function BrandsPage() {
  const { role, loading: authLoading } = useAuth();
  const editable = canEdit(role);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", slug: "", segment: "", description: "" });

  async function load() {
    const sb = getSupabase();
    if (!sb) return setLoading(false);
    const { data } = await sb.from("brands").select("*").order("name");
    if (data) setBrands(data as Brand[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!editable) return;
    const sb = getSupabase();
    if (!sb) return;
    const slug = form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const { error } = await sb.from("brands").insert({ name: form.name, slug, segment: form.segment || null, description: form.description || null, is_active: true });
    if (error) alert("Gagal: " + error.message);
    else { setForm({ name: "", slug: "", segment: "", description: "" }); load(); }
  }

  if (!isSupabaseConfigured) return <EmptySupabase />;
  if (loading || authLoading) return <p className="text-slate-500">Memuat…</p>;
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold">Brand — PT Vektora</h2>
      <p className="text-sm text-slate-600">Brand baru cukup ditambah di sini (atau INSERT ke tabel brands). Tidak perlu ubah kode: transaksi, aset, hutang, karyawan, dan fee split semuanya terikat ke brand_id.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {brands.map((b) => (
          <Card key={b.id}>
            <p className="text-lg font-bold">{b.name}</p>
            <p className="text-sm text-slate-500">{b.segment ?? "—"}</p>
            <p className="mt-2 text-sm">{b.description ?? ""}</p>
            <p className="mt-2 text-xs text-slate-400">slug: {b.slug} · {b.is_active ? "aktif" : "nonaktif"}</p>
          </Card>
        ))}
      </div>
      <Card>
        <h3 className="font-bold">Tambah brand baru</h3>
        {editable ? (<form onSubmit={add} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama brand (mis. Moonimo)" className="rounded-xl border px-3 py-2" required />
          <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="Slug (opsional, otomatis dari nama)" className="rounded-xl border px-3 py-2" />
          <input value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} placeholder="Segmen (mis. 3D print / fashion / dll)" className="rounded-xl border px-3 py-2" />
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Deskripsi singkat" className="rounded-xl border px-3 py-2" />
          <button className="rounded-xl bg-vektora-500 px-4 py-2 font-semibold text-white md:col-span-2">Tambah brand</button>
        </form>) : (<ReadOnlyNotice role={role} />)}
      </Card>
    </div>
  );
}
