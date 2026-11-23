"use client";

import { useEffect, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Brand, Channel } from "@/lib/types";
import { Card, EmptySupabase, ReadOnlyNotice } from "@/components/ui";
import { canEdit, useAuth } from "@/lib/auth";

import { useBrandsChannels } from "@/lib/useData";

export default function SettingsPage() {
  const { role } = useAuth();
  const editable = canEdit(role);
  const { brands, channels } = useBrandsChannels();
  const [allChannels, setAllChannels] = useState<Channel[]>(channels);
  const [form, setForm] = useState({ brand_id: "", name: "", slug: "" });

  useEffect(() => { setAllChannels(channels); }, [channels]);

  async function addChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!editable) return;
    const sb = getSupabase();
    if (!sb) return;
    const slug = form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const { error } = await sb.from("channels").insert({ brand_id: form.brand_id || null, name: form.name, slug, is_active: true });
    if (error) alert("Gagal: " + error.message);
    else { setForm({ brand_id: "", name: "", slug: "" }); location.reload(); }
  }

  if (!isSupabaseConfigured) return <EmptySupabase />;
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold">Pengaturan — Channel &amp; Kategori</h2>
      <Card>
        <h3 className="font-bold">Channel penjualan / sumber pemasukan</h3>
        <p className="mt-1 text-sm text-slate-600">
          Channel bisa global (dipakai semua brand, brand kosong) atau per brand. Sumber baru yang belum
          diketahui hari ini cukup ditambah di sini — transaksi lama tidak berubah.
        </p>
        <ul className="mt-3 divide-y text-sm">
          {allChannels.map((c) => (
            <li key={c.id} className="flex justify-between py-2">
              <span>{c.name}</span>
              <span className="text-slate-500">{brands.find((b: Brand) => b.id === c.brand_id)?.name ?? "Semua brand"} · {c.slug}</span>
            </li>
          ))}
          {allChannels.length === 0 && <li className="py-2 text-slate-500">Belum ada channel.</li>}
        </ul>
      </Card>
      <Card>
        <h3 className="font-bold">Tambah channel baru</h3>
        {editable ? (<form onSubmit={addChannel} className="mt-3 grid gap-3 md:grid-cols-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama channel (mis. TikTok Shop)" className="rounded-xl border px-3 py-2" required />
          <select value={form.brand_id} onChange={(e) => setForm({ ...form, brand_id: e.target.value })} className="rounded-xl border px-3 py-2">
            <option value="">Semua brand</option>
            {brands.map((b: Brand) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button className="rounded-xl bg-vektora-500 px-4 py-2 font-semibold text-white">Tambah channel</button>
        </form>) : (<ReadOnlyNotice role={role} />)}
      </Card>
      <Card>
        <h3 className="font-bold">Kategori</h3>
        <p className="mt-1 text-sm text-slate-600">
          Kategori transaksi (Operasional, Bahan Baku, Transportasi, Makan/minum, dll.) adalah teks bebas di
          setiap transaksi — tidak perlu daftar tertutup, supaya kategori baru dari brand/segmen baru bisa
          langsung dipakai. Kalau mau dibakukan, tambahkan tabel <code>categories</code> di Supabase dan
          ganti input kategori di halaman Transaksi menjadi dropdown.
        </p>
      </Card>
    </div>
  );
}
