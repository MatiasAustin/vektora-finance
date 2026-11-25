"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { fixedCostOpex } from "@/lib/types";
import type { Brand, EmployeeRow, Profile } from "@/lib/types";
import { formatIDR } from "@/lib/format";
import { AccessDenied, BrandSelect, Card, EmptySupabase, ReadOnlyNotice } from "@/components/ui";
import { canEdit, canManageTeam, ROLE_LABELS, useAuth } from "@/lib/auth";
import { useBrandsChannels } from "@/lib/useData";

export default function EmployeesPage() {
  const { role, profile, loading: authLoading } = useAuth();
  const editable = canEdit(role, profile);
  const { brands } = useBrandsChannels();
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [brandId, setBrandId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [formMsg, setFormMsg] = useState("");
  const [editingSalaryId, setEditingSalaryId] = useState<string | null>(null);
  const [salaryDraft, setSalaryDraft] = useState("");
  const [form, setForm] = useState({
    brand_id: "",
    profile_id: "",
    name: "",
    role: "",
    team: "",
    monthly_salary: "",
    salary_source: "opex" as "opex" | "fee",
  });

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
    setForm((f) => ({
      ...f,
      profile_id: p.id,
      name: p.full_name ?? p.email,
      role: ROLE_LABELS[p.role],
    }));
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
  const opex = fixedCostOpex(filtered);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!editable) return;
    const sb = getSupabase();
    if (!sb) return;
    setFormMsg("");
    const picked =
      form.profile_id && form.profile_id !== "new"
        ? profiles.find((x) => x.id === form.profile_id)
        : null;
    if (picked?.employee_id && rows.some((r) => r.id === picked.employee_id)) {
      setFormMsg(
        `Orang ini sudah terdaftar sebagai karyawan (${
          picked.full_name ?? picked.email
        }) — tidak dibuat ganda.`
      );
      return;
    }
    const name = picked ? picked.full_name ?? picked.email : form.name.trim();
    if (!name) {
      setFormMsg("Nama belum diisi.");
      return;
    }
    const { data: inserted, error } = await sb
      .from("employees")
      .insert({
        brand_id: form.brand_id,
        name,
        role: form.role || null,
        team: form.team || null,
        monthly_salary: form.salary_source === "fee" ? 0 : Number(form.monthly_salary),
        is_fixed_cost: form.salary_source === "opex",
        is_management: form.salary_source === "fee",
        is_active: true,
      })
      .select()
      .single();
    if (error || !inserted) {
      setFormMsg("Gagal simpan: " + (error?.message ?? "unknown"));
      return;
    }
    if (picked) {
      const { error: linkErr } = await sb
        .from("profiles")
        .update({ employee_id: (inserted as EmployeeRow).id })
        .eq("id", picked.id);
      if (linkErr)
        setFormMsg(
          `Karyawan tersimpan, tapi profil ${
            picked.full_name ?? picked.email
          } belum tertaut (perlu admin): ${linkErr.message}`
        );
      else
        setFormMsg(
          `Karyawan tersimpan dan tertaut ke profil ${picked.full_name ?? picked.email}.`
        );
    } else {
      setFormMsg("Karyawan tersimpan.");
    }
    setForm((f) => ({ ...f, profile_id: "", name: "", role: "", team: "", monthly_salary: "" }));
    load();
  }

  async function saveSalary(emp: EmployeeRow) {
    if (!editable) return;
    const sb = getSupabase();
    if (!sb) return;
    const nextSal = Math.max(0, Number(salaryDraft) || 0);
    const { error } = await sb.from("employees").update({ monthly_salary: nextSal }).eq("id", emp.id);
    if (error) setFormMsg("Gagal ubah gaji: " + error.message);
    else {
      setFormMsg(`Gaji bulanan ${emp.name} diperbarui menjadi ${formatIDR(nextSal)}.`);
      setEditingSalaryId(null);
      load();
    }
  }

  async function toggleActive(e: EmployeeRow) {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("employees").update({ is_active: !e.is_active }).eq("id", e.id);
    load();
  }

  async function removeEmployee(e: EmployeeRow) {
    if (!canManageTeam(role)) return;
    const sb = getSupabase();
    if (!sb) return;
    const { count } = await sb
      .from("payslips")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", e.id);
    const n = count ?? 0;
    const ok = window.confirm(
      `Hapus ${e.name} dari daftar karyawan?` +
        (n > 0
          ? `\n\nOrang ini sudah punya ${n} slip gaji. Slip lama tetap tersimpan dan tetap bisa dibuka.`
          : "") +
        `\n\nTindakan ini tidak bisa dibatalkan.`
    );
    if (!ok) return;
    const { error: linkErr } = await sb
      .from("profiles")
      .update({ employee_id: null })
      .eq("employee_id", e.id);
    if (linkErr) setFormMsg(`Tautan profil gagal dibersihkan: ${linkErr.message}`);
    const { error } = await sb.from("employees").delete().eq("id", e.id);
    if (error) setFormMsg("Gagal hapus: " + error.message);
    else setFormMsg(`${e.name} dihapus dari daftar karyawan.`);
    load();
  }

  if (!isSupabaseConfigured) return <EmptySupabase />;
  if (loading || authLoading) return <p className="text-blue-200/70">Memuat data tim &amp; gaji…</p>;
  if (role !== "admin" && role !== "management")
    return (
      <AccessDenied text="Halaman Karyawan & Gaji hanya untuk admin dan management. Investor dan komisaris melihat total OPEX di dashboard. Karyawan melihat slip gajinya sendiri di halaman Slip Gaji." />
    );

  const opexEmployees = filtered.filter((e) => !e.is_management);
  const mgmtEmployees = filtered.filter((e) => e.is_management);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white sm:text-lg">Karyawan &amp; Struktur Gaji</h2>
          <p className="text-[11px] text-blue-200/75">
            Pemisahan jelas antara Staf Operasional (Gaji Tetap OPEX) vs Jajaran Management (Dibayar dari % Management Fee).
          </p>
        </div>
        <BrandSelect brands={brands} value={brandId} onChange={setBrandId} />
      </div>

      {/* Hero OPEX */}
      <div className="finora-glossy-card rounded-3xl p-5 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-100/80">
          Total Gaji Tetap / Bulan (OPEX Operasional)
        </p>
        <p className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{formatIDR(opex)}</p>
        <p className="mt-1.5 text-[11px] text-blue-100/85">
          Hanya menghitung staf operasional aktif ({opexEmployees.filter((x) => x.is_active).length} orang). Jajaran
          manajemen dibayar dari persentase <b>Management Fee</b> di halaman Pembagian Fee, bukan dari beban tetap OPEX.
        </p>
      </div>

      {editable ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-white">Daftarkan Anggota Tim / Karyawan</h3>
            <div className="inline-flex rounded-2xl border border-white/10 bg-black/30 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setForm({ ...form, salary_source: "opex" })}
                className={`rounded-xl px-3 py-1.5 transition ${
                  form.salary_source === "opex"
                    ? "bg-blue-600 text-white shadow"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                Staf Operasional (OPEX)
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, salary_source: "fee" })}
                className={`rounded-xl px-3 py-1.5 transition ${
                  form.salary_source === "fee"
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                Management (Dari Fee Pool)
              </button>
            </div>
          </div>

          <form onSubmit={add} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-xs text-blue-200/80">
              Brand / Unit
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
              Pilih dari Akun Profil Terdaftar
              <select
                value={form.profile_id}
                onChange={(e) => pickProfile(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                required
              >
                <option value="">Pilih anggota tim…</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name ?? p.email} — {ROLE_LABELS[p.role]}
                  </option>
                ))}
                <option value="new">+ Orang baru (ketik nama manual)</option>
              </select>
            </label>

            <label className="block text-xs text-blue-200/80">
              Nama Lengkap
              {form.profile_id && form.profile_id !== "new" ? (
                <input
                  value={form.name}
                  readOnly
                  title="Nama otomatis dari profil terdaftar"
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm opacity-75"
                />
              ) : (
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ketik nama lengkap…"
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                  required={form.profile_id === "new"}
                  disabled={!form.profile_id}
                />
              )}
            </label>

            <label className="block text-xs text-blue-200/80">
              Jabatan / Peran
              <input
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                placeholder="Mis. Operator 3D Print / Manager Marketing"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </label>

            <label className="block text-xs text-blue-200/80">
              Divisi / Tim
              <input
                value={form.team}
                onChange={(e) => setForm({ ...form, team: e.target.value })}
                placeholder="Mis. Produksi WhereIsIt"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </label>

            {form.salary_source === "fee" ? (
              <div className="rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200">
                <b>Sumber: Management Fee.</b> Tidak ada gaji tetap bulanan — penghasilan dihitung dari % laba di{" "}
                <Link href="/fee-split" className="underline">
                  Pembagian Fee
                </Link>
                .
              </div>
            ) : (
              <label className="block text-xs text-blue-200/80">
                Gaji Pokok Bulanan (Rp)
                <input
                  type="number"
                  min="0"
                  value={form.monthly_salary}
                  onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })}
                  placeholder="0"
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-bold"
                  required
                />
              </label>
            )}

            <div className="sm:col-span-2 lg:col-span-3">
              <button className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500">
                Simpan Anggota Tim
              </button>
            </div>
          </form>
          {formMsg && (
            <p className="mt-3 rounded-xl border border-blue-400/25 bg-blue-500/10 px-3 py-2 text-xs text-blue-200">
              {formMsg}
            </p>
          )}
        </Card>
      ) : (
        <ReadOnlyNotice role={role} />
      )}

      {/* Bagian 1: Karyawan Operasional (OPEX) */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white">
              Karyawan Operasional (OPEX) · {opexEmployees.length} orang
            </h3>
            <p className="text-[11px] text-slate-400">
              Memiliki gaji pokok bulanan tetap dan dibuatkan slip gaji bulanan di halaman Slip Gaji.
            </p>
          </div>
          <Link
            href="/payslips"
            className="rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-200 hover:bg-white/20"
          >
            Buka Slip Gaji →
          </Link>
        </div>

        <ul className="mt-3 space-y-2">
          {opexEmployees.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-words font-semibold text-white">{e.name}</p>
                  {!e.is_active && (
                    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-slate-700 px-3 py-1 text-[10px] font-semibold leading-none text-slate-300">
                      Nonaktif
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {e.brands?.name} · {e.role ?? "—"} · Tim: {e.team ?? "—"} · Fixed Cost (OPEX)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {editingSalaryId === e.id ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      value={salaryDraft}
                      onChange={(ev) => setSalaryDraft(ev.target.value)}
                      className="w-32 rounded-xl border px-2.5 py-1 text-xs font-bold"
                      placeholder="Gaji Rp"
                    />
                    <button
                      onClick={() => saveSalary(e)}
                      className="rounded-xl bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white"
                    >
                      Simpan
                    </button>
                    <button
                      onClick={() => setEditingSalaryId(null)}
                      className="rounded-xl bg-white/10 px-2.5 py-1 text-xs text-slate-300"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <>
                    <b className="shrink-0 whitespace-nowrap text-xs sm:text-sm text-white">
                      {formatIDR(e.monthly_salary)}/bln
                    </b>
                    {editable && (
                      <button
                        onClick={() => {
                          setEditingSalaryId(e.id);
                          setSalaryDraft(String(e.monthly_salary));
                        }}
                        className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-blue-200 hover:bg-white/15"
                      >
                        Ubah Gaji
                      </button>
                    )}
                  </>
                )}

                {editable && (
                  <button
                    onClick={() => toggleActive(e)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-white/15"
                  >
                    {e.is_active ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                )}
                {canManageTeam(role) && (
                  <button
                    onClick={() => removeEmployee(e)}
                    className="rounded-xl border border-rose-400/25 bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-200 hover:bg-rose-500/30"
                  >
                    Hapus
                  </button>
                )}
              </div>
            </li>
          ))}
          {opexEmployees.length === 0 && (
            <li className="rounded-2xl border border-white/5 bg-white/[0.02] py-6 text-center text-xs text-slate-400">
              Belum ada karyawan operasional terdaftar.
            </li>
          )}
        </ul>
      </Card>

      {/* Bagian 2: Management (dibayar dari Management Fee) */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white">
              Jajaran Management (Dibayar dari Management Fee) · {mgmtEmployees.length} orang
            </h3>
            <p className="text-[11px] text-slate-400">
              Penghasilan berasal dari persentase Management Fee bulanan, bukan beban tetap OPEX. Slip dicetak di
              halaman Pembagian Fee.
            </p>
          </div>
          <Link
            href="/fee-split"
            className="rounded-xl border border-indigo-400/30 bg-indigo-500/20 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/30"
          >
            Buka Slip Management Fee →
          </Link>
        </div>

        <ul className="mt-4 space-y-2.5">
          {mgmtEmployees.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-words font-semibold text-white">{e.name}</p>
                  {!e.is_active && (
                    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-slate-700 px-3 py-1 text-[10px] font-semibold leading-none text-slate-300">
                      Nonaktif
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {e.brands?.name} · {e.role ?? "—"} · Tim: {e.team ?? "—"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-indigo-500/20 px-3.5 py-1.5 text-xs font-semibold leading-none text-indigo-200 ring-1 ring-indigo-400/30">
                  Dari Management Fee
                </span>
                {editable && (
                  <button
                    onClick={() => toggleActive(e)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-white/15"
                  >
                    {e.is_active ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                )}
                {canManageTeam(role) && (
                  <button
                    onClick={() => removeEmployee(e)}
                    className="rounded-xl border border-rose-400/25 bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-200 hover:bg-rose-500/30"
                  >
                    Hapus
                  </button>
                )}
              </div>
            </li>
          ))}
          {mgmtEmployees.length === 0 && (
            <li className="rounded-2xl border border-white/5 bg-white/[0.02] py-8 text-center text-sm text-slate-400">
              Belum ada anggota management yang terdaftar di daftar ini.
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}

