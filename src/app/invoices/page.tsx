"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Brand, TransactionRow } from "@/lib/types";
import { formatDateID, formatIDR } from "@/lib/format";
import { AccessDenied, Card, EmptySupabase } from "@/components/ui";
import { canEdit, canViewOperations, useAuth } from "@/lib/auth";
import { useBrandsChannels } from "@/lib/useData";
import { buildAutoInvoiceNumber, getBrandLogo } from "@/lib/brandLogo";

interface InvoiceLineItem {
  description: string;
  qty: number;
  unitPrice: number;
}

function InvoicesContent() {
  const searchParams = useSearchParams();
  const { role, profile, loading: authLoading } = useAuth();
  const editable = canEdit(role, profile);
  const { brands } = useBrandsChannels();

  const [txns, setTxns] = useState<TransactionRow[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [selectedTxnId, setSelectedTxnId] = useState<string>("");
  const [invoiceNo, setInvoiceNo] = useState<string>("");
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("Pelanggan / Klien");
  const [customerContact, setCustomerContact] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("Transfer Bank");
  const [paymentStatus, setPaymentStatus] = useState<"LUNAS" | "BELUM LUNAS">("LUNAS");
  const [bankInfo, setBankInfo] = useState<string>("BCA · PT Vektora Teknologi Nusantara");
  const [notes, setNotes] = useState<string>("Terima kasih atas kepercayaan Anda.");
  const [discount, setDiscount] = useState<string>("0");
  const [taxPct, setTaxPct] = useState<string>("0");
  const [items, setItems] = useState<InvoiceLineItem[]>([
    { description: "Penjualan Produk / Layanan", qty: 1, unitPrice: 150000 },
  ]);
  const [savingTxn, setSavingTxn] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.from("transactions")
      .select("*, brands(name)")
      .order("txn_date", { ascending: false })
      .limit(200)
      .then((r) => {
        if (r.data) setTxns(r.data as TransactionRow[]);
      });
  }, []);

  useEffect(() => {
    if (brands.length > 0 && !selectedBrandId) {
      const b0 = brands[0];
      setSelectedBrandId(b0.id);
      setInvoiceNo(buildAutoInvoiceNumber(b0.name, invoiceDate));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brands]);

  // Bila dibuka dari tombol "Invoice" pada daftar transaksi (/invoices?txn_id=...)
  useEffect(() => {
    const qTxnId = searchParams.get("txn_id");
    if (qTxnId && txns.length > 0) {
      const found = txns.find((t) => t.id === qTxnId);
      if (found) applyTransactionToInvoice(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, txns]);

  const activeBrand: Brand | null = useMemo(
    () => brands.find((b) => b.id === selectedBrandId) ?? brands[0] ?? null,
    [brands, selectedBrandId]
  );

  const brandLogo = getBrandLogo(activeBrand);

  function applyTransactionToInvoice(t: TransactionRow) {
    setSelectedTxnId(t.id);
    setSelectedBrandId(t.brand_id);
    const bName = brands.find((b) => b.id === t.brand_id)?.name ?? t.brands?.name ?? "VEKTORA";
    setInvoiceDate(t.txn_date);
    setInvoiceNo(
      t.ref && t.ref.trim().length > 0
        ? t.ref.trim()
        : buildAutoInvoiceNumber(bName, t.txn_date, t.id.slice(0, 4).toUpperCase())
    );
    setPaymentMethod(t.payment_method || "Transfer Bank");
    setPaymentStatus(t.payment_status === "belum_reimburse" ? "BELUM LUNAS" : "LUNAS");
    setItems([
      {
        description: t.description || (t.category ?? "Transaksi"),
        qty: 1,
        unitPrice: Number(t.amount) || 0,
      },
    ]);
    if (t.notes) setNotes(t.notes);
  }

  function handleBrandChange(nextBrandId: string) {
    setSelectedBrandId(nextBrandId);
    const b = brands.find((x) => x.id === nextBrandId);
    setInvoiceNo(buildAutoInvoiceNumber(b?.name, invoiceDate));
  }

  function regenerateNumber() {
    setInvoiceNo(buildAutoInvoiceNumber(activeBrand?.name, invoiceDate));
  }

  function updateItem(idx: number, patch: Partial<InvoiceLineItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, { description: "", qty: 1, unitPrice: 0 }]);
  }

  function removeItem(idx: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + Math.max(0, Number(it.qty) || 0) * Math.max(0, Number(it.unitPrice) || 0), 0),
    [items]
  );
  const discountNum = Math.max(0, Number(discount) || 0);
  const afterDiscount = Math.max(0, subtotal - discountNum);
  const taxAmount = Math.round((afterDiscount * Math.max(0, Number(taxPct) || 0)) / 100);
  const grandTotal = afterDiscount + taxAmount;

  async function saveInvoiceAsIncomeTransaction() {
    if (!editable || !activeBrand || grandTotal <= 0) return;
    const sb = getSupabase();
    if (!sb) return;
    setSavingTxn(true);
    setMsg("");
    const summaryDesc =
      items
        .map((i) => `${i.description || "Item"}${i.qty > 1 ? ` (×${i.qty})` : ""}`)
        .join(", ")
        .slice(0, 160) || "Penjualan Invoice";
    const { error } = await sb.from("transactions").insert({
      brand_id: activeBrand.id,
      channel_id: null,
      kind: "income",
      txn_date: invoiceDate,
      description: `${summaryDesc} — ${customerName}`,
      category: "Penjualan",
      amount: grandTotal,
      payment_method: paymentMethod,
      ref: invoiceNo,
      notes: notes || null,
      payment_status: "sudah_dibayar",
    });
    setSavingTxn(false);
    if (error) {
      setMsg("Gagal menyimpan ke Transaksi: " + error.message);
    } else {
      setMsg(`Invoice ${invoiceNo} (${formatIDR(grandTotal)}) berhasil dicatat sebagai transaksi Pemasukan (Income).`);
    }
  }

  function waInvoiceLink(): string {
    const lines = items
      .map((it, i) => `${i + 1}. ${it.description || "Item"} (${it.qty} × ${formatIDR(it.unitPrice)}) = ${formatIDR(it.qty * it.unitPrice)}`)
      .join("\n");
    const text = `*INVOICE ${invoiceNo}*\n*${activeBrand?.name ?? "PT Vektora"}* — PT Vektora Teknologi Nusantara\nTanggal: ${formatDateID(invoiceDate)}\nKepada: ${customerName}\n\n*Rincian:*\n${lines}\n\n*Total Tagihan: ${formatIDR(grandTotal)}*\nStatus: ${paymentStatus}\nPembayaran: ${paymentMethod} (${bankInfo})\n\n${notes}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  if (!isSupabaseConfigured) return <EmptySupabase />;
  if (authLoading) return <p className="text-blue-200/70">Memuat generator invoice…</p>;
  if (!canViewOperations(role)) return <AccessDenied />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white sm:text-lg">Auto-Generate Invoice</h2>
          <p className="text-[11px] text-blue-200/75">
            Buat invoice resmi otomatis dengan <b>Logo Brand</b>, tarik langsung dari data Transaksi, cetak PDF, atau kirim via WhatsApp.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/brands"
            className="rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-100 hover:bg-white/20"
          >
            ⚙ Atur Logo Brand
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500"
          >
            🖨 Cetak / Simpan PDF
          </button>
        </div>
      </div>

      {msg && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-3.5 py-2.5 text-xs text-emerald-100">
          {msg}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Panel Kiri: Form Konfigurasi Auto-Invoice */}
        <Card className="space-y-3.5 lg:col-span-5 print:hidden">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">1. Sumber Data &amp; Identitas Invoice</h3>
            <button
              type="button"
              onClick={regenerateNumber}
              className="rounded-lg border border-blue-400/30 bg-blue-500/15 px-2.5 py-1 text-[11px] font-semibold text-blue-200 hover:bg-blue-500/25"
            >
              ↻ Auto No. Baru
            </button>
          </div>

          <label className="block text-xs text-blue-200/80">
            Tarik Otomatis dari Transaksi Terdaftar (Opsional)
            <select
              value={selectedTxnId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedTxnId(id);
                const t = txns.find((x) => x.id === id);
                if (t) applyTransactionToInvoice(t);
              }}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-xs"
            >
              <option value="">-- Buat Invoice Manual / Baru --</option>
              {txns.map((t) => (
                <option key={t.id} value={t.id}>
                  [{t.txn_date}] {t.brands?.name} · {t.description} ({formatIDR(t.amount)})
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <label className="block text-xs text-blue-200/80">
              Brand (Menentukan Logo &amp; Kode)
              <select
                value={selectedBrandId}
                onChange={(e) => handleBrandChange(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-xs font-semibold"
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-blue-200/80">
              Nomor Invoice (Auto)
              <input
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 font-mono text-xs font-bold"
              />
            </label>

            <label className="block text-xs text-blue-200/80">
              Tanggal Invoice
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-xs"
              />
            </label>

            <label className="block text-xs text-blue-200/80">
              Jatuh Tempo (Opsional)
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-xs"
              />
            </label>

            <label className="block text-xs text-blue-200/80">
              Ditagihkan Kepada (Nama Klien)
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nama pelanggan / perusahaan"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-xs"
              />
            </label>

            <label className="block text-xs text-blue-200/80">
              Kontak / Alamat Klien (Opsional)
              <input
                value={customerContact}
                onChange={(e) => setCustomerContact(e.target.value)}
                placeholder="No. WA / Email / Kota"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-xs"
              />
            </label>

            <label className="block text-xs text-blue-200/80">
              Status Pembayaran
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as "LUNAS" | "BELUM LUNAS")}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-xs font-semibold"
              >
                <option value="LUNAS">LUNAS (PAID)</option>
                <option value="BELUM LUNAS">BELUM LUNAS (UNPAID)</option>
              </select>
            </label>

            <label className="block text-xs text-blue-200/80">
              Metode Pembayaran
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-xs"
              >
                <option value="Transfer Bank">Transfer Bank</option>
                <option value="QRIS">QRIS</option>
                <option value="BCA VA">BCA VA</option>
                <option value="Tunai">Tunai</option>
                <option value="Shopee / Tokopedia">Marketplace (Shopee / Tokopedia)</option>
                <option value="GoPay / OVO / DANA">E-Wallet (GoPay / OVO / DANA)</option>
              </select>
            </label>
          </div>

          {/* Item Baris Invoice */}
          <div className="border-t border-white/10 pt-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white">2. Rincian Item / Layanan</h4>
              <button
                type="button"
                onClick={addItem}
                className="rounded-lg bg-blue-600/30 px-2.5 py-1 text-[11px] font-semibold text-blue-100 hover:bg-blue-600/50"
              >
                + Tambah Baris
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-2">
                  <input
                    value={it.description}
                    onChange={(e) => updateItem(idx, { description: e.target.value })}
                    placeholder="Nama produk / layanan"
                    className="col-span-6 rounded-lg border px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="number"
                    min="1"
                    value={it.qty}
                    onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })}
                    placeholder="Qty"
                    className="col-span-2 rounded-lg border px-2 py-1.5 text-center text-xs"
                  />
                  <input
                    type="number"
                    min="0"
                    value={it.unitPrice}
                    onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })}
                    placeholder="Harga"
                    className="col-span-3 rounded-lg border px-2 py-1.5 text-xs font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    disabled={items.length <= 1}
                    className="col-span-1 flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/20 text-xs text-rose-200 disabled:opacity-30"
                    title="Hapus baris"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 border-t border-white/10 pt-3">
            <label className="block text-xs text-blue-200/80">
              Diskon (Rp)
              <input
                type="number"
                min="0"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-1.5 text-xs"
              />
            </label>
            <label className="block text-xs text-blue-200/80">
              Pajak / PPN (%)
              <input
                type="number"
                min="0"
                max="100"
                value={taxPct}
                onChange={(e) => setTaxPct(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-1.5 text-xs"
              />
            </label>
          </div>

          <label className="block text-xs text-blue-200/80">
            Info Rekening / Instruksi Pembayaran
            <input
              value={bankInfo}
              onChange={(e) => setBankInfo(e.target.value)}
              placeholder="Mis. BCA 1234567890 a.n. PT Vektora"
              className="mt-1 w-full rounded-xl border px-3 py-1.5 text-xs"
            />
          </label>

          <label className="block text-xs text-blue-200/80">
            Catatan Kaki Invoice
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-1.5 text-xs"
            />
          </label>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex-1 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow shadow-blue-600/30 hover:bg-blue-500"
            >
              🖨 Cetak / PDF
            </button>
            <a
              href={waInvoiceLink()}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-500"
            >
              Kirim WA ↗
            </a>
            {editable && !selectedTxnId && (
              <button
                type="button"
                disabled={savingTxn}
                onClick={saveInvoiceAsIncomeTransaction}
                className="w-full rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25"
              >
                {savingTxn ? "Menyimpan…" : "+ Catat Sekaligus ke Transaksi Pemasukan"}
              </button>
            )}
          </div>
        </Card>

        {/* Panel Kanan: Pratinjau Dokumen Invoice Resmi (Siap Cetak) */}
        <div className="lg:col-span-7">
          <Card className="invoice-print">
            {/* Header Invoice dengan Logo Brand */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/15 pb-4">
              <div className="flex items-center gap-3.5">
                {brandLogo ? (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/25 bg-white p-1.5 shadow-md">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={brandLogo}
                      alt={activeBrand?.name ?? "Logo Brand"}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-blue-400/30 bg-gradient-to-br from-blue-500 to-indigo-700 text-base font-black text-white shadow-md">
                    {(activeBrand?.name ?? "VF").slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-300">
                    PT Vektora Teknologi Nusantara
                  </p>
                  <h3 className="text-base font-black tracking-tight text-white sm:text-lg">
                    {activeBrand?.name ?? "Vektora Brand"}
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    {activeBrand?.segment ?? "Official Business Unit"}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-300">OFFICIAL INVOICE</span>
                <p className="mt-0.5 font-mono text-sm font-black text-white">{invoiceNo}</p>
                <div className="mt-1.5">
                  <span
                    className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1 text-[10px] font-bold leading-none ${
                      paymentStatus === "LUNAS"
                        ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30"
                        : "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30"
                    }`}
                  >
                    {paymentStatus === "LUNAS" ? "LUNAS / PAID" : "BELUM LUNAS / UNPAID"}
                  </span>
                </div>
              </div>
            </div>

            {/* Info Klien & Tanggal */}
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 text-xs">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Ditagihkan Kepada</p>
                <p className="mt-0.5 font-bold text-white">{customerName || "—"}</p>
                {customerContact && <p className="text-[11px] text-slate-300">{customerContact}</p>}
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Rincian Tanggal</p>
                <p className="mt-0.5 text-slate-200">
                  Tanggal: <b className="text-white">{formatDateID(invoiceDate)}</b>
                </p>
                {dueDate && (
                  <p className="text-[11px] text-slate-300">
                    Jatuh Tempo: <b className="text-white">{formatDateID(dueDate)}</b>
                  </p>
                )}
                <p className="text-[11px] text-slate-300">
                  Metode: <b className="text-white">{paymentMethod}</b>
                </p>
              </div>
            </div>

            {/* Tabel Item Invoice */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/10 bg-white/[0.05] text-[10px] uppercase tracking-wider text-slate-300">
                  <tr>
                    <th className="px-3.5 py-2.5">Deskripsi Produk / Layanan</th>
                    <th className="px-3 py-2.5 text-center">Qty</th>
                    <th className="px-3 py-2.5 text-right">Harga Satuan</th>
                    <th className="px-3.5 py-2.5 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {items.map((it, idx) => {
                    const lineTotal = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
                    return (
                      <tr key={idx}>
                        <td className="px-3.5 py-2.5 font-medium text-white">{it.description || "—"}</td>
                        <td className="px-3 py-2.5 text-center text-slate-300">{it.qty}</td>
                        <td className="px-3 py-2.5 text-right text-slate-300">{formatIDR(it.unitPrice)}</td>
                        <td className="px-3.5 py-2.5 text-right font-semibold text-white">{formatIDR(lineTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Ringkasan Total */}
            <div className="mt-4 flex flex-col items-end space-y-1.5 text-xs">
              <div className="flex w-full max-w-xs justify-between text-slate-300">
                <span>Subtotal</span>
                <b className="text-white">{formatIDR(subtotal)}</b>
              </div>
              {discountNum > 0 && (
                <div className="flex w-full max-w-xs justify-between text-emerald-300">
                  <span>Diskon</span>
                  <b>− {formatIDR(discountNum)}</b>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex w-full max-w-xs justify-between text-slate-300">
                  <span>Pajak ({taxPct}%)</span>
                  <b className="text-white">+ {formatIDR(taxAmount)}</b>
                </div>
              )}
              <div className="flex w-full max-w-xs items-center justify-between rounded-xl border border-blue-400/30 bg-blue-500/15 px-3.5 py-2.5">
                <span className="font-bold text-blue-100">Total Tagihan</span>
                <b className="text-sm font-black text-white sm:text-base">{formatIDR(grandTotal)}</b>
              </div>
            </div>

            {/* Footer Instruksi Pembayaran & Tanda Tangan */}
            <div className="mt-5 grid grid-cols-1 gap-4 border-t border-white/10 pt-4 text-xs sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-300">Informasi Pembayaran</p>
                <p className="mt-1 font-semibold text-white">{bankInfo || "—"}</p>
                {notes && <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">{notes}</p>}
              </div>
              <div className="text-right text-slate-400">
                <p>Hormat kami,</p>
                <br />
                <br />
                <p className="font-bold text-white">{activeBrand?.name ?? "PT Vektora"}</p>
                <p className="text-[10px] text-slate-400">PT Vektora Teknologi Nusantara</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={<p className="text-blue-200/70">Memuat halaman invoice…</p>}>
      <InvoicesContent />
    </Suspense>
  );
}
