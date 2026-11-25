"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { canEdit, canViewPayslips, useAuth } from "@/lib/auth";
import { managementFeeFromPayslips, opexFromPayslips, payslipTotals } from "@/lib/types";
import type { Brand, EmployeeRow, PayrollPeriod, Payslip, PayslipLine } from "@/lib/types";
import { formatDateID, formatIDR } from "@/lib/format";
import { AccessDenied, BrandSelect, Card, EmptySupabase, ReadOnlyNotice, StatCard } from "@/components/ui";
import { useBrandsChannels } from "@/lib/useData";
import { getBrandLogo } from "@/lib/brandLogo";

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
  const [copied, setCopied] = useState(false);
  const [gen, setGen] = useState({
    brand_id: "",
    period: new Date().toISOString().slice(0, 7),
    employee_id: "all",
  });
  const [sendVia, setSendVia] = useState<"whatsapp" | "email" | "langsung">("whatsapp");
  const [line, setLine] = useState({
    kind: "allowance" as "allowance" | "deduction",
    label: "",
    amount: "",
  });

  async function load() {
    const sb = getSupabase();
    if (!sb) return setLoading(false);
    const [p, s, e] = await Promise.all([
      sb.from("payroll_periods").select("*, brands(name)").order("period", { ascending: false }),
      sb
        .from("payslips")
        .select("*, employees(name, role, team, brand_id, is_management), payroll_periods(period, brand_id)")
        .order("created_at", { ascending: false }),
      sb.from("employees").select("*, brands(name)").eq("is_active", true).order("name"),
    ]);
    if (p.data) setPeriods(p.data as PayrollPeriod[]);
    if (s.data) {
      const list = s.data as Payslip[];
      setSlips(list);
      if (!selectedId && list.length > 0) setSelectedId(list[0].id);
    }
    if (e.data) setEmployees(e.data as EmployeeRow[]);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (brands.length && !gen.brand_id) setGen((g) => ({ ...g, brand_id: brands[0].id }));
  }, [brands, gen.brand_id]);

  const isEmployee = role === "karyawan";
  const visibleSlips = useMemo(() => {
    let list = slips;
    if (isEmployee && profile?.employee_id) list = list.filter((s) => s.employee_id === profile.employee_id);
    if (isEmployee && !profile?.employee_id) list = [];
    if (brandId !== "all")
      list = list.filter(
        (s) => s.payroll_periods?.brand_id === brandId || s.employees?.brand_id === brandId
      );
    if (periodId !== "all") list = list.filter((s) => s.payroll_period_id === periodId);
    return list;
  }, [slips, isEmployee, profile, brandId, periodId]);

  const totals = useMemo(() => payslipTotals(visibleSlips), [visibleSlips]);
  const selected = useMemo(
    () => visibleSlips.find((s) => s.id === selectedId) ?? visibleSlips[0] ?? null,
    [visibleSlips, selectedId]
  );
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
    const target =
      gen.employee_id === "all"
        ? employees.filter((x) => x.brand_id === gen.brand_id)
        : employees.filter((x) => x.id === gen.employee_id);
    const withSalary = target.filter((x) => x.monthly_salary > 0);
    const skipped = target.filter((x) => x.monthly_salary <= 0);
    if (withSalary.length === 0) {
      setMsg(
        gen.employee_id === "all"
          ? "Tidak ada karyawan aktif dengan gaji tetap > Rp0 di brand ini. Isi gaji pokok di halaman Karyawan & Gaji terlebih dahulu (untuk jajaran Management, cetak slip di halaman Pembagian Fee)."
          : `${
              target[0]?.name ?? "Anggota ini"
            } tidak memiliki gaji pokok tetap (Rp0). Bila ia dibayar dari Management Fee, buka halaman Pembagian Fee untuk mencetak slipnya.`
      );
      return;
    }
    const rows = withSalary.map((x) => ({
      payroll_period_id: (period as PayrollPeriod).id,
      employee_id: x.id,
      employee_name: x.name,
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
        `Slip gaji berhasil dibuat untuk ${withSalary.length} orang (periode ${gen.period}).` +
          (skipped.length
            ? ` Dilewati karena gaji pokok Rp0 / Management Fee: ${skipped.map((x) => x.name).join(", ")}.`
            : "")
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

  async function removeLine(kind: "allowance" | "deduction", index: number) {
    if (!selected || !editable) return;
    const allowances = [...(selected.allowances ?? [])];
    const deductions = [...(selected.deductions ?? [])];
    if (kind === "allowance") allowances.splice(index, 1);
    else deductions.splice(index, 1);
    await updateSlip(selected, recompute(selected, allowances, deductions));
  }

  function slipName(p: Payslip): string {
    return p.employees?.name ?? p.employee_name ?? "—";
  }

  function waLink(p: Payslip): string {
    const text = `Slip Gaji — PT Vektora Teknologi Nusantara\n${slipName(p)} (${
      p.employees?.role ?? ""
    })\nPeriode: ${p.payroll_periods?.period ?? ""}\nGaji pokok: ${formatIDR(
      p.base_salary
    )}\nGaji bersih: ${formatIDR(p.net_pay)}\nStatus: ${
      p.status === "sudah_dibayar" ? "Sudah dibayar" : "Belum dibayar"
    }`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  if (!isSupabaseConfigured) return <EmptySupabase />;
  if (authLoading || loading) return <p className="text-blue-200/70">Memuat slip gaji…</p>;
  if (!canViewPayslips(role)) {
    return (
      <AccessDenied text="Slip gaji hanya untuk admin, management, dan karyawan yang bersangkutan. Komisaris dan investor melihat total OPEX di dashboard." />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white sm:text-lg">{isEmployee ? "Slip Gaji Saya" : "Slip Gaji (Payroll OPEX)"}</h2>
          <p className="text-[11px] text-blue-200/75">
            {isEmployee
              ? "Daftar slip gaji bulanan milikmu yang dapat dicetak atau diunduh."
              : "Generate slip gaji bulanan staf operasional, tambah tunjangan/potongan, dan bagikan via WhatsApp."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandSelect brands={brands} value={brandId} onChange={setBrandId} />
          <select
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
            className="rounded-2xl border px-3 py-1.5 text-xs font-semibold"
          >
            <option value="all">Semua periode</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.period} · {p.brands?.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Total Gaji Bersih"
          value={formatIDR(totals.totalNet)}
          sub={`${visibleSlips.length} slip gaji ditampilkan`}
        />
        <StatCard
          label="Sudah Dibayar (OPEX)"
          value={formatIDR(opexFromPayslips(visibleSlips))}
          sub={`Dari Management Fee: ${formatIDR(managementFeeFromPayslips(visibleSlips))}`}
          tone="positive"
        />
        <StatCard
          label="Belum Dibayar (Tunggakan)"
          value={formatIDR(totals.outstanding)}
          sub="Menunggu pencairan gaji"
          tone="warning"
        />
      </div>

      {editable && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-white">Generate Slip Gaji Periode Baru</h3>
              <p className="text-xs text-slate-400">
                Membuat slip dari gaji pokok di halaman Karyawan. Untuk jajaran Direksi/Komisaris yang berbasis % laba,
                cetak slipnya di{" "}
                <Link href="/fee-split" className="font-semibold text-blue-300 underline">
                  Pembagian Fee →
                </Link>
              </p>
            </div>
          </div>

          <form onSubmit={generate} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <label className="block text-xs text-blue-200/80">
              Brand
              <select
                value={gen.brand_id}
                onChange={(e) => setGen({ ...gen, brand_id: e.target.value, employee_id: "all" })}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              >
                {brands.map((b: Brand) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-blue-200/80">
              Karyawan
              <select
                value={gen.employee_id}
                onChange={(e) => setGen({ ...gen, employee_id: e.target.value })}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              >
                <option value="all">Semua karyawan bergaji tetap</option>
                {employees
                  .filter((x) => x.brand_id === gen.brand_id)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                      {x.role ? ` — ${x.role}` : ""} ({formatIDR(x.monthly_salary)})
                    </option>
                  ))}
              </select>
            </label>

            <label className="block text-xs text-blue-200/80">
              Periode (Bulan)
              <input
                type="month"
                value={gen.period}
                onChange={(e) => setGen({ ...gen, period: e.target.value })}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                required
              />
            </label>

            <div className="flex items-end">
              <button className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500">
                Generate Slip
              </button>
            </div>
          </form>

          {msg && (
            <p className="mt-3 rounded-xl border border-blue-400/25 bg-blue-500/10 px-3 py-2 text-xs text-blue-200">
              {msg}
            </p>
          )}
        </Card>
      )}
      {isEmployee && <ReadOnlyNotice role={role} />}

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Daftar Slip (Satu kartu interaktif per baris, tanpa dua tombol kembar) */}
        <Card className="lg:col-span-5">
          <h3 className="text-sm font-bold text-white">Daftar Slip ({visibleSlips.length})</h3>
          <p className="text-[11px] text-slate-400">Klik baris untuk membuka rincian &amp; cetak slip.</p>
          <ul className="mt-3 space-y-2">
            {visibleSlips.map((s) => {
              const isSelected = selected?.id === s.id;
              const isPaid = s.status === "sudah_dibayar";
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition ${
                      isSelected
                        ? "border-blue-400/60 bg-blue-600/25 shadow-lg shadow-blue-950/50"
                        : "border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.07]"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-white">{slipName(s)}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        Periode {s.payroll_periods?.period} · {s.employees?.role ?? "Staf"}
                        {s.sent_at ? ` · Terkirim (${s.sent_via})` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-black text-white sm:text-sm">{formatIDR(s.net_pay)}</p>
                      <span
                        className={`mt-1 inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1 text-[10px] font-semibold leading-none ${
                          isPaid
                            ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30"
                            : "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30"
                        }`}
                      >
                        {isPaid ? "Sudah dibayar" : "Belum dibayar"}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
            {visibleSlips.length === 0 && (
              <li className="rounded-2xl border border-white/5 bg-white/[0.02] py-6 text-center text-xs text-slate-400">
                Belum ada slip gaji.{" "}
                {isEmployee ? "Slipmu akan muncul setelah admin men-generate periode ini." : "Generate periode di atas."}
              </li>
            )}
          </ul>
        </Card>

        {/* Pratinjau & Editor Slip Gaji */}
        <div className="lg:col-span-7">
          {selected ? (
            <Card className="payslip-print">
              {(() => {
                const slipBrandId = selected.payroll_periods?.brand_id || selected.employees?.brand_id;
                const slipBrand = brands.find((b) => b.id === slipBrandId) ?? null;
                const logoSrc = getBrandLogo(slipBrand);
                return (
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3.5">
                    <div className="flex items-center gap-3">
                      {logoSrc ? (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white p-1.5 shadow-sm">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={logoSrc} alt={slipBrand?.name ?? "Logo Brand"} className="max-h-full max-w-full object-contain" />
                        </div>
                      ) : (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-400/30 bg-blue-500/20 text-sm font-black text-white">
                          {(slipBrand?.name ?? "VF").slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-300">
                          {slipBrand?.name ? `${slipBrand.name} · ` : ""}PT Vektora Teknologi Nusantara
                        </p>
                        <h3 className="mt-0.5 text-base font-black text-white sm:text-lg">SLIP GAJI KARYAWAN</h3>
                        <p className="text-[11px] text-slate-300">
                          Periode: <b>{selected.payroll_periods?.period}</b> · Penerima: <b>{slipName(selected)}</b> (
                          {selected.employees?.role ?? "—"})
                        </p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold leading-none ${
                        selected.status === "sudah_dibayar"
                          ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30"
                          : "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30"
                      }`}
                    >
                      {selected.status === "sudah_dibayar" ? "LUNAS / SUDAH DIBAYAR" : "BELUM DIBAYAR"}
                    </span>
                  </div>
                );
              })()}

              <div className="mt-3.5 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-300">Gaji Pokok</span>
                  <b className="text-white">{formatIDR(selected.base_salary)}</b>
                </div>

                {(selected.allowances ?? []).map((l, i) => (
                  <div key={i} className="flex items-center justify-between text-emerald-300">
                    <span>+ Tunjangan: {l.label}</span>
                    <div className="flex items-center gap-2">
                      <span>{formatIDR(l.amount)}</span>
                      {editable && (
                        <button
                          type="button"
                          onClick={() => removeLine("allowance", i)}
                          className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-rose-300 hover:bg-rose-500/20 print:hidden"
                          title="Hapus baris tunjangan ini"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <div className="flex justify-between border-t border-white/10 pt-2">
                  <span className="text-slate-300">Total Penghasilan Kotor (Gross)</span>
                  <b className="text-white">{formatIDR(selected.gross)}</b>
                </div>

                {(selected.deductions ?? []).map((l, i) => (
                  <div key={i} className="flex items-center justify-between text-rose-300">
                    <span>− Potongan: {l.label}</span>
                    <div className="flex items-center gap-2">
                      <span>{formatIDR(l.amount)}</span>
                      {editable && (
                        <button
                          type="button"
                          onClick={() => removeLine("deduction", i)}
                          className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-rose-300 hover:bg-rose-500/20 print:hidden"
                          title="Hapus baris potongan ini"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <div className="flex justify-between text-slate-300">
                  <span>Total Potongan</span>
                  <b>{formatIDR(selected.total_deductions)}</b>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-blue-400/30 bg-blue-500/15 p-3 text-xs">
                  <span className="font-bold text-blue-100">Take Home Pay (Gaji Bersih)</span>
                  <b className="text-sm font-black text-white sm:text-base">{formatIDR(selected.net_pay)}</b>
                </div>

                <p className="text-xs text-slate-400">
                  Status:{" "}
                  {selected.status === "sudah_dibayar"
                    ? `Sudah dibayar${selected.paid_at ? " pada " + formatDateID(selected.paid_at) : ""}`
                    : "Belum dibayar"}
                  {selected.sent_at
                    ? ` · Terkirim via ${selected.sent_via ?? ""} pada ${formatDateID(selected.sent_at)}`
                    : ""}
                </p>
              </div>

              {editable && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addLine();
                  }}
                  className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-3 print:hidden"
                >
                  <select
                    value={line.kind}
                    onChange={(e) => setLine({ ...line, kind: e.target.value as "allowance" | "deduction" })}
                    className="rounded-xl border px-2.5 py-1.5 text-xs font-semibold"
                  >
                    <option value="allowance">+ Tunjangan</option>
                    <option value="deduction">− Potongan</option>
                  </select>
                  <input
                    value={line.label}
                    onChange={(e) => setLine({ ...line, label: e.target.value })}
                    placeholder="Keterangan (mis. Bonus Lembur)"
                    className="min-w-0 flex-1 rounded-xl border px-3 py-1.5 text-xs"
                  />
                  <input
                    type="number"
                    min="1"
                    value={line.amount}
                    onChange={(e) => setLine({ ...line, amount: e.target.value })}
                    placeholder="Nominal Rp"
                    className="w-32 rounded-xl border px-3 py-1.5 text-xs font-bold"
                  />
                  <button className="rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-500">
                    + Tambah Baris
                  </button>
                </form>
              )}

              <div className="mt-6 flex justify-between text-xs text-slate-400">
                <span>
                  Disetujui oleh,
                  <br />
                  <br />
                  <br />
                  _______________________
                  <br />
                  <b className="text-slate-200">PT Vektora Teknologi Nusantara</b>
                </span>
                <span className="text-right">
                  Diterima oleh,
                  <br />
                  <br />
                  <br />
                  _______________________
                  <br />
                  <b className="text-slate-200">{slipName(selected)}</b>
                </span>
              </div>

              {/* Action Toolbar */}
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4 print:hidden">
                <button
                  onClick={() => window.print()}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow shadow-blue-600/30 hover:bg-blue-500"
                >
                  🖨 Cetak / Simpan PDF
                </button>
                {editable && (
                  <>
                    <a
                      href={waLink(selected)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                    >
                      Kirim WhatsApp ↗
                    </a>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(waLink(selected));
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
                    >
                      {copied ? "✓ Tersalin" : "Salin Tautan WA"}
                    </button>

                    <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/25 p-1">
                      <select
                        value={sendVia}
                        onChange={(e) => setSendVia(e.target.value as "whatsapp" | "email" | "langsung")}
                        className="rounded-lg border-0 bg-transparent px-2 py-1 text-xs"
                      >
                        <option value="whatsapp">via WA</option>
                        <option value="email">via Email</option>
                        <option value="langsung">Langsung</option>
                      </select>
                      <button
                        onClick={() =>
                          updateSlip(selected, { sent_at: new Date().toISOString(), sent_via: sendVia })
                        }
                        className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/20"
                      >
                        Catat Terkirim
                      </button>
                    </div>

                    <button
                      onClick={() =>
                        updateSlip(
                          selected,
                          selected.status === "sudah_dibayar"
                            ? { status: "belum_dibayar", paid_at: null }
                            : { status: "sudah_dibayar", paid_at: new Date().toISOString() }
                        )
                      }
                      className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                        selected.status === "sudah_dibayar"
                          ? "border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10"
                          : "bg-emerald-500 text-white shadow shadow-emerald-600/30 hover:bg-emerald-400"
                      }`}
                    >
                      {selected.status === "sudah_dibayar" ? "Batalkan Status Lunas" : "✓ Tandai Sudah Dibayar"}
                    </button>
                  </>
                )}
              </div>
            </Card>
          ) : (
            <Card className="flex h-64 items-center justify-center text-sm text-slate-400">
              Pilih salah satu slip gaji di sebelah kiri untuk melihat detailnya.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

