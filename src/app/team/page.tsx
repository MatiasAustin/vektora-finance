"use client";

import { useEffect, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { ALL_ROLES, ROLE_LABELS, canManageTeam, useAuth, usernameOf, type Role } from "@/lib/auth";
import type { Brand, EmployeeRow, Profile } from "@/lib/types";
import { AccessDenied, Card, EmptySupabase, ReadOnlyNotice } from "@/components/ui";
import { useBrandsChannels } from "@/lib/useData";

export default function TeamPage() {
  const { role, loading: authLoading } = useAuth();
  const { brands } = useBrandsChannels();
  const [rows, setRows] = useState<Profile[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
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
    const [p, e] = await Promise.all([
      sb.from("profiles").select("*").order("full_name"),
      sb.from("employees").select("*, brands(name)").order("name"),
    ]);
    if (p.data) setRows(p.data as Profile[]);
    if (e.data) setEmployees(e.data as EmployeeRow[]);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  function toggleBrand(id: string) {
    setForm((f) => ({
      ...f,
      brand_ids: f.brand_ids.includes(id)
        ? f.brand_ids.filter((x) => x !== id)
        : [...f.brand_ids, id],
    }));
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!canManageTeam(role)) return;
    const sb = getSupabase();
    if (!sb) return;
    setMsg("");
    const { error } = await sb.from("profiles").insert({
      id: form.auth_user_id.trim(),
      email: form.email.trim(),
      full_name: form.full_name.trim() || null,
      role: form.role,
      brand_ids: form.brand_ids.length ? form.brand_ids : null,
      employee_id: form.employee_id || null,
      active: true,
    });
    if (error)
      setMsg(
        "Gagal simpan: " +
          error.message +
          " — pastikan Auth User ID (UUID) benar dan akun sudah dibuat di Supabase Auth."
      );
    else {
      setMsg("Profil pengguna berhasil disimpan.");
      setForm({
        auth_user_id: "",
        email: "",
        full_name: "",
        role: "karyawan",
        brand_ids: [],
        employee_id: "",
      });
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
  if (authLoading || loading) return <p className="text-blue-200/70">Memuat tim &amp; pengguna…</p>;
  if (role !== "admin" && role !== "management") {
    return <AccessDenied text="Halaman Tim & Pengguna hanya untuk admin dan management." />;
  }

  const brandName = (id: string) => brands.find((b: Brand) => b.id === id)?.name ?? id;
  const employeeName = (id: string | null) =>
    id ? employees.find((x) => x.id === id)?.name ?? "Terkait karyawan" : null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">Tim &amp; Pengguna (Akses Login)</h2>
        <p className="text-xs text-blue-200/75">
          Kelola peran pengguna (Admin, Management, Komisaris, Investor, Karyawan) dan hak akses brand.
        </p>
      </div>

      {role === "management" && <ReadOnlyNotice role={role} />}

      {canManageTeam(role) && (
        <Card>
          <h3 className="text-base font-bold text-white">Tambah Profil Pengguna Baru</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            1) Buat akun terlebih dahulu di <b>Supabase Dashboard → Authentication → Add user</b> dengan email{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-blue-200">username@vektora.id</code> dan centang{" "}
            <b>Auto Confirm User</b>. 2) Salin <b>Auth User ID (UUID)</b> dari Supabase lalu tempel di form di bawah.
          </p>
          <form onSubmit={add} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs text-blue-200/80 sm:col-span-2">
              Auth User ID (UUID dari Supabase Auth)
              <input
                value={form.auth_user_id}
                onChange={(e) => setForm({ ...form, auth_user_id: e.target.value })}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-mono"
                required
              />
            </label>

            <label className="block text-xs text-blue-200/80">
              Email Login (mis. januar@vektora.id)
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="username@vektora.id"
                type="email"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                required
              />
            </label>

            <label className="block text-xs text-blue-200/80">
              Nama Lengkap
              <input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Mis. Januar Amin"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                required
              />
            </label>

            <label className="block text-xs text-blue-200/80">
              Peran (Role)
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>

            {/* Dropdown Karyawan Terdaftar (menggantikan input UUID mentah yang ambigu) */}
            <label className="block text-xs text-blue-200/80">
              Tautkan ke Data Karyawan (Opsional, agar bisa lihat slip gaji pribadi)
              <select
                value={form.employee_id}
                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              >
                <option value="">Tidak ditautkan / Bukan karyawan</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} — {emp.brands?.name ?? "Vektora"} ({emp.role ?? "Tim"})
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-3 sm:col-span-2">
              <p className="text-xs font-semibold text-blue-200">
                Batasi Akses Brand (Biarkan kosong untuk akses Semua Brand)
              </p>
              <div className="mt-2 flex flex-wrap gap-4">
                {brands.map((b: Brand) => (
                  <label key={b.id} className="flex cursor-pointer items-center gap-2 text-xs text-white">
                    <input
                      type="checkbox"
                      checked={form.brand_ids.includes(b.id)}
                      onChange={() => toggleBrand(b.id)}
                      className="rounded"
                    />
                    {b.name}
                  </label>
                ))}
              </div>
            </div>

            <button className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500 sm:col-span-2">
              Simpan Profil Pengguna
            </button>
          </form>
          {msg && (
            <p className="mt-3 rounded-xl border border-blue-400/30 bg-blue-500/15 px-3 py-2 text-xs text-blue-200">
              {msg}
            </p>
          )}
        </Card>
      )}

      <Card>
        <h3 className="text-base font-bold text-white">Daftar Akun Terdaftar ({rows.length})</h3>
        <ul className="mt-4 space-y-2.5">
          {rows.map((p) => {
            const linkedEmp = employeeName(p.employee_id);
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-white">{p.full_name ?? p.email}</p>
                    <span className="rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-blue-200 ring-1 ring-blue-400/30">
                      {ROLE_LABELS[p.role]}
                    </span>
                    {!p.active && (
                      <span className="rounded-full bg-rose-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-rose-200">
                        Nonaktif
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {p.email.endsWith("@vektora.id")
                      ? `Username login: ${usernameOf(p.email)}`
                      : `Email login: ${p.email}`}{" "}
                    · Akses:{" "}
                    {!p.brand_ids || p.brand_ids.length === 0
                      ? "Semua brand"
                      : p.brand_ids.map(brandName).join(", ")}
                    {linkedEmp ? ` · Slip Gaji: ${linkedEmp}` : ""}
                  </p>
                </div>

                {canManageTeam(role) && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={p.role}
                      onChange={(e) => setRole(p, e.target.value as Role)}
                      className="rounded-xl border px-2.5 py-1.5 text-xs font-semibold"
                    >
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setActive(p, !p.active)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                        p.active
                          ? "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/15"
                          : "bg-emerald-600 text-white"
                      }`}
                    >
                      {p.active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
          {rows.length === 0 && (
            <li className="rounded-2xl border border-white/5 bg-white/[0.02] py-8 text-center text-sm text-slate-400">
              Belum ada profil pengguna terdaftar.
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}

