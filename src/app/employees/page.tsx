"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { fixedCostOpex } from "@/lib/types";
import type { Brand, EmployeeRow } from "@/lib/types";
import { formatIDR } from "@/lib/format";
import { AccessDenied, BrandSelect, Card, EmptySupabase, ReadOnlyNotice } from "@/components/ui";
import { canEdit, useAuth } from "@/lib/auth";

import { useBrandsChannels } from "@/lib/useData";

export default function EmployeesPage() {
  const { role, loading: authLoading } = useAuth();
  const editable = canEdit(role);
  const { brands } = useBrandsChannels();
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [brandId, setBrandId] = useState("all");
  const [loading, setLoading] = useState(true);
  // Sumber gaji: pilih SATU saja (radio) — OPEX atau Management Fee,
  // tidak bisa dua-duanya. Dipetakan ke is_fixed_cost / is_management
  // saat simpan (Mattin, 24 Nov 2026).
  const [form, setForm] = useState({ brand_id: "", name: "", role: "", team: "", monthly_salary: "", salary_source: "opex" });

  async function load() {
    const sb = getSupabase();
    if (!sb) return setLoading(false);
    const { data } = await sb.from("employees").select("*, brands(name)").order("name");
    if (data) setRows(data as EmployeeRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (brands.length && !form.brand_id) setForm((f) => ({ ...f, brand_id: brands[0].id })); }, [brands, form.brand_id]);

  const filtered = useMemo(() => rows.filter((r) => brandId === "all" || r.brand_id === brandId), [rows, brandId]);
  const opex = fixedCostOpex(filtered);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!editable) return;
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("employees").insert({ brand_id: form.brand_id, name: form.name, role: form.role || null, team: form.team || null, monthly_salary: Number(form.monthly_salary), is_fixed_cost: form.salary_source === "opex", is_management: form.salary_source === "fee", is_active: true });
    setForm((f) => ({ ...f, name: "", role: "", team: "", monthly_salary: "" }));
    load();
  }
  async function toggleActive(e: EmployeeRow) {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("employees").update({ is_active: !e.is_active }).eq("id", e.id);
    load();
  }

  if (!isSupabaseConfigured) return <EmptySupabase />;
  if (loading || authLoading) return <p className="text-slate-500">Memuat…</p>;
  if (role !== "admin" && role !== "management") return <AccessDenied text="Halaman Karyawan & Gaji hanya untuk admin dan management. Investor dan komisaris tidak bisa melihat detail gaji per karyawan (hanya total OPEX di dashboard). Karyawan melihat slip gajinya sendiri di halaman Slip Gaji." />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Karyawan &amp; Gaji (OPEX)</h2><BrandSelect brands={brands} value={brandId} onChange={setBrandId} /></div>
      <Card>
        <p className="text-xs font-semibold uppercase text-slate-500">Total gaji tetap / bulan (OPEX)</p>
        <p className="mt-1 text-3xl font-black">{formatIDR(opex)}</p>
        <p className="mt-1 text-xs text-slate-500">
          Hanya staf operasional yang <b>fixed cost</b> dan aktif. Manajemen <b>tidak</b> masuk OPEX — dibayar
          dari Management Fee. Gaji di sini adalah biaya tetap bulanan; pengeluaran lain tetap dicatat di
          Transaksi.
        </p>
      </Card>
      {editable ? (<Card>
        <h3 className="font-bold">Tambah karyawan</h3>
        <form onSubmit={add} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <select value={form.brand_id} onChange={(e) => setForm({ ...form, brand_id: e.target.value })} className="rounded-xl border px-3 py-2" required><option value="">Brand / tim…</option>{brands.map((b: Brand) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama" className="rounded-xl border px-3 py-2" required />
          <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Peran (mis. Operator 3D Print)" className="rounded-xl border px-3 py-2" />
          <input value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} placeholder="Tim (mis. Produksi WhereIsIt)" className="rounded-xl border px-3 py-2" />
          <input type="number" min="0" value={form.monthly_salary} onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })} placeholder="Gaji / bulan (Rp)" className="rounded-xl border px-3 py-2" required />
          <fieldset className="rounded-xl border px-3 py-2 sm:col-span-2">
            <legend className="px-1 text-xs font-semibold text-slate-500">Sumber gaji — pilih satu</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" name="salary_source" value="opex" checked={form.salary_source === "opex"} onChange={() => setForm({ ...form, salary_source: "opex" })} /> OPEX (fixed cost)</label>
              <label className="flex items-center gap-2"><input type="radio" name="salary_source" value="fee" checked={form.salary_source === "fee"} onChange={() => setForm({ ...form, salary_source: "fee" })} /> Management Fee</label>
            </div>
          </fieldset>
          <button className="rounded-xl bg-vektora-500 px-4 py-2 font-semibold text-white">Simpan</button>
        </form>
      </Card>) : (<ReadOnlyNotice role={role} />)}
      <Card>
        <ul className="divide-y">
          {filtered.map((e) => (
            <li key={e.id} className="flex justify-between gap-2 py-3 text-sm">
              <div className="min-w-0 flex-1"><p className="break-words font-medium">{e.name} {!e.is_active && <span className="text-slate-400">(nonaktif)</span>}</p><p className="text-xs text-slate-500">{e.brands?.name} · {e.role ?? "—"} · Tim {e.team ?? "—"} · {e.is_management ? "Manajemen (Fee)" : e.is_fixed_cost ? "Fixed cost (OPEX)" : "Variabel"}</p></div>
              <div className="flex flex-wrap items-center gap-3"><b className="shrink-0 whitespace-nowrap">{formatIDR(e.monthly_salary)}/bln</b><button onClick={() => toggleActive(e)} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{e.is_active ? "Nonaktifkan" : "Aktifkan"}</button></div>
            </li>
          ))}
          {filtered.length === 0 && <li className="py-4 text-sm text-slate-500">Belum ada karyawan. Gaji belum di-seed — isi angka sebenarnya di sini, jangan tebak.</li>}
        </ul>
      </Card>
    </div>
  );
}
