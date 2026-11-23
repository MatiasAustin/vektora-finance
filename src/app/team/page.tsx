"use client";

import { useEffect, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { ALL_ROLES, ROLE_LABELS, canManageTeam, useAuth, usernameOf, type Role } from "@/lib/auth";
import type { Brand, Profile } from "@/lib/types";
import { AccessDenied, Card, EmptySupabase, ReadOnlyNotice } from "@/components/ui";
import { useBrandsChannels } from "@/lib/useData";

/**
 * /team — kelola pengguna & peran.
 * Admin: tambah/edit/nonaktifkan + atur peran & akses brand.
 * Management: hanya lihat daftar (baca saja).
 * PENTING: akun Auth (email + kata sandi) dibuat dulu di Supabase Dashboard →
 * Authentication → Add user. Profil di sini dihubungkan lewat Auth User ID
 * (uuid) dari user tersebut — tanpa itu profil tidak bisa dibuat karena
 * profiles.id adalah FK ke auth.users.
 */
export default function TeamPage() {
  const { role, loading: authLoading } = useAuth();
  const { brands } = useBrandsChannels();
  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({
    auth_user_id: "",
    email: "",
    full_name: "",
    role: "karyawan" as Role,
    brand_ids: [] as string[],
    employee_id: "",
  });

  async function load() {
    const sb = getSupabase();
    if (!sb) return setLoading(false);
    const { data } = await sb.from("profiles").select("*").order("full_name");
    if (data) setRows(data as Profile[]);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  function toggleBrand(id: string) {
    setForm((f) => ({
      ...f,
      brand_ids: f.brand_ids.includes(id) ? f.brand_ids.filter((x) => x !== id) : [...f.brand_ids, id],
    }));
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!canManageTeam(role)) return;
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from("profiles").insert({
      id: form.auth_user_id.trim(),
      email: form.email.trim(),
      full_name: form.full_name.trim() || null,
      role: form.role,
      brand_ids: form.brand_ids.length ? form.brand_ids : null,
      employee_id: form.employee_id.trim() || null,
      active: true,
    });
    if (error) setMsg("Gagal simpan: " + error.message + " — pastikan Auth User ID benar dan akun sudah dibuat di Supabase Auth.");
    else {
      setMsg("Profil tersimpan. User bisa masuk dengan email + kata sandi dari Supabase Auth.");
      setForm({ auth_user_id: "", email: "", full_name: "", role: "karyawan", brand_ids: [], employee_id: "" });
      load();
    }
  }

  async function setActive(p: Profile, active: boolean) {
    if (!canManageTeam(role)) return;
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("profiles").update({ active }).eq("id", p.id);
    load();
  }

  async function setRole(p: Profile, newRole: Role) {
    if (!canManageTeam(role)) return;
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("profiles").update({ role: newRole }).eq("id", p.id);
    load();
  }

  if (!isSupabaseConfigured) return <EmptySupabase />;
  if (authLoading || loading) return <p className="text-slate-500">Memuat…</p>;
  if (role !== "admin" && role !== "management") {
    return <AccessDenied text="Halaman Tim & Pengguna hanya untuk admin dan management." />;
  }

  const brandName = (id: string) => brands.find((b: Brand) => b.id === id)?.name ?? id;

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold">Tim &amp; Pengguna</h2>
      {role === "management" && <ReadOnlyNotice role={role} />}

      {canManageTeam(role) && (
        <Card>
          <h3 className="font-bold">Tambah pengguna (profil)</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            1) Buat dulu akunnya di Supabase Dashboard → Authentication → Add user. Email diisi{" "}
            <b>username@vektora.id</b> (januar / febri / komisaris-utama / komisaris-2 / lemuel), centang{" "}
            <b>Auto Confirm User</b>, isi kata sandi, lalu beri tahu kata sandi itu ke orangnya di luar app —
            jangan lewat chat di sini. 2) Salin <b>Auth User ID</b> (uuid) user itu dari Supabase, lalu isi
            form di bawah. 3) Peran menentukan apa yang bisa dilihat/dilakukan (lihat README → matriks peran).
          </p>
          <form onSubmit={add} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input value={form.auth_user_id} onChange={(e) => setForm({ ...form, auth_user_id: e.target.value })} placeholder="Auth User ID (uuid dari Supabase Auth)" className="rounded-xl border px-3 py-2 md:col-span-2" required />
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" type="email" className="rounded-xl border px-3 py-2" required />
            <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Nama lengkap" className="rounded-xl border px-3 py-2" required />
            <label className="text-sm">
              Peran
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className="ml-2 rounded-xl border px-2 py-1">
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </label>
            <input value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} placeholder="Employee ID (opsional, untuk karyawan — isi dari /employees)" className="rounded-xl border px-3 py-2" />
            <div className="md:col-span-2">
              <p className="text-sm font-medium">Akses brand (kosong = semua brand)</p>
              <div className="mt-1 flex flex-wrap gap-3">
                {brands.map((b: Brand) => (
                  <label key={b.id} className="flex items-center gap-1 text-sm">
                    <input type="checkbox" checked={form.brand_ids.includes(b.id)} onChange={() => toggleBrand(b.id)} /> {b.name}
                  </label>
                ))}
              </div>
            </div>
            <button className="rounded-xl bg-vektora-500 px-4 py-2 font-semibold text-white md:col-span-2">Simpan profil</button>
          </form>
          {msg && <p className="mt-2 text-sm">{msg}</p>}
        </Card>
      )}

      <Card>
        <ul className="divide-y">
          {rows.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div>
                <p className="font-medium">
                  {p.full_name ?? p.email} {!p.active && <span className="text-slate-400">(nonaktif)</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {p.email.endsWith("@vektora.id") ? `Username: ${usernameOf(p.email)}` : p.email}{" "}
                  · {ROLE_LABELS[p.role]} · Brand:{" "}
                  {!p.brand_ids || p.brand_ids.length === 0 ? "Semua brand" : p.brand_ids.map(brandName).join(", ")}
                  {p.employee_id ? " · Terkait karyawan" : ""}
                </p>
              </div>
              {canManageTeam(role) && (
                <div className="flex items-center gap-2">
                  <select
                    value={p.role}
                    onChange={(e) => setRole(p, e.target.value as Role)}
                    className="rounded-xl border px-2 py-1 text-sm"
                  >
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setActive(p, !p.active)}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold"
                  >
                    {p.active ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                </div>
              )}
            </li>
          ))}
          {rows.length === 0 && (
            <li className="py-4 text-sm text-slate-500">
              Belum ada profil. Buat user di Supabase Auth dulu, lalu tambahkan profilnya di sini. Contoh peran
              yang di-seed di SQL: Matias (admin), Januar (management), Febri (investor), Komisaris Utama &amp;
              Komisaris 2 (komisaris), Lemuel (karyawan).
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}
