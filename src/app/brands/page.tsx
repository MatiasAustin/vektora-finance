"use client";

import { useEffect, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Brand } from "@/lib/types";
import { AccessDenied, Card, EmptySupabase, ReadOnlyNotice } from "@/components/ui";
import { canEdit, canViewOperations, useAuth } from "@/lib/auth";
import { compressLogoFile, getBrandLogo, setLocalBrandLogo } from "@/lib/brandLogo";

export default function BrandsPage() {
  const { role, profile, loading: authLoading } = useAuth();
  const editable = canEdit(role, profile);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", segment: "", description: "", logo_url: "" });
  const [newLogoInfo, setNewLogoInfo] = useState<string>("");

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

  async function handleNewLogoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await compressLogoFile(file, 240, 0.82);
      setForm((f) => ({ ...f, logo_url: res.dataUrl }));
      setNewLogoInfo(`Auto-compressed: ${res.width}×${res.height}px (~${res.sizeKB} KB)`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Gagal memproses logo.");
    }
  }

  async function handleCardLogoUpload(brand: Brand, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editable) return;
    setUploadingId(brand.id);
    setMsg("");
    try {
      const res = await compressLogoFile(file, 240, 0.82);
      setLocalBrandLogo(brand, res.dataUrl);
      const sb = getSupabase();
      if (sb) {
        const { error } = await sb.from("brands").update({ logo_url: res.dataUrl }).eq("id", brand.id);
        if (error) {
          // Bila kolom logo_url belum dimigrasi di Supabase, tetap tersimpan di perangkat & state
          setBrands((prev) => prev.map((b) => (b.id === brand.id ? { ...b, logo_url: res.dataUrl } : b)));
          setMsg(
            `Logo "${brand.name}" berhasil dikompres (${res.width}×${res.height}px, ~${res.sizeKB} KB) & aktif di perangkat ini. (Tips: jalankan ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS logo_url text; di Supabase SQL agar tersinkron ke semua perangkat).`
          );
          setUploadingId(null);
          return;
        }
      }
      setMsg(`Logo "${brand.name}" berhasil diupload & dikompres otomatis (${res.width}×${res.height}px, ~${res.sizeKB} KB).`);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Gagal upload logo.");
    } finally {
      setUploadingId(null);
      e.target.value = "";
    }
  }

  async function removeBrandLogo(brand: Brand) {
    if (!editable) return;
    setLocalBrandLogo(brand, null);
    const sb = getSupabase();
    if (sb) {
      await sb.from("brands").update({ logo_url: null }).eq("id", brand.id);
    }
    setBrands((prev) => prev.map((b) => (b.id === brand.id ? { ...b, logo_url: null } : b)));
    setMsg(`Logo "${brand.name}" dihapus.`);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!editable) return;
    const sb = getSupabase();
    if (!sb) return;
    setMsg("");
    const slug = form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const payload: Record<string, unknown> = {
      name: form.name,
      slug,
      segment: form.segment || null,
      description: form.description || null,
      is_active: true,
    };
    if (form.logo_url) payload.logo_url = form.logo_url;

    let { error } = await sb.from("brands").insert(payload);
    if (error && form.logo_url && error.message.includes("logo_url")) {
      // Fallback bila kolom logo_url belum ada di tabel Supabase
      delete payload.logo_url;
      const retry = await sb.from("brands").insert(payload);
      error = retry.error;
    }

    if (error) setMsg("Gagal simpan brand: " + error.message);
    else {
      if (form.logo_url) {
        setLocalBrandLogo({ id: slug, slug }, form.logo_url);
      }
      setMsg(`Brand "${form.name}" berhasil ditambahkan.`);
      setForm({ name: "", slug: "", segment: "", description: "", logo_url: "" });
      setNewLogoInfo("");
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
          Setiap brand memiliki kartu pembukuan mandiri serta logo resmi (otomatis dikompres) yang digunakan pada <b>Auto-Invoice</b> dan <b>Slip Gaji</b>.
        </p>
      </div>

      {msg && (
        <div className="rounded-2xl border border-blue-400/30 bg-blue-500/15 px-3.5 py-2.5 text-xs text-blue-100">
          {msg}
        </div>
      )}

      {/* Kartu Brand Bergaya Finora Glossy Cards */}
      <div className="grid gap-3.5 md:grid-cols-2">
        {brands.map((b, idx) => {
          const codeTail = b.slug.slice(0, 4).toUpperCase().padEnd(4, "0");
          const logoSrc = getBrandLogo(b);
          return (
            <div
              key={b.id}
              className={`${
                idx % 2 === 0 ? "finora-glossy-card" : "finora-glossy-card-alt"
              } relative flex flex-col justify-between rounded-3xl p-5 text-white`}
            >
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {logoSrc ? (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/25 bg-white/95 p-1.5 shadow-md">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={logoSrc} alt={b.name} className="max-h-full max-w-full object-contain" />
                    </div>
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/15 text-base font-black text-white shadow-inner">
                      {b.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-blue-100/80">
                      PT Vektora Brand Card
                    </span>
                    <h3 className="mt-0.5 truncate text-lg font-black tracking-tight text-white">{b.name}</h3>
                  </div>
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

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/15 pt-3 text-xs text-blue-100/85">
                <span className="font-mono tracking-widest">**** **** **** {codeTail}</span>
                {editable ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <label className="cursor-pointer rounded-lg border border-white/20 bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-white/25">
                      {uploadingId === b.id ? "Mengompres…" : logoSrc ? "Ganti Logo" : "⬆ Upload Logo"}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleCardLogoUpload(b, e)}
                        className="hidden"
                      />
                    </label>
                    {logoSrc && (
                      <button
                        type="button"
                        onClick={() => removeBrandLogo(b)}
                        className="rounded-lg bg-rose-500/30 px-2 py-1 text-[11px] font-semibold text-rose-100 hover:bg-rose-500/50"
                        title="Hapus logo brand"
                      >
                        Hapus Logo
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleBrandActive(b)}
                      className="rounded-lg bg-black/25 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-black/40"
                    >
                      {b.is_active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  </div>
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
                className="mt-1 w-full rounded-xl border px-3 py-2 text-xs"
                required
              />
            </label>
            <label className="block text-xs text-blue-200/80">
              Slug URL (Opsional, otomatis dibuat dari nama)
              <input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="moonimo"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-xs"
              />
            </label>
            <label className="block text-xs text-blue-200/80">
              Segmen Bisnis
              <input
                value={form.segment}
                onChange={(e) => setForm({ ...form, segment: e.target.value })}
                placeholder="Mis. 3D Print / Fashion / F&B"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-xs"
              />
            </label>
            <label className="block text-xs text-blue-200/80">
              Deskripsi Singkat
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Penjelasan singkat produk/layanan brand"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-xs"
              />
            </label>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {form.logo_url ? (
                    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-white/20 bg-white p-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={form.logo_url} alt="Preview logo" className="max-h-full max-w-full object-contain" />
                    </div>
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/5 text-[11px] font-bold text-blue-200">
                      LOGO
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-white">Logo Brand (Auto-Compress)</p>
                    <p className="text-[11px] text-slate-400">
                      {newLogoInfo || "Otomatis diperkecil ke maks. 240px (WebP ~10-20 KB) agar ringan untuk Invoice & Slip Gaji."}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer rounded-xl border border-blue-400/30 bg-blue-500/20 px-3 py-1.5 text-xs font-semibold text-blue-100 hover:bg-blue-500/30">
                    Pilih File Gambar…
                    <input type="file" accept="image/*" onChange={handleNewLogoPick} className="hidden" />
                  </label>
                  {form.logo_url && (
                    <button
                      type="button"
                      onClick={() => {
                        setForm((f) => ({ ...f, logo_url: "" }));
                        setNewLogoInfo("");
                      }}
                      className="rounded-xl bg-rose-500/20 px-2.5 py-1.5 text-xs font-semibold text-rose-200"
                    >
                      Hapus
                    </button>
                  )}
                </div>
              </div>
            </div>

            <button className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500 sm:col-span-2">
              + Simpan Brand Baru
            </button>
          </form>
        ) : (
          <div className="mt-3">
            <ReadOnlyNotice role={role} />
          </div>
        )}
      </Card>
    </div>
  );
}


