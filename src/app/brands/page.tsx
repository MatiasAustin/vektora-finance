"use client";

import { useEffect, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Brand } from "@/lib/types";
import { AccessDenied, Card, EmptySupabase, ReadOnlyNotice } from "@/components/ui";
import { canEdit, canViewOperations, useAuth } from "@/lib/auth";

export default function BrandsPage() {
  const { role, loading: authLoading } = useAuth();
  const editable = canEdit(role);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ name: "", slug: "", segment: "", description: "" });

  async function load() {
    const sb = getSupabase();
    if (!sb) return setLoading(false);
    const { data } = await sb.from("brands").select("*").order("name");
    if (data) setBrands(data as Brand[]);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!editable) return;
    const sb = getSupabase();
    if (!sb) return;
    setMsg("");
    const slug = form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const { error } = await sb.from("brands").insert({
      name: form.name,
      slug,
      segment: form.segment || null,
      description: form.description || null,
      is_active: true,
    });
    if (error) setMsg("Gagal simpan brand: " + error.message);
    else {
      setMsg(`Brand "${form.name}" berhasil ditambahkan.`);
      setForm({ name: "", slug: "", segment: "", description: "" });
      load();
    }
  }

  async function toggleBrandActive(b: Brand) {
    if (!editable) return;
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("brands").update({ is_active: !b.is_active }).eq("id", b.id);
    load();
  }

  if (!isSupabaseConfigured) return <EmptySupabase />;
  if (loading || authLoading) return <p className="text-blue-200/70">Memuat brand…</p>;
  if (!canViewOperations(role)) return <AccessDenied />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-white sm:text-lg">Brand &amp; Kartu Unit Bisnis — PT Vektora</h2>
        <p className="text-[11px] text-blue-200/75">
          Setiap brand memiliki kartu pembukuan mandiri untuk transaksi, aset, hutang, karyawan, dan rasio pembagian fee.
        </p>
      </div>

      {/* Kartu Brand Bergaya Finora Glossy Cards */}
      <div className="grid gap-3.5 md:grid-cols-2">
        {brands.map((b, idx) => {
          const codeTail = b.slug.slice(0, 4).toUpperCase().padEnd(4, "0");
          return (
            <div
              key={b.id}
              className={`${
                idx % 2 === 0 ? "finora-glossy-card" : "finora-glossy-card-alt"
              } relative flex flex-col justify-between rounded-3xl p-5 text-white`}
            >
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-blue-100/80">
                    PT Vektora Brand Card
                  </span>
                  <h3 className="mt-0.5 truncate text-lg font-black tracking-tight text-white">{b.name}</h3>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-white/15 px-3 py-1 text-[10px] font-bold leading-none ${
                    b.is_active ? "bg-white/20 text-white" : "bg-black/40 text-slate-300"
                  }`}
                >
                  {b.is_active ? "Aktif" : "Nonaktif"}
                </span>
              </div>

              <div className="my-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-100/80">
                  Segmen: {b.segment ?? "Multi-Segmen"}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-blue-50/90">
                  {b.description ?? "Unit bisnis di bawah manajemen PT Vektora Teknologi Nusantara."}
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-white/15 pt-3 text-xs text-blue-100/85">
                <span className="font-mono tracking-widest">**** **** **** {codeTail}</span>
                {editable ? (
                  <button
                    onClick={() => toggleBrandActive(b)}
                    className="rounded-lg bg-black/25 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-black/40"
                  >
                    {b.is_active ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                ) : (
                  <span>slug: {b.slug}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Card>
        <h3 className="text-sm font-bold text-white">Tambah Brand Baru (Add +)</h3>
        {editable ? (
          <form onSubmit={add} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs text-blue-200/80">
              Nama Brand
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Mis. Moonimo"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block text-xs text-blue-200/80">
              Slug URL (Opsional, otomatis dibuat dari nama)
              <input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="moonimo"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-blue-200/80">
              Segmen Bisnis
              <input
                value={form.segment}
                onChange={(e) => setForm({ ...form, segment: e.target.value })}
                placeholder="Mis. 3D Print / Fashion / F&B"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-blue-200/80">
              Deskripsi Singkat
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Penjelasan singkat produk/layanan brand"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </label>
            <button className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500 sm:col-span-2">
              + Simpan Brand Baru
            </button>
          </form>
        ) : (
          <div className="mt-3">
            <ReadOnlyNotice role={role} />
          </div>
        )}
        {msg && <p className="mt-3 text-xs font-medium text-blue-200">{msg}</p>}
      </Card>
    </div>
  );
}

