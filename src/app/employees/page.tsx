"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { fixedCostOpex } from "@/lib/types";
import type { Brand, EmployeeRow, Profile } from "@/lib/types";
import { formatIDR } from "@/lib/format";
import { AccessDenied, BrandSelect, Card, EmptySupabase, ReadOnlyNotice } from "@/components/ui";
import { canEdit, canManageTeam, ROLE_LABELS, useAuth } from "@/lib/auth";

import { useBrandsChannels } from "@/lib/useData";

export default function EmployeesPage() {
  const { role, loading: authLoading } = useAuth();
  const editable = canEdit(role);
  const { brands } = useBrandsChannels();
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  // Tim terdaftar (tabel profiles) — dipakai dropdown "Nama" (24 Nov 2026):
  // jangan ketik manual kalau orangnya sudah terdaftar. Dibaca seperti
  // /team (select * from profiles) — RLS profiles mengizinkan baca untuk
  // admin/management, dan halaman ini memang hanya untuk mereka.
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [brandId, setBrandId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [formMsg, setFormMsg] = useState("");
  // Sumber gaji: pilih SATU saja (radio) — OPEX atau Management Fee,
  // tidak bisa dua-duanya. Dipetakan ke is_fixed_cost / is_management
  // saat simpan (Mattin, 24 Nov 2026).
  const [form, setForm] = useState({ brand_id: "", profile_id: "", name: "", role: "", team: "", monthly_salary: "", salary_source: "opex" });

  async function load() {
    const sb = getSupabase();
    if (!sb) return setLoading(false);
    const [e, p] = await Promise.all([
      sb.from("employees").select("*, brands(name)").order("name"),
      sb.from("profiles").select("*").eq("active", true).order("full_name"),
    ]);
    if (e.data) setRows(e.data as EmployeeRow[]);
    if (p.data) setProfiles(p.data as Profile[]);
    setLoading(false);
  }

  // Pilih tim terdaftar dari dropdown: nama terisi otomatis (read-only),
  // peran disarankan dari label peran profilnya (bisa diubah); tim TIDAK
  // ditebak — dibiarkan kosong dan bisa diisi manual. "new" = orang baru
  // yang belum punya profil → ketik manual seperti dulu.
  function pickProfile(profileId: string) {
    if (profileId === "new") {
      setForm((f) => ({ ...f, profile_id: "new", name: "", role: "" }));
      return;
    }
    const p = profiles.find((x) => x.id === profileId);
    if (!p) {
      setForm((f) => ({ ...f, profile_id: "" }));
      return;
    }
    setForm((f) => ({ ...f, profile_id: p.id, name: p.full_name ?? p.email, role: ROLE_LABELS[p.role] }));
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
    setFormMsg("");
    const picked = form.profile_id && form.profile_id !== "new" ? profiles.find((x) => x.id === form.profile_id) : null;
    // Jangan buat baris karyawan ganda untuk orang yang sama: bila profil
    // yang dipilih sudah terhubung ke baris employees yang ada, tolak.
    if (picked?.employee_id && rows.some((r) => r.id === picked.employee_id)) {
      setFormMsg(`Orang ini sudah terdaftar sebagai karyawan (${picked.full_name ?? picked.email}) — tidak dibuat lagi.`);
      return;
    }
    const name = picked ? picked.full_name ?? picked.email : form.name.trim();
    if (!name) {
      setFormMsg("Nama belum diisi.");
      return;
    }
    const { data: inserted, error } = await sb
      .from("employees")
      .insert({ brand_id: form.brand_id, name, role: form.role || null, team: form.team || null, monthly_salary: Number(form.monthly_salary), is_fixed_cost: form.salary_source === "opex", is_management: form.salary_source === "fee", is_active: true })
      .select()
      .single();
    if (error || !inserted) {
      setFormMsg("Gagal simpan: " + (error?.message ?? "unknown"));
      return;
    }
    // Tautkan balik ke profil supaya orangnya bisa melihat slip gajinya
    // sendiri di /payslips (filter employee_id profilnya). RLS profiles
    // hanya mengizinkan tulis untuk admin — bila gagal (mis. yang simpan
    // management), karyawan tetap tersimpan; hanya tautannya yang tertunda.
    if (picked) {
      const { error: linkErr } = await sb.from("profiles").update({ employee_id: (inserted as EmployeeRow).id }).eq("id", picked.id);
      if (linkErr) setFormMsg(`Karyawan tersimpan, tapi profil ${picked.full_name ?? picked.email} belum tertaut (perlu admin): ${linkErr.message}`);
      else setFormMsg(`Karyawan tersimpan dan tertaut ke profil ${picked.full_name ?? picked.email}.`);
    } else {
      setFormMsg("Karyawan tersimpan.");
    }
    setForm((f) => ({ ...f, profile_id: "", name: "", role: "", team: "", monthly_salary: "" }));
    load();
  }
  async function toggleActive(e: EmployeeRow) {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("employees").update({ is_active: !e.is_active }).eq("id", e.id);
    load();
  }

  // Hapus karyawan (admin saja, 24 Nov 2026). Konfirmasi dulu; bila sudah
  // punya slip gaji, peringatannya disebut di konfirmasi — slip lama TETAP
  // tersimpan dan bisa dibuka (payslips.employee_id ON DELETE SET NULL +
  // snapshot employee_name; lihat schema.sql). Tautan profiles.employee_id
  // dibersihkan eksplisit (FK-nya juga ON DELETE SET NULL).
  async function removeEmployee(e: EmployeeRow) {
    if (!canManageTeam(role)) return;
    const sb = getSupabase();
    if (!sb) return;
    const { count } = await sb.from("payslips").select("id", { count: "exact", head: true }).eq("employee_id", e.id);
    const n = count ?? 0;
    const ok = window.confirm(
      `Hapus ${e.name} dari daftar karyawan?` +
        (n > 0
          ? `\n\nOrang ini sudah punya ${n} slip gaji. Slip lama tetap tersimpan dan tetap bisa dibuka (namanya tersimpan di slip).`
          : "") +
        `\n\nTindakan ini tidak bisa dibatalkan.`
    );
    if (!ok) return;
    const { error: linkErr } = await sb.from("profiles").update({ employee_id: null }).eq("employee_id", e.id);
    if (linkErr) setFormMsg(`Tautan profil gagal dibersihkan: ${linkErr.message}`);
    const { error } = await sb.from("employees").delete().eq("id", e.id);
    if (error) setFormMsg("Gagal hapus: " + error.message);
    else setFormMsg(`${e.name} dihapus dari daftar karyawan.`);
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
          <select value={form.profile_id} onChange={(e) => pickProfile(e.target.value)} className="rounded-xl border px-3 py-2" required>
            <option value="">Pilih tim terdaftar…</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name ?? p.email} — {ROLE_LABELS[p.role]}</option>
            ))}
            <option value="new">Orang baru — ketik manual</option>
          </select>
          {form.profile_id && form.profile_id !== "new" ? (
            <input value={form.name} readOnly title="Nama dari profil terdaftar" className="rounded-xl border bg-slate-50 px-3 py-2 text-slate-600" />
          ) : (
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama" className="rounded-xl border px-3 py-2" required={form.profile_id === "new"} disabled={!form.profile_id} />
          )}
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
        {formMsg && <p className="mt-2 text-sm">{formMsg}</p>}
        <p className="mt-2 text-xs text-slate-500">Pilih nama dari dropdown bila orangnya sudah punya akun/profil (Matias, Januar, Avrina, Lemuel, Rohimat, Febri, komisaris) — tidak perlu ketik manual. "Orang baru" hanya untuk orang yang benar-benar belum terdaftar.</p>
      </Card>) : (<ReadOnlyNotice role={role} />)}
      {/* Daftar dipisah (24 Nov 2026, Mattin: "Lemuel bukan karyawan") —
          karyawan operasional vs management. Total OPEX di atas tetap hanya
          menghitung karyawan operasional (fixedCostOpex). */}
      <Card>
        <h3 className="font-bold">Karyawan operasional (OPEX)</h3>
        <ul className="divide-y">
          {filtered.filter((e) => !e.is_management).map((e) => (
            <li key={e.id} className="flex justify-between gap-2 py-3 text-sm">
              <div className="min-w-0 flex-1"><p className="break-words font-medium">{e.name} {!e.is_active && <span className="text-slate-400">(nonaktif)</span>}</p><p className="text-xs text-slate-500">{e.brands?.name} · {e.role ?? "—"} · Tim {e.team ?? "—"} · {e.is_fixed_cost ? "Fixed cost (OPEX)" : "Variabel"}</p></div>
              <div className="flex flex-wrap items-center gap-3"><b className="shrink-0 whitespace-nowrap">{formatIDR(e.monthly_salary)}/bln</b><button onClick={() => toggleActive(e)} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{e.is_active ? "Nonaktifkan" : "Aktifkan"}</button>{canManageTeam(role) && <button onClick={() => removeEmployee(e)} className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">Hapus</button>}</div>
            </li>
          ))}
          {filtered.filter((e) => !e.is_management).length === 0 && <li className="py-4 text-sm text-slate-500">Belum ada karyawan operasional. Gaji belum di-seed — isi angka sebenarnya di sini, jangan tebak.</li>}
        </ul>
      </Card>
      <Card>
        <h3 className="font-bold">Management (dibayar dari Management Fee)</h3>
        <p className="mt-1 text-xs text-slate-500">Bukan karyawan operasional — gajinya keluar dari Management Fee, bukan OPEX. Mereka tetap dapat slip gaji di /payslips, dan dapat slip fee di /fee-split.</p>
        <ul className="divide-y">
          {filtered.filter((e) => e.is_management).map((e) => (
            <li key={e.id} className="flex justify-between gap-2 py-3 text-sm">
              <div className="min-w-0 flex-1"><p className="break-words font-medium">{e.name} {!e.is_active && <span className="text-slate-400">(nonaktif)</span>}</p><p className="text-xs text-slate-500">{e.brands?.name} · {e.role ?? "—"} · Tim {e.team ?? "—"} · Manajemen (Fee)</p></div>
              <div className="flex flex-wrap items-center gap-3"><b className="shrink-0 whitespace-nowrap">{formatIDR(e.monthly_salary)}/bln</b><button onClick={() => toggleActive(e)} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{e.is_active ? "Nonaktifkan" : "Aktifkan"}</button>{canManageTeam(role) && <button onClick={() => removeEmployee(e)} className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">Hapus</button>}</div>
            </li>
          ))}
          {filtered.filter((e) => e.is_management).length === 0 && <li className="py-4 text-sm text-slate-500">Belum ada management yang terdaftar sebagai tim.</li>}
        </ul>
      </Card>
    </div>
  );
}
