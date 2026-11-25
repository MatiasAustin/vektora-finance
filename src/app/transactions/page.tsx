"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { summarize } from "@/lib/types";
import type { Brand, LiabilityRow, TransactionRow } from "@/lib/types";
import { formatDateID, formatIDR } from "@/lib/format";
import { AccessDenied, BrandSelect, Card, EmptySupabase, ReadOnlyNotice, StatCard } from "@/components/ui";
import { canEdit, canManageTeam, canViewOperations, useAuth } from "@/lib/auth";
import { useBrandsChannels } from "@/lib/useData";
import { buildAutoInvoiceNumber } from "@/lib/brandLogo";

type FormMode = "income" | "expense" | "debt";

const INCOME_CATEGORIES = [
  "Penjualan",
  "Pre-order / Custom",
  "Jasa 3D Print",
  "Marketplace (Shopee / Tokopedia)",
  "Lainnya",
];

const EXPENSE_CATEGORIES = [
  "Operasional",
  "Bahan Baku",
  "Transportasi",
  "Makan/minum",
  "Produksi/print test",
  "Logistik & Pengiriman",
  "Marketing & Iklan",
  "Hosting & Langganan",
  "Lainnya",
];

const PAYMENT_METHODS = [
  "Transfer",
  "QRIS",
  "Tunai",
  "BCA VA",
  "DANA",
  "GoPay / OVO",
  "ShopeePay",
  "Kartu Debit / Kredit",
];

function TransactionsContent() {
  const searchParams = useSearchParams();
  const { user, profile, role, loading: authLoading } = useAuth();
  const editable = canEdit(role, profile);
  const canDelete = canManageTeam(role);
  const { brands } = useBrandsChannels();
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [liabilities, setLiabilities] = useState<LiabilityRow[]>([]);
  const [brandId, setBrandId] = useState("all");
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<"info" | "error">("info");

  const [mode, setMode] = useState<FormMode>("expense");
  const [form, setForm] = useState({
    brand_id: "",
    kind: "expense" as "income" | "expense",
    txn_date: new Date().toISOString().slice(0, 10),
    description: "",
    category: "Operasional",
    amount: "",
    payment_method: "Transfer",
    ref: "",
    notes: "",
    payment_status: "sudah_dibayar" as "sudah_dibayar" | "belum_reimburse",
    pay_debt: false,
    liability_id: "",
  });

  const [editing, setEditing] = useState<TransactionRow | null>(null);
  const [editLiab, setEditLiab] = useState<LiabilityRow | null>(null);
  const [editForm, setEditForm] = useState({
    brand_id: "",
    kind: "expense" as "income" | "expense",
    txn_date: "",
    description: "",
    category: "Operasional",
    amount: "",
    payment_method: "Transfer",
    ref: "",
    notes: "",
    payment_status: "sudah_dibayar" as "sudah_dibayar" | "belum_reimburse",
  });

  useEffect(() => {
    const qAction = searchParams.get("action");
    const qStatus = searchParams.get("status");
    const qLiab = searchParams.get("liability_id");
    const qBrand = searchParams.get("brand_id");

    if (qStatus === "belum_reimburse" || qStatus === "sudah_dibayar") {
      setStatus(qStatus);
    }
    if (qBrand) {
      setBrandId(qBrand);
    }
    if (qAction === "income") {
      switchMode("income");
    } else if (qAction === "expense") {
      switchMode("expense");
    } else if (qAction === "debt") {
      setMode("debt");
      setForm((f) => ({
        ...f,
        kind: "expense",
        pay_debt: true,
        payment_status: "sudah_dibayar",
        liability_id: qLiab || f.liability_id,
        brand_id: qBrand || f.brand_id,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function switchMode(nextMode: FormMode) {
    setMode(nextMode);
    if (nextMode === "income") {
      setForm((f) => ({
        ...f,
        kind: "income",
        pay_debt: false,
        liability_id: "",
        payment_status: "sudah_dibayar",
        category: INCOME_CATEGORIES.includes(f.category) ? f.category : "Penjualan",
      }));
    } else if (nextMode === "expense") {
      setForm((f) => ({
        ...f,
        kind: "expense",
        pay_debt: false,
        liability_id: "",
        category: EXPENSE_CATEGORIES.includes(f.category) ? f.category : "Operasional",
      }));
    } else {
      setForm((f) => ({
        ...f,
        kind: "expense",
        pay_debt: true,
        payment_status: "sudah_dibayar",
        category: "Pelunasan Hutang",
      }));
    }
  }

  async function load() {
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    const [t, l] = await Promise.all([
      sb
        .from("transactions")
        .select("*, brands(name), liabilities(creditor)")
        .order("txn_date", { ascending: false })
        .limit(500),
      sb.from("liabilities").select("*").eq("status", "aktif").gt("remaining_amount", 0).order("creditor"),
    ]);
    if (t.data) setRows(t.data as TransactionRow[]);
    if (l.data) setLiabilities(l.data as LiabilityRow[]);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (brands.length && !form.brand_id) setForm((f) => ({ ...f, brand_id: brands[0].id }));
  }, [brands, form.brand_id]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (t) =>
          (brandId === "all" || t.brand_id === brandId) &&
          (status === "all" || t.payment_status === status) &&
          (kind === "all" || t.kind === kind)
      ),
    [rows, brandId, status, kind]
  );
  const sum = useMemo(() => summarize(filtered), [filtered]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!editable) return;
    const sb = getSupabase();
    if (!sb) return;
    const amount = Number(form.amount);
    const payingDebt = mode === "debt" || (form.kind === "expense" && form.pay_debt);
    if (payingDebt && !form.liability_id) {
      setMsgTone("error");
      setMsg(
        'Pilih dulu hutang di dropdown "Pilih hutang yang dicicil", atau pindah ke tab "Pengeluaran OPEX" bila ini bukan pembayaran hutang.'
      );
      return;
    }
    let creditor = "";
    let remaining = 0;
    if (payingDebt) {
      const { data: liab } = await sb.from("liabilities").select("*").eq("id", form.liability_id).single();
      if (!liab) {
        setMsgTone("error");
        setMsg("Hutang yang dipilih tidak ditemukan — muat ulang halaman.");
        return;
      }
      creditor = (liab as LiabilityRow).creditor;
      remaining = Number((liab as LiabilityRow).remaining_amount);
      if (amount > remaining) {
        setMsgTone("error");
        setMsg(
          `Jumlah bayar ${formatIDR(amount)} melebihi sisa hutang ${creditor} (${formatIDR(
            remaining
          )}). Maksimal pembayaran adalah sisa hutang.`
        );
        return;
      }
    }

    const effectiveKind = mode === "income" ? "income" : "expense";
    const effectiveStatus = effectiveKind === "income" || payingDebt ? "sudah_dibayar" : form.payment_status;

    const { error } = await sb.from("transactions").insert({
      brand_id: form.brand_id,
      channel_id: null,
      kind: effectiveKind,
      txn_date: form.txn_date,
      amount,
      payment_method: form.payment_method,
      ref: form.ref || null,
      notes: form.notes || null,
      payment_status: effectiveStatus,
      reimbursed_at: null,
      category: payingDebt ? "Pelunasan Hutang" : form.category,
      description: payingDebt
        ? `Bayar hutang: ${creditor}${form.description ? ` — ${form.description}` : ""}`
        : form.description,
      liability_id: payingDebt ? form.liability_id : null,
    });
    if (error) {
      setMsgTone("error");
      setMsg("Gagal simpan: " + error.message);
      return;
    }
    if (payingDebt) {
      const nextRemaining = Math.max(0, remaining - amount);
      const { error: lerr } = await sb
        .from("liabilities")
        .update({
          remaining_amount: nextRemaining,
          status: nextRemaining === 0 ? "lunas" : "aktif",
        })
        .eq("id", form.liability_id);
      if (lerr) {
        setMsgTone("error");
        setMsg(
          `Transaksi tersimpan, tapi sisa hutang gagal diperbarui: ${lerr.message}. Perbaiki manual di halaman Hutang.`
        );
        load();
        return;
      }
      setMsgTone("info");
      setMsg(
        `Cicilan tersimpan. Sisa hutang ${creditor} sekarang ${formatIDR(nextRemaining)}${
          nextRemaining === 0 ? " — LUNAS!" : "."
        }`
      );
    } else {
      setMsgTone("info");
      setMsg("Transaksi berhasil disimpan.");
    }
    setForm((f) => ({ ...f, description: "", amount: "", ref: "", notes: "", liability_id: "" }));
    load();
  }

  function snapshot(t: TransactionRow): Record<string, unknown> {
    return {
      brand_id: t.brand_id,
      kind: t.kind,
      txn_date: t.txn_date,
      description: t.description,
      category: t.category,
      amount: t.amount,
      payment_method: t.payment_method,
      ref: t.ref,
      notes: t.notes,
      payment_status: t.payment_status,
      liability_id: t.liability_id ?? null,
    };
  }

  async function writeAudit(
    action: "edit" | "delete",
    t: TransactionRow,
    oldValues: Record<string, unknown>,
    newValues: Record<string, unknown> | null
  ): Promise<string | null> {
    const sb = getSupabase();
    if (!sb) return "Supabase belum terhubung";
    const { error } = await sb.from("audit_log").insert({
      actor_id: user?.id ?? null,
      actor_name: profile?.full_name ?? profile?.email ?? user?.email ?? null,
      actor_email: user?.email ?? profile?.email ?? null,
      action,
      table_name: "transactions",
      record_id: t.id,
      record_label: t.description,
      old_values: oldValues,
      new_values: newValues,
    });
    return error ? error.message : null;
  }

  async function startEdit(t: TransactionRow) {
    setEditing(t);
    setEditForm({
      brand_id: t.brand_id,
      kind: t.kind,
      txn_date: t.txn_date,
      description: t.description,
      category: t.category || (t.kind === "income" ? "Penjualan" : "Operasional"),
      amount: String(t.amount),
      payment_method: t.payment_method || "Transfer",
      ref: t.ref ?? "",
      notes: t.notes ?? "",
      payment_status: t.payment_status,
    });
    setEditLiab(null);
    setMsg("");
    if (t.liability_id) {
      const sb = getSupabase();
      if (sb) {
        const { data } = await sb.from("liabilities").select("*").eq("id", t.liability_id).maybeSingle();
        if (data) setEditLiab(data as LiabilityRow);
      }
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !editable) return;
    const sb = getSupabase();
    if (!sb) return;
    const amount = Number(editForm.amount);
    if (!editForm.description.trim()) {
      setMsgTone("error");
      setMsg("Keterangan wajib diisi.");
      return;
    }
    if (!editForm.txn_date) {
      setMsgTone("error");
      setMsg("Tanggal wajib diisi.");
      return;
    }
    if (!(amount > 0)) {
      setMsgTone("error");
      setMsg("Jumlah harus lebih dari 0.");
      return;
    }
    const oldValues = snapshot(editing);
    const isDebt = !!editing.liability_id;
    const nextKind = isDebt ? "expense" : editForm.kind;
    let nextRemaining: number | null = null;
    let liab: LiabilityRow | null = null;
    if (isDebt) {
      const { data } = await sb.from("liabilities").select("*").eq("id", editing.liability_id).maybeSingle();
      if (!data) {
        setMsgTone("error");
        setMsg("Hutang terkait transaksi ini tidak ditemukan — muat ulang halaman.");
        return;
      }
      liab = data as LiabilityRow;
      const remaining = Number(liab.remaining_amount);
      const original = Number(liab.amount);
      nextRemaining = remaining + Number(editing.amount) - amount;
      if (nextRemaining < 0) {
        setMsgTone("error");
        setMsg(
          `Jumlah baru ${formatIDR(amount)} melebihi yang masih bisa dibayar untuk hutang ${
            liab.creditor
          } (maksimal ${formatIDR(remaining + Number(editing.amount))}).`
        );
        return;
      }
      if (nextRemaining > original) {
        setMsgTone("error");
        setMsg(
          `Jumlah baru membuat sisa hutang ${liab.creditor} (${formatIDR(
            nextRemaining
          )}) melebihi total hutang awal (${formatIDR(original)}).`
        );
        return;
      }
    }

    const effectiveStatus = nextKind === "income" ? "sudah_dibayar" : editForm.payment_status;
    const patch: Record<string, unknown> = {
      brand_id: editForm.brand_id,
      kind: nextKind,
      txn_date: editForm.txn_date,
      description: editForm.description.trim(),
      category: editForm.category || null,
      amount,
      payment_method: editForm.payment_method || null,
      ref: editForm.ref || null,
      notes: editForm.notes || null,
      payment_status: effectiveStatus,
      updated_at: new Date().toISOString(),
    };
    if (effectiveStatus === "sudah_dibayar" && !editing.reimbursed_at) {
      patch.reimbursed_at = new Date().toISOString();
    }
    if (effectiveStatus === "belum_reimburse") {
      patch.reimbursed_at = null;
    }
    const { error } = await sb.from("transactions").update(patch).eq("id", editing.id);
    if (error) {
      setMsgTone("error");
      setMsg("Gagal simpan perubahan: " + error.message);
      return;
    }
    const newValues: Record<string, unknown> = {
      ...oldValues,
      ...patch,
      liability_id: editing.liability_id ?? null,
    };
    delete newValues.updated_at;
    if (isDebt && liab && nextRemaining !== null) {
      const finalRemaining = Math.max(0, nextRemaining);
      const { error: lerr } = await sb
        .from("liabilities")
        .update({
          remaining_amount: finalRemaining,
          status: finalRemaining === 0 ? "lunas" : "aktif",
        })
        .eq("id", liab.id);
      if (lerr) {
        setMsgTone("error");
        setMsg(
          `Perubahan tersimpan, tapi sisa hutang gagal diperbarui: ${lerr.message}. Perbaiki manual di halaman Hutang.`
        );
        setEditing(null);
        setEditLiab(null);
        load();
        return;
      }
    }
    const auditErr = await writeAudit("edit", editing, oldValues, newValues);
    setEditing(null);
    setEditLiab(null);
    setMsgTone(auditErr ? "error" : "info");
    setMsg(auditErr ? `Perubahan tersimpan, tapi riwayat TIDAK tercatat: ${auditErr}.` : "Perubahan transaksi tersimpan.");
    load();
  }

  async function removeTxn(t: TransactionRow) {
    if (!canDelete) return;
    const sb = getSupabase();
    if (!sb) return;
    const ok = window.confirm(
      `Hapus transaksi ini?\n\n${t.description}\n${t.kind === "income" ? "+" : "−"}${formatIDR(
        t.amount
      )} · ${formatDateID(t.txn_date)}` +
        (t.liability_id ? "\nIni pembayaran hutang — jumlahnya akan dikembalikan ke sisa hutang." : "") +
        "\n\nTindakan ini dicatat di Riwayat."
    );
    if (!ok) return;
    const oldValues = snapshot(t);
    const { error } = await sb.from("transactions").delete().eq("id", t.id);
    if (error) {
      setMsgTone("error");
      setMsg("Gagal hapus: " + error.message);
      return;
    }
    if (t.liability_id) {
      const { data } = await sb.from("liabilities").select("*").eq("id", t.liability_id).maybeSingle();
      if (data) {
        const liab = data as LiabilityRow;
        const restored = Math.min(Number(liab.amount), Number(liab.remaining_amount) + Number(t.amount));
        const { error: lerr } = await sb
          .from("liabilities")
          .update({
            remaining_amount: restored,
            status: restored > 0 ? "aktif" : "lunas",
          })
          .eq("id", liab.id);
        if (lerr) {
          setMsgTone("error");
          setMsg(
            `Transaksi terhapus, tapi sisa hutang gagal dikembalikan: ${lerr.message}. Perbaiki manual di halaman Hutang.`
          );
          load();
          return;
        }
      }
    }
    const auditErr = await writeAudit("delete", t, oldValues, null);
    setMsgTone(auditErr ? "error" : "info");
    setMsg(auditErr ? `Transaksi terhapus, tapi riwayat TIDAK tercatat: ${auditErr}.` : "Transaksi terhapus.");
    load();
  }

  async function flip(t: TransactionRow) {
    if (!editable) return;
    const sb = getSupabase();
    if (!sb) return;
    const next = t.payment_status === "belum_reimburse" ? "sudah_dibayar" : "belum_reimburse";
    const { error } = await sb
      .from("transactions")
      .update({ payment_status: next, reimbursed_at: next === "sudah_dibayar" ? new Date().toISOString() : null })
      .eq("id", t.id);
    if (error) {
      setMsgTone("error");
      setMsg("Gagal ubah status: " + error.message);
    } else {
      if (next === "sudah_dibayar") {
        await sb.from("reimbursements").insert({
          transaction_id: t.id,
          amount: t.amount,
          notes: "Direimburse dari app",
        });
      }
      load();
    }
  }

  if (!isSupabaseConfigured) return <EmptySupabase />;
  if (loading || authLoading) return <p className="text-blue-200/70">Memuat transaksi…</p>;
  if (!canViewOperations(role))
    return (
      <AccessDenied text="Halaman Transaksi tidak bisa diakses karyawan. Karyawan hanya bisa melihat slip gajinya sendiri di halaman Slip Gaji." />
    );

  const activeCategoryOptions = mode === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const editCategoryOptions = Array.from(
    new Set([
      ...(editForm.kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES),
      ...(editForm.category ? [editForm.category] : []),
    ])
  );
  const editMethodOptions = Array.from(
    new Set([...PAYMENT_METHODS, ...(editForm.payment_method ? [editForm.payment_method] : [])])
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white sm:text-lg">Transaksi &amp; Arus Kas</h2>
          <p className="text-[11px] text-blue-200/75">
            Pemasukan, pengeluaran operasional, reimburse, dan cicilan hutang.
          </p>
        </div>
        <BrandSelect brands={brands} value={brandId} onChange={setBrandId} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Income" value={formatIDR(sum.income)} tone="positive" />
        <StatCard label="Pengeluaran Terhitung" value={formatIDR(sum.expense)} tone="negative" />
        <StatCard label="Belum Reimburse" value={formatIDR(sum.belumReimburse)} tone="warning" />
        <StatCard label="Saldo Bersih" value={formatIDR(sum.net)} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-white">Catat Transaksi Baru</h3>
          {editable && (
            <div className="inline-flex rounded-2xl border border-white/10 bg-black/30 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => switchMode("income")}
                className={`rounded-xl px-3 py-1.5 transition ${
                  mode === "income"
                    ? "bg-emerald-500 text-white shadow"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                + Pemasukan (Income)
              </button>
              <button
                type="button"
                onClick={() => switchMode("expense")}
                className={`rounded-xl px-3 py-1.5 transition ${
                  mode === "expense"
                    ? "bg-blue-600 text-white shadow"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                − Pengeluaran OPEX
              </button>
              <button
                type="button"
                onClick={() => switchMode("debt")}
                className={`rounded-xl px-3 py-1.5 transition ${
                  mode === "debt"
                    ? "bg-indigo-500 text-white shadow"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                ⟳ Bayar Cicilan Hutang
              </button>
            </div>
          )}
        </div>

        {editable ? (
          <form onSubmit={add} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-xs text-blue-200/80">
              Brand
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

            {mode === "debt" ? (
              <label className="block text-xs text-blue-200/80 sm:col-span-2">
                Pilih Hutang yang Dicicil / Dilunasi
                <select
                  value={form.liability_id}
                  onChange={(e) => setForm({ ...form, liability_id: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-indigo-400/40 px-3 py-2 text-sm"
                  required
                >
                  <option value="">Pilih kreditur / hutang aktif…</option>
                  {liabilities
                    .filter((l) => !form.brand_id || !l.brand_id || l.brand_id === form.brand_id)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.creditor} — Sisa {formatIDR(l.remaining_amount)}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <label className="block text-xs text-blue-200/80">
                Kategori
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                >
                  {activeCategoryOptions.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block text-xs text-blue-200/80">
              Tanggal Transaksi
              <input
                type="date"
                value={form.txn_date}
                onChange={(e) => setForm({ ...form, txn_date: e.target.value })}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                required
              />
            </label>

            <label className="block text-xs text-blue-200/80 sm:col-span-2">
              {mode === "debt" ? "Catatan Cicilan (opsional, nama kreditur otomatis)" : "Keterangan Transaksi"}
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={
                  mode === "income"
                    ? "Mis. Penjualan custom 3D print batch #12"
                    : mode === "debt"
                    ? "Mis. Cicilan bulan ke-3"
                    : "Mis. Beli nozzle & sparepart printer"
                }
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                required={mode !== "debt"}
              />
            </label>

            <label className="block text-xs text-blue-200/80">
              Nominal (Rp)
              <input
                type="number"
                min="1"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-bold"
                required
              />
            </label>

            <label className="block text-xs text-blue-200/80">
              Metode Pembayaran
              <select
                value={form.payment_method}
                onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              >
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm} value={pm}>
                    {pm}
                  </option>
                ))}
              </select>
            </label>

            {mode === "expense" && (
              <label className="block text-xs text-blue-200/80">
                Status Pembayaran
                <select
                  value={form.payment_status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      payment_status: e.target.value as "sudah_dibayar" | "belum_reimburse",
                    })
                  }
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                >
                  <option value="sudah_dibayar">Sudah dibayar (langsung masuk pengeluaran)</option>
                  <option value="belum_reimburse">Belum reimburse (ditahan dulu dari total)</option>
                </select>
              </label>
            )}

            <div className="block text-xs text-blue-200/80">
              <div className="flex items-center justify-between">
                <span>No. Referensi / Invoice (opsional)</span>
                <button
                  type="button"
                  onClick={() => {
                    const bName = brands.find((b) => b.id === form.brand_id)?.name;
                    setForm((f) => ({ ...f, ref: buildAutoInvoiceNumber(bName, f.txn_date) }));
                  }}
                  className="text-[11px] font-semibold text-blue-300 hover:text-white hover:underline"
                >
                  ↻ Auto No. Invoice
                </button>
              </div>
              <input
                value={form.ref}
                onChange={(e) => setForm({ ...form, ref: e.target.value })}
                placeholder="INV/..."
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-mono"
              />
            </div>

            <label className="block text-xs text-blue-200/80 sm:col-span-2">
              Catatan Tambahan (opsional)
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Keterangan tambahan bila diperlukan"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </label>

            <div className="flex items-end">
              <button
                type="submit"
                className={`w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-lg transition ${
                  mode === "income"
                    ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30"
                    : mode === "debt"
                    ? "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30"
                    : "bg-blue-600 hover:bg-blue-500 shadow-blue-600/30"
                }`}
              >
                {mode === "income"
                  ? "Simpan Pemasukan"
                  : mode === "debt"
                  ? "Simpan Cicilan Hutang"
                  : "Simpan Pengeluaran"}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-3">
            <ReadOnlyNotice role={role} />
          </div>
        )}

        {msg && (
          <div
            className={`mt-3 rounded-2xl border px-3.5 py-2.5 text-xs font-medium ${
              msgTone === "error"
                ? "border-rose-400/30 bg-rose-500/15 text-rose-200"
                : "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"
            }`}
          >
            {msg}
          </div>
        )}

        <p className="mt-3 text-xs text-slate-400">
          {mode === "debt"
            ? "Cicilan hutang otomatis mengurangi sisa hutang terkait dan tidak dihitung dua kali sebagai beban operasional."
            : mode === "income"
            ? "Pemasukan otomatis berstatus lunas dan menambah laba bersih brand."
            : "Pengeluaran berstatus Belum reimburse dicatat sebagai antrean dan baru masuk total setelah diklik Tandai Reimburse."}
        </p>
      </Card>

      {/* MODAL EDIT TRANSAKSI (Dropdown Kategori & Metode Pembayaran) */}
      {editing && editable && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => {
            setEditing(null);
            setEditLiab(null);
          }}
        >
          <div
            className="finora-surface max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl p-6 text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white">Ubah Transaksi</h3>
                <p className="text-xs text-blue-200/75">
                  Setiap perubahan otomatis tercatat di halaman Riwayat Audit.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setEditLiab(null);
                }}
                className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/20"
              >
                ✕ Tutup
              </button>
            </div>

            {editing.liability_id && (
              <p className="mt-3 rounded-xl border border-indigo-400/30 bg-indigo-500/15 px-3 py-2 text-xs text-indigo-200">
                Pembayaran hutang: <b>{editLiab ? `${editLiab.creditor} (sisa ${formatIDR(editLiab.remaining_amount)})` : "…"}</b>.
                Selisih nominal akan otomatis menyesuaikan sisa hutang.
              </p>
            )}

            <form onSubmit={saveEdit} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs text-blue-200/80">
                Brand
                <select
                  value={editForm.brand_id}
                  onChange={(e) => setEditForm({ ...editForm, brand_id: e.target.value })}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                  required
                >
                  {brands.map((b: Brand) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs text-blue-200/80">
                Jenis
                <select
                  value={editForm.kind}
                  onChange={(e) => {
                    const nextK = e.target.value as "income" | "expense";
                    setEditForm({
                      ...editForm,
                      kind: nextK,
                      category: nextK === "income" ? "Penjualan" : "Operasional",
                    });
                  }}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                  disabled={!!editing.liability_id}
                >
                  <option value="income">Income</option>
                  <option value="expense">Pengeluaran</option>
                </select>
              </label>

              <label className="text-xs text-blue-200/80">
                Tanggal
                <input
                  type="date"
                  value={editForm.txn_date}
                  onChange={(e) => setEditForm({ ...editForm, txn_date: e.target.value })}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                  required
                />
              </label>

              <label className="text-xs text-blue-200/80">
                Kategori
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                  disabled={!!editing.liability_id}
                >
                  {editCategoryOptions.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs text-blue-200/80 sm:col-span-2">
                Keterangan
                <input
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                  required
                />
              </label>

              <label className="text-xs text-blue-200/80">
                Jumlah (Rp)
                <input
                  type="number"
                  min="1"
                  value={editForm.amount}
                  onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-bold"
                  required
                />
              </label>

              <label className="text-xs text-blue-200/80">
                Metode Pembayaran
                <select
                  value={editForm.payment_method}
                  onChange={(e) => setEditForm({ ...editForm, payment_method: e.target.value })}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                >
                  {editMethodOptions.map((pm) => (
                    <option key={pm} value={pm}>
                      {pm}
                    </option>
                  ))}
                </select>
              </label>

              {editForm.kind === "expense" && !editing.liability_id && (
                <label className="text-xs text-blue-200/80">
                  Status Pembayaran
                  <select
                    value={editForm.payment_status}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        payment_status: e.target.value as "sudah_dibayar" | "belum_reimburse",
                      })
                    }
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                  >
                    <option value="sudah_dibayar">Sudah dibayar</option>
                    <option value="belum_reimburse">Belum reimburse</option>
                  </select>
                </label>
              )}

              <label className="text-xs text-blue-200/80">
                Ref / Invoice
                <input
                  value={editForm.ref}
                  onChange={(e) => setEditForm({ ...editForm, ref: e.target.value })}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                />
              </label>

              <label className="text-xs text-blue-200/80 sm:col-span-2">
                Catatan
                <input
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                />
              </label>

              <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setEditLiab(null);
                  }}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DAFTAR TRANSAKSI */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-white">Daftar Transaksi ({filtered.length})</h3>
          <div className="flex flex-wrap gap-2">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="rounded-xl border px-3 py-1.5 text-xs font-medium"
            >
              <option value="all">Semua jenis</option>
              <option value="income">Income (+)</option>
              <option value="expense">Pengeluaran (−)</option>
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-xl border px-3 py-1.5 text-xs font-medium"
            >
              <option value="all">Semua status</option>
              <option value="sudah_dibayar">Sudah dibayar</option>
              <option value="belum_reimburse">Belum reimburse</option>
            </select>
          </div>
        </div>

        <ul className="mt-3.5 space-y-2">
          {filtered.map((t) => {
            const isIncome = t.kind === "income";
            const isDebt = Boolean(t.liability_id);
            const isPending = t.payment_status === "belum_reimburse";
            return (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5 text-xs transition hover:bg-white/[0.06]"
              >
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[10px] font-black ${
                      isIncome
                        ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30"
                        : isDebt
                        ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-400/30"
                        : isPending
                        ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30"
                        : "bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/30"
                    }`}
                  >
                    {isIncome ? "IN" : isDebt ? "CIC" : "OUT"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-xs font-semibold text-white">{t.description}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {formatDateID(t.txn_date)} · {t.brands?.name} · {t.category ?? "—"} · {t.payment_method ?? "—"}
                      {t.ref ? ` · Ref: ${t.ref}` : ""}
                      {t.liability_id
                        ? ` · Cicilan ke ${t.liabilities?.creditor ?? "hutang"} (tidak masuk beban OPEX)`
                        : ""}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`shrink-0 whitespace-nowrap text-xs font-bold sm:text-sm ${
                      isIncome ? "text-emerald-300" : isPending ? "text-amber-300" : "text-white"
                    }`}
                  >
                    {isIncome ? "+" : "−"}
                    {formatIDR(t.amount)}
                  </span>

                  <span
                    className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3.5 py-1 text-[11px] font-semibold leading-none ${
                      isPending
                        ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30"
                        : isDebt
                        ? "bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/30"
                        : "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/25"
                    }`}
                  >
                    {isPending ? "Belum reimburse" : isDebt ? "Cicilan lunas" : "Sudah dibayar"}
                  </span>

                  {editable && t.kind === "expense" && !t.liability_id && (
                    <button
                      onClick={() => flip(t)}
                      className={`rounded-xl px-3 py-1 text-xs font-semibold transition ${
                        isPending
                          ? "bg-emerald-500 text-white shadow shadow-emerald-600/30 hover:bg-emerald-400"
                          : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                      }`}
                      title={
                        isPending
                          ? "Tandai sudah direimburse agar masuk ke perhitungan pengeluaran"
                          : "Kembalikan status menjadi Belum reimburse"
                      }
                    >
                      {isPending ? "✓ Tandai Reimburse" : "Ubah ke Belum Reimburse"}
                    </button>
                  )}

                  <Link
                    href={`/invoices?txn_id=${t.id}`}
                    className="rounded-xl border border-blue-400/30 bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-200 hover:bg-blue-500/30"
                    title="Auto-Generate Invoice dengan Logo Brand dari transaksi ini"
                  >
                    🧾 Invoice
                  </Link>

                  {editable && (
                    <button
                      onClick={() => startEdit(t)}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-blue-200 hover:bg-white/15"
                    >
                      Edit
                    </button>
                  )}

                  {canDelete && (
                    <button
                      onClick={() => removeTxn(t)}
                      className="rounded-xl border border-rose-400/25 bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-200 hover:bg-rose-500/30"
                    >
                      Hapus
                    </button>
                  )}
                </div>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="rounded-2xl border border-white/5 bg-white/[0.02] py-8 text-center text-sm text-slate-400">
              Tidak ada transaksi yang cocok dengan filter di atas.
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<p className="text-blue-200/70">Memuat halaman transaksi…</p>}>
      <TransactionsContent />
    </Suspense>
  );
}



