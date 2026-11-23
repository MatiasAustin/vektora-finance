"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { canEdit, canViewPayslips, useAuth } from "@/lib/auth";
import { managementFeeFromPayslips, opexFromPayslips, payslipTotals } from "@/lib/types";
import type { Brand, EmployeeRow, PayrollPeriod, Payslip, PayslipLine } from "@/lib/types";
import { formatDateID, formatIDR } from "@/lib/format";
import { AccessDenied, BrandSelect, Card, EmptySupabase, ReadOnlyNotice } from "@/components/ui";
import { useBrandsChannels } from "@/lib/useData";

/**
 * /payslips — Slip gaji PT Vektora.
 * - Admin/management: buat periode, generate slip dari tim aktif
 *   (karyawan + management — 24 Nov 2026, bukan cuma karyawan),
 *   edit tunjangan/potongan, tandai terkirim (WhatsApp/Email/Langsung),
 *   tandai dibayar, cetak slip.
 * - Karyawan: hanya slip milik sendiri (difilter employee_id profilnya).
 * - Slip karyawan yang Sudah dibayar masuk OPEX bulan itu; slip
 *   MANAGEMENT yang sudah dibayar keluar dari Management Fee, bukan
 *   OPEX (opexFromPayslips / managementFeeFromPayslips).
 * - TIDAK ada pengiriman otomatis: "Kirim" hanya mencatat sent_at + sent_via
 *   dan memberi tautan WhatsApp (wa.me) untuk dibagikan manual.
 */
export default function PayslipsPage() {
  const { role, profile, loading: authLoading } = useAuth();
  const { brands } = useBrandsChannels();
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [slips, setSlips] = useState<Payslip[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [brandId, setBrandId] = useState("all");
  const [periodId, setPeriodId] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [gen, setGen] = useState({ brand_id: "", period: new Date().toISOString().slice(0, 7), employee_id: "all" });
  const [sendVia, setSendVia] = useState<"whatsapp" | "email" | "langsung">("whatsapp");
  const [line, setLine] = useState({ kind: "allowance" as "allowance" | "deduction", label: "", amount: "" });

  async function load() {
    const sb = getSupabase();
    if (!sb) return setLoading(false);
    const [p, s, e] = await Promise.all([
      sb.from("payroll_periods").select("*, brands(name)").order("period", { ascending: false }),
      sb.from("payslips").select("*, employees(name, role, team, brand_id, is_management), payroll_periods(period, brand_id)").order("created_at", { ascending: false }),
      sb.from("employees").select("*, brands(name)").eq("is_active", true).order("name"),
    ]);
    if (p.data) setPeriods(p.data as PayrollPeriod[]);
    if (s.data) setSlips(s.data as Payslip[]);
    if (e.data) setEmployees(e.data as EmployeeRow[]);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (brands.length && !gen.brand_id) setGen((g) => ({ ...g, brand_id: brands[0].id }));
  }, [brands, gen.brand_id]);

  const isEmployee = role === "karyawan";
  const visibleSlips = useMemo(() => {
    let list = slips;
    if (isEmployee && profile?.employee_id) list = list.filter((s) => s.employee_id === profile.employee_id);
    if (isEmployee && !profile?.employee_id) list = [];
    if (brandId !== "all") list = list.filter((s) => s.payroll_periods?.brand_id === brandId || s.employees?.brand_id === brandId);
    if (periodId !== "all") list = list.filter((s) => s.payroll_period_id === periodId);
    return list;
  }, [slips, isEmployee, profile, brandId, periodId]);

  const totals = useMemo(() => payslipTotals(visibleSlips), [visibleSlips]);
  const selected = useMemo(() => slips.find((s) => s.id === selectedId) ?? null, [slips, selectedId]);
  const editable = canEdit(role);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!editable) return;
    const sb = getSupabase();
    if (!sb) return;
    setMsg("");
    const { data: period, error: perr } = await sb
      .from("payroll_periods")
      .upsert({ brand_id: gen.brand_id, period: gen.period, status: "draft" }, { onConflict: "brand_id,period" })
      .select()
      .single();
    if (perr || !period) {
      setMsg("Gagal buat periode: " + (perr?.message ?? "unknown"));
      return;
    }
    // Dropdown "Tim": "all" = semua tim aktif di brand; satu orang = hanya dia.
    // Tidak ada ketik nama manual — pilih dari daftar tim yang terdaftar.
    const target =
      gen.employee_id === "all"
        ? employees.filter((x) => x.brand_id === gen.brand_id)
        : employees.filter((x) => x.id === gen.employee_id);
    const withSalary = target.filter((x) => x.monthly_salary > 0);
    const skipped = target.filter((x) => x.monthly_salary <= 0);
    if (withSalary.length === 0) {
      setMsg(
        gen.employee_id === "all"
          ? "Tidak ada tim aktif dengan gaji terisi di brand ini. Isi gaji dulu di /employees."
          : `Gaji ${target[0]?.name ?? "orang ini"} masih 0 / belum diisi. Isi gaji dulu di /employees.`
      );
      return;
    }
    const rows = withSalary.map((x) => ({
      payroll_period_id: (period as PayrollPeriod).id,
      employee_id: x.id,
      base_salary: x.monthly_salary,
      allowances: [],
      deductions: [],
      gross: x.monthly_salary,
      total_deductions: 0,
      net_pay: x.monthly_salary,
      status: "belum_dibayar",
    }));
    const { error } = await sb.from("payslips").upsert(rows, { onConflict: "payroll_period_id,employee_id" });
    if (error) setMsg("Gagal generate slip: " + error.message);
    else {
      setMsg(
        `Slip dibuat untuk ${withSalary.length} orang periode ${gen.period}.` +
          (skipped.length ? ` Dilewati (gaji 0 / belum diisi): ${skipped.map((x) => x.name).join(", ")}.` : "")
      );
      setPeriodId((period as PayrollPeriod).id);
      load();
    }
  }

  async function updateSlip(p: Payslip, patch: Partial<Payslip>) {
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from("payslips").update(patch).eq("id", p.id);
    if (error) setMsg("Gagal simpan: " + error.message);
    else load();
  }

  function recompute(p: Payslip, allowances: PayslipLine[], deductions: PayslipLine[]) {
    const gross = p.base_salary + allowances.reduce((s, l) => s + l.amount, 0);
    const totalDed = deductions.reduce((s, l) => s + l.amount, 0);
    return { allowances, deductions, gross, total_deductions: totalDed, net_pay: gross - totalDed };
  }

  async function addLine() {
    if (!selected || !editable) return;
    const amount = Number(line.amount);
    if (!line.label.trim() || !(amount > 0)) return;
    const allowances = [...(selected.allowances ?? [])];
    const deductions = [...(selected.deductions ?? [])];
    if (line.kind === "allowance") allowances.push({ label: line.label.trim(), amount });
    else deductions.push({ label: line.label.trim(), amount });
    await updateSlip(selected, recompute(selected, allowances, deductions));
    setLine({ kind: "allowance", label: "", amount: "" });
  }

  function waLink(p: Payslip): string {
    const text = `Slip Gaji — PT Vektora Teknologi Nusantara\n${p.employees?.name ?? ""} (${p.employees?.role ?? ""})\nPeriode: ${p.payroll_periods?.period ?? ""}\nGaji pokok: ${formatIDR(p.base_salary)}\nGaji bersih: ${formatIDR(p.net_pay)}\nStatus: ${p.status === "sudah_dibayar" ? "Sudah dibayar" : "Belum dibayar"}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  if (!isSupabaseConfigured) return <EmptySupabase />;
  if (authLoading || loading) return <p className="text-slate-500">Memuat…</p>;
  if (!canViewPayslips(role)) {
    return <AccessDenied text="Slip gaji hanya untuk admin, management, dan karyawan yang bersangkutan. Komisaris dan investor tidak bisa melihat slip per karyawan (hanya total OPEX di dashboard)." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{isEmployee ? "Slip Gaji Saya" : "Slip Gaji"}</h2>
        <div className="flex gap-2">
          <BrandSelect brands={brands} value={brandId} onChange={setBrandId} />
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="rounded-xl border bg-white px-3 py-2 text-sm">
            <option value="all">Semua periode</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>{p.period} · {p.brands?.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card><p className="text-xs font-semibold uppercase text-slate-500">Total gaji bersih</p><p className="mt-1 text-2xl font-bold">{formatIDR(totals.totalNet)}</p><p className="mt-1 text-xs text-slate-500">Semua slip yang tampil (karyawan + management).</p></Card>
        <Card><p className="text-xs font-semibold uppercase text-slate-500">Sudah dibayar (masuk OPEX)</p><p className="mt-1 text-2xl font-bold">{formatIDR(opexFromPayslips(visibleSlips))}</p><p className="mt-1 text-xs text-slate-500">Hanya slip karyawan. Dibayar dari Management Fee: {formatIDR(managementFeeFromPayslips(visibleSlips))}.</p></Card>
        <Card><p className="text-xs font-semibold uppercase text-slate-500">Belum dibayar (tunggakan)</p><p className="mt-1 text-2xl font-bold">{formatIDR(totals.outstanding)}</p></Card>
      </div>
      <p className="text-xs text-slate-500">Total sudah dibayar: {formatIDR(totals.paid)} = OPEX {formatIDR(opexFromPayslips(visibleSlips))} + Management Fee {formatIDR(managementFeeFromPayslips(visibleSlips))}. Slip management tidak masuk OPEX.</p>

      {editable && (
        <Card>
          <h3 className="font-bold">Buat periode &amp; generate slip</h3>
          <form onSubmit={generate} className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm">Brand
              <select value={gen.brand_id} onChange={(e) => setGen({ ...gen, brand_id: e.target.value, employee_id: "all" })} className="ml-2 rounded-xl border px-2 py-1">
                {brands.map((b: Brand) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="text-sm">Tim
              <select value={gen.employee_id} onChange={(e) => setGen({ ...gen, employee_id: e.target.value })} className="ml-2 rounded-xl border px-2 py-1">
                <option value="all">Semua tim di brand ini</option>
                {employees.filter((x) => x.brand_id === gen.brand_id).map((x) => (
                  <option key={x.id} value={x.id}>{x.name}{x.role ? ` — ${x.role}` : ""}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">Periode
              <input type="month" value={gen.period} onChange={(e) => setGen({ ...gen, period: e.target.value })} className="ml-2 rounded-xl border px-2 py-1" required />
            </label>
            <button className="rounded-xl bg-vektora-500 px-4 py-2 text-sm font-semibold text-white">Generate slip</button>
          </form>
          <p className="mt-2 text-xs text-slate-500">Generate dari tim aktif brand itu (karyawan + management), gaji pokok = gaji bulanan di /employees. Pilih satu orang di dropdown "Tim" untuk generate slip dia saja — tidak perlu ketik nama. Tunjangan/potongan default 0 — edit per slip. Tim dengan gaji 0 dilewati.</p>
          {msg && <p className="mt-2 text-sm">{msg}</p>}
        </Card>
      )}
      {isEmployee && <ReadOnlyNotice role={role} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="font-bold">Daftar slip ({visibleSlips.length})</h3>
          <ul className="mt-3 divide-y">
            {visibleSlips.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <button onClick={() => setSelectedId(s.id)} className="text-left">
                  <span className="font-medium">{s.employees?.name ?? "—"}</span>
                  <span className="block text-xs text-slate-500">{s.payroll_periods?.period} · {formatIDR(s.net_pay)} · {s.status === "sudah_dibayar" ? "Sudah dibayar" : "Belum dibayar"}{s.sent_at ? ` · Terkirim ${s.sent_via ?? ""}` : ""}</span>
                </button>
                <button onClick={() => setSelectedId(s.id)} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">Lihat</button>
              </li>
            ))}
            {visibleSlips.length === 0 && <li className="py-4 text-sm text-slate-500">Belum ada slip. {isEmployee ? "Slipmu akan muncul di sini setelah admin generate." : "Generate periode di atas."}</li>}
          </ul>
        </Card>

        {selected && (
          <Card className="payslip-print">
            <div className="border-b pb-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-vektora-600">PT Vektora Teknologi Nusantara</p>
              <h3 className="text-lg font-black">Slip Gaji</h3>
              <p className="text-sm text-slate-500">Periode {selected.payroll_periods?.period} · {selected.employees?.name} — {selected.employees?.role ?? "—"}</p>
            </div>
            <div className="mt-3 space-y-1 text-sm">
              <p className="flex justify-between"><span>Gaji pokok</span><b>{formatIDR(selected.base_salary)}</b></p>
              {(selected.allowances ?? []).map((l, i) => <p key={i} className="flex justify-between text-slate-600"><span>+ {l.label}</span><span>{formatIDR(l.amount)}</span></p>)}
              <p className="flex justify-between border-t pt-1"><span>Total penghasilan (gross)</span><b>{formatIDR(selected.gross)}</b></p>
              {(selected.deductions ?? []).map((l, i) => <p key={i} className="flex justify-between text-slate-600"><span>− {l.label}</span><span>{formatIDR(l.amount)}</span></p>)}
              <p className="flex justify-between"><span>Total potongan</span><b>{formatIDR(selected.total_deductions)}</b></p>
              <p className="flex justify-between border-t pt-2 text-base"><span>Gaji bersih</span><b>{formatIDR(selected.net_pay)}</b></p>
              <p className="text-xs text-slate-500">Status: {selected.status === "sudah_dibayar" ? `Sudah dibayar${selected.paid_at ? " · " + formatDateID(selected.paid_at) : ""}` : "Belum dibayar"}{selected.sent_at ? ` · Terkirim ${selected.sent_via ?? ""} · ${formatDateID(selected.sent_at)}` : ""}</p>
            </div>
            <div className="mt-6 flex justify-between text-xs text-slate-500">
              <span>Disetujui,<br /><br /><br />_________________<br />PT Vektora</span>
              <span>Diterima oleh,<br /><br /><br />_________________<br />{selected.employees?.name}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 print:hidden">
              <button onClick={() => window.print()} className="rounded-xl bg-vektora-500 px-4 py-2 text-sm font-semibold text-white">Cetak slip</button>
              {editable && (
                <>
                  <a href={waLink(selected)} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Bagikan via WhatsApp</a>
                  <button
                    onClick={() => navigator.clipboard?.writeText(waLink(selected))}
                    className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold"
                  >
                    Salin tautan slip
                  </button>
                  <select value={sendVia} onChange={(e) => setSendVia(e.target.value as "whatsapp" | "email" | "langsung")} className="rounded-xl border px-2 py-1 text-sm">
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">Email</option>
                    <option value="langsung">Langsung</option>
                  </select>
                  <button
                    onClick={() => updateSlip(selected, { sent_at: new Date().toISOString(), sent_via: sendVia })}
                    className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold"
                  >
                    Tandai terkirim
                  </button>
                  <button
                    onClick={() =>
                      updateSlip(
                        selected,
                        selected.status === "sudah_dibayar"
                          ? { status: "belum_dibayar", paid_at: null }
                          : { status: "sudah_dibayar", paid_at: new Date().toISOString() }
                      )
                    }
                    className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold"
                  >
                    {selected.status === "sudah_dibayar" ? "Batalkan dibayar" : "Tandai sudah dibayar"}
                  </button>
                </>
              )}
            </div>
            {editable && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addLine();
                }}
                className="mt-4 flex flex-wrap gap-2 border-t pt-3 print:hidden"
              >
                <select value={line.kind} onChange={(e) => setLine({ ...line, kind: e.target.value as "allowance" | "deduction" })} className="rounded-xl border px-2 py-1 text-sm">
                  <option value="allowance">Tunjangan (+)</option>
                  <option value="deduction">Potongan (−)</option>
                </select>
                <input value={line.label} onChange={(e) => setLine({ ...line, label: e.target.value })} placeholder="Keterangan" className="rounded-xl border px-2 py-1 text-sm" />
                <input type="number" min="1" value={line.amount} onChange={(e) => setLine({ ...line, amount: e.target.value })} placeholder="Rp" className="w-28 rounded-xl border px-2 py-1 text-sm" />
                <button className="rounded-xl bg-vektora-500 px-3 py-1 text-sm font-semibold text-white">Tambah baris</button>
              </form>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
