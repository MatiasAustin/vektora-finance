"use client";

import { useEffect, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  ALL_ROLES,
  ROLE_LABELS,
  canManageTeam,
  isAppointedAccountant,
  setLocalAccountantId,
  useAuth,
  usernameOf,
  type Role,
} from "@/lib/auth";
import type { Brand, EmployeeRow, Profile } from "@/lib/types";
import { AccessDenied, Card, EmptySupabase, ReadOnlyNotice } from "@/components/ui";
import { useBrandsChannels } from "@/lib/useData";

export default function TeamPage() {
  const { role, loading: authLoading, refresh: refreshAuth } = useAuth();
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
    is_accountant: false,
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
    const idTrim = form.auth_user_id.trim();
    const payload: Record<string, unknown> = {
      id: idTrim,
      email: form.email.trim(),
      full_name: form.full_name.trim() || null,
      role: form.role,
      brand_ids: form.brand_ids.length ? form.brand_ids : null,
      employee_id: form.employee_id || null,
      active: true,
    };
    if (form.role === "management" && form.is_accountant) {
      payload.is_accountant = true;
    }

    let { error } = await sb.from("profiles").insert(payload);
    if (error && error.message.includes("is_accountant")) {
      delete payload.is_accountant;
      const retry = await sb.from("profiles").insert(payload);
      error = retry.error;
    }

    if (error)
      setMsg(
        "Gagal simpan: " +
          error.message +
          " — pastikan Auth User ID (UUID) benar dan akun sudah dibuat di Supabase Auth."
      );
    else {
      if (form.role === "management") {
        setLocalAccountantId(idTrim, form.is_accountant);
      }
      setMsg("Profil pengguna berhasil disimpan.");
      setForm({
        auth_user_id: "",
        email: "",
        full_name: "",
        role: "karyawan",
        is_accountant: false,
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
    if (newRole !== "management") {
      setLocalAccountantId(p.id, false);
    }
    load();
  }

  async function toggleAccountant(p: Profile) {
    if (!canManageTeam(role)) return;
    const nextVal = !isAppointedAccountant(p);
    setLocalAccountantId(p.id, nextVal);
    setRows((prev) => prev.map((r) => (r.id === p.id ? { ...r, is_accountant: nextVal } : r)));

    const sb = getSupabase();
    if (sb) {
      const { error } = await sb.from("profiles").update({ is_accountant: nextVal }).eq("id", p.id);
      if (error && !error.message.includes("is_accountant")) {
        setMsg("Gagal mengubah status Accountant: " + error.message);
        return;
      }
    }
    setMsg(
      nextVal
        ? `${p.full_name ?? p.email} ditunjuk sebagai Accountant (berhak input/edit transaksi & rilis slip gaji).`
        : `Hak Accountant untuk ${p.full_name ?? p.email} dicabut (kini hanya bisa lihat info & arus kas / Read-Only).`
    );
    await refreshAuth();
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
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-white sm:text-lg">Tim &amp; Tingkatan Akses Pengguna</h2>
        <p className="text-xs text-blue-200/75">
          Hanya <b>Admin (Dirut)</b> dan <b>Accountant (Management yang ditunjuk)</b> yang dapat mengedit transaksi atau merilis slip gaji. Pengguna lain hanya melihat info &amp; arus kas.
        </p>
      </div>

      {/* Ringkasan Tingkatan Hak Akses (Role Hierarchy) */}
      <Card>
        <h3 className="text-sm font-bold text-white">Tingkatan Hak Akses (Access Tiers)</h3>
        <div className="mt-3 grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-blue-400/30 bg-blue-500/15 p-3">
            <div className="flex items-center justify-between">
              <b className="text-white">1. Admin (Dirut)</b>
              <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-blue-500/30 px-2.5 py-0.5 text-[10px] font-bold text-blue-100">
                Full Access
              </span>
            </div>
            <p className="mt-1 text-[11px] text-blue-100/80">
              Akses penuh seluruh fitur: edit transaksi, rilis slip gaji, atur rasio Fee Split, kelola tim, dan menunjuk Accountant.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/15 p-3">
            <div className="flex items-center justify-between">
              <b className="text-white">2. Accountant (Management Ditunjuk)</b>
              <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-100">
                Can Edit &amp; Payroll
              </span>
            </div>
            <p className="mt-1 text-[11px] text-emerald-100/85">
              Management yang diberi wewenang akuntansi: boleh input/edit transaksi, buat invoice, dan rilis slip gaji (tidak bisa ubah rasio Fee Split / kelola akun).
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-center justify-between">
              <b className="text-white">3. Management (Non-Accountant)</b>
              <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold text-slate-300">
                Lihat Info &amp; Arus
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-300">
              Hanya melihat dashboard, arus kas, transaksi, dan laporan tanpa bisa mengedit transaksi atau merilis slip gaji.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-center justify-between">
              <b className="text-white">4. Komisaris &amp; Investor</b>
              <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold text-slate-300">
                Lihat Info &amp; Arus
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-300">
              Mode baca saja untuk memantau arus kas, aset, hutang, laba bersih, serta pembagian dividen/fee (tanpa detail gaji per individu).
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:col-span-2 lg:col-span-2">
            <div className="flex items-center justify-between">
              <b className="text-white">5. Karyawan</b>
              <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-amber-200">
                Slip Pribadi Saja
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-300">
              Hanya dapat membuka dan mencetak slip gaji miliknya sendiri. Tidak dapat melihat arus kas perusahaan, transaksi, maupun gaji karyawan lain.
            </p>
          </div>
        </div>
      </Card>

      {role === "management" && <ReadOnlyNotice role={role} />}

      {canManageTeam(role) && (
        <Card>
          <h3 className="text-sm font-bold text-white">Tambah Profil Pengguna Baru</h3>
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
                className="mt-1 w-full rounded-xl border px-3 py-2 text-xs font-mono"
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
                className="mt-1 w-full rounded-xl border px-3 py-2 text-xs"
                required
              />
            </label>

            <label className="block text-xs text-blue-200/80">
              Nama Lengkap
              <input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Mis. Januar Amin"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-xs"
                required
              />
            </label>

            <label className="block text-xs text-blue-200/80">
              Peran (Role)
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-xs"
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>

            {/* Dropdown Karyawan Terdaftar */}
            <label className="block text-xs text-blue-200/80">
              Tautkan ke Data Karyawan (Opsional, agar bisa lihat slip gaji pribadi)
              <select
                value={form.employee_id}
                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-xs"
              >
                <option value="">Tidak ditautkan / Bukan karyawan</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} — {emp.brands?.name ?? "Vektora"} ({emp.role ?? "Tim"})
                  </option>
                ))}
              </select>
            </label>

            {form.role === "management" && (
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3 sm:col-span-2">
                <label className="flex cursor-pointer items-center gap-2.5 text-xs text-white">
                  <input
                    type="checkbox"
                    checked={form.is_accountant}
                    onChange={(e) => setForm({ ...form, is_accountant: e.target.checked })}
                    className="h-4 w-4 rounded"
                  />
                  <span>
                    <b>Tunjuk sebagai Accountant</b> — izinkan akun Management ini mengedit transaksi &amp; merilis slip gaji (bila tidak dicentang, hanya bisa melihat info &amp; arus kas).
                  </span>
                </label>
              </div>
            )}

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

            <button className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500 sm:col-span-2">
              Simpan Profil Pengguna
            </button>
          </form>
        </Card>
      )}

      {msg && (
        <p className="rounded-2xl border border-blue-400/30 bg-blue-500/15 px-3.5 py-2.5 text-xs text-blue-100">
          {msg}
        </p>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white">Daftar Akun Terdaftar ({rows.length})</h3>
            <p className="text-[11px] text-slate-400">
              Untuk user berstatus <b>Management</b>, klik tombol <b>Tunjuk Accountant</b> bila ingin memberi hak edit transaksi &amp; rilis slip gaji.
            </p>
          </div>
        </div>

        <ul className="mt-3 space-y-2">
          {rows.map((p) => {
            const linkedEmp = employeeName(p.employee_id);
            const appointed = isAppointedAccountant(p);
            const canWrite = p.role === "admin" || (p.role === "management" && appointed);
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-white">{p.full_name ?? p.email}</p>
                    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-blue-500/20 px-3 py-1 text-[11px] font-semibold leading-none text-blue-200 ring-1 ring-blue-400/30">
                      {ROLE_LABELS[p.role]}
                    </span>
                    {p.role === "management" && appointed && (
                      <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-emerald-500/25 px-3 py-1 text-[11px] font-bold leading-none text-emerald-200 ring-1 ring-emerald-400/40">
                        ✓ Accountant (Bisa Edit &amp; Slip Gaji)
                      </span>
                    )}
                    {!canWrite && p.role !== "karyawan" && (
                      <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-white/10 px-3 py-1 text-[10px] font-medium leading-none text-slate-300">
                        Hanya Lihat Info &amp; Arus
                      </span>
                    )}
                    {!p.active && (
                      <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-rose-500/20 px-3 py-1 text-[11px] font-semibold leading-none text-rose-200 ring-1 ring-rose-400/30">
                        Nonaktif
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
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
                    {p.role === "management" && (
                      <button
                        type="button"
                        onClick={() => toggleAccountant(p)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                          appointed
                            ? "border border-emerald-400/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
                            : "border border-blue-400/30 bg-blue-500/15 text-blue-200 hover:bg-blue-500/30"
                        }`}
                        title={
                          appointed
                            ? "Klik untuk mencabut hak Accountant (jadikan hanya lihat info/arus)"
                            : "Klik untuk menunjuk sebagai Accountant agar bisa edit transaksi & rilis slip gaji"
                        }
                      >
                        {appointed ? "✓ Accountant Aktif (Cabut)" : "+ Tunjuk Accountant"}
                      </button>
                    )}

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
            <li className="rounded-2xl border border-white/5 bg-white/[0.02] py-8 text-center text-xs text-slate-400">
              Belum ada profil pengguna terdaftar.
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}


