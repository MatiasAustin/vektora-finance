"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { summarize } from "@/lib/types";
import type { Brand, Channel, LiabilityRow, TransactionRow } from "@/lib/types";
import { formatDateID, formatIDR } from "@/lib/format";
import { AccessDenied, BrandSelect, Card, EmptySupabase, ReadOnlyNotice } from "@/components/ui";
import { canEdit, useAuth } from "@/lib/auth";
import { canViewOperations } from "@/lib/auth";
import { useBrandsChannels } from "@/lib/useData";

export default function TransactionsPage() {
  const { role, loading: authLoading } = useAuth();
  const editable = canEdit(role);
  const { brands, channels } = useBrandsChannels();
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [liabilities, setLiabilities] = useState<LiabilityRow[]>([]);
  const [brandId, setBrandId] = useState("all");
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const [channelId, setChannelId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState({
    brand_id: "",
    channel_id: "",
    kind: "expense" as "income" | "expense",
    txn_date: new Date().toISOString().slice(0, 10),
    description: "",
    category: "Operasional",
    amount: "",
    payment_method: "Transfer",
    ref: "",
    notes: "",
    payment_status: "sudah_dibayar" as "sudah_dibayar" | "belum_reimburse",
    // Bayar hutang = toggle, bukan dropdown yang selalu kelihatan terpilih
    // (24 Nov 2026, Mattin): default MATI = pengeluaran biasa. Baru bila
    // toggle NYALA, dropdown "Pilih hutang" muncul dan wajib diisi.
    pay_debt: false,
    liability_id: "",
  });

  async function load() {
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    const [t, l] = await Promise.all([
      sb.from("transactions").select("*, brands(name), channels(name), liabilities(creditor)").order("txn_date", { ascending: false }).limit(500),
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
          (kind === "all" || t.kind === kind) &&
          (channelId === "all" || t.channel_id === channelId)
      ),
    [rows, brandId, status, kind, channelId]
  );
  const sum = useMemo(() => summarize(filtered), [filtered]);

  // Bayar hutang (24 Nov 2026): pengeluaran KHUSUS pelunasan hutang.
  // - Transaksi tetap tercatat, kategori "Pelunasan Hutang", terhubung ke
  //   hutang via liability_id — tapi TIDAK masuk total pengeluaran/laba
  //   (anti double count: asetnya sudah tercatat; cicilan hanya mengurangi
  //   hutang). Lihat summarize() di src/lib/types.ts.
  // - Sisa hutang berkurang sebesar jumlah bayar (floor 0); sisa 0 = lunas.
  // - Jumlah bayar TIDAK BOLEH melebihi sisa hutang: ditolak dengan pesan.
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!editable) return;
    const sb = getSupabase();
    if (!sb) return;
    const amount = Number(form.amount);
    const payingDebt = form.kind === "expense" && form.pay_debt;
    // Toggle nyala tapi hutang belum dipilih = tolak dengan pesan jelas.
    if (payingDebt && !form.liability_id) {
      setMsg("Ini ditandai sebagai pembayaran hutang, tapi hutangnya belum dipilih. Pilih dulu hutang di dropdown \"Pilih hutang\", atau matikan toggle \"Ini pembayaran hutang\" kalau ini pengeluaran biasa.");
      return;
    }
    let creditor = "";
    let remaining = 0;
    if (payingDebt) {
      const { data: liab } = await sb.from("liabilities").select("*").eq("id", form.liability_id).single();
      if (!liab) {
        setMsg("Hutang yang dipilih tidak ditemukan — muat ulang halaman.");
        return;
      }
      creditor = (liab as LiabilityRow).creditor;
      remaining = Number((liab as LiabilityRow).remaining_amount);
      if (amount > remaining) {
        setMsg(`Jumlah bayar ${formatIDR(amount)} melebihi sisa hutang ${creditor} (${formatIDR(remaining)}). Kurangi jumlahnya atau bayar maksimal sisa hutang.`);
        return;
      }
    }
    const { error } = await sb.from("transactions").insert({
      ...form,
      amount,
      channel_id: form.channel_id || null,
      reimbursed_at: null,
      category: payingDebt ? "Pelunasan Hutang" : form.category,
      description: payingDebt
        ? `Bayar hutang: ${creditor}${form.description ? ` — ${form.description}` : ""}`
        : form.description,
      liability_id: payingDebt ? form.liability_id : null,
    });
    if (error) {
      setMsg("Gagal simpan: " + error.message);
      return;
    }
    if (payingDebt) {
      const nextRemaining = Math.max(0, remaining - amount);
      const { error: lerr } = await sb.from("liabilities").update({
        remaining_amount: nextRemaining,
        status: nextRemaining === 0 ? "lunas" : "aktif",
      }).eq("id", form.liability_id);
      if (lerr) {
        setMsg(`Transaksi tersimpan, tapi sisa hutang gagal diperbarui: ${lerr.message}. Perbaiki manual di halaman Hutang.`);
        load();
        return;
      }
      setMsg(`Tersimpan. Sisa hutang ${creditor} sekarang ${formatIDR(nextRemaining)}${nextRemaining === 0 ? " — LUNAS." : "."}`);
    } else {
      setMsg("Tersimpan.");
    }
    setForm((f) => ({ ...f, description: "", amount: "", ref: "", notes: "", pay_debt: false, liability_id: "" }));
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
    if (error) setMsg("Gagal ubah status: " + error.message);
    else {
      if (next === "sudah_dibayar") {
        await sb.from("reimbursements").insert({ transaction_id: t.id, amount: t.amount, notes: "Direimburse dari app" });
      }
      load();
    }
  }

  if (!isSupabaseConfigured) return <EmptySupabase />;
  if (loading || authLoading) return <p className="text-slate-500">Memuat…</p>;
  if (!canViewOperations(role)) return <AccessDenied text="Halaman Transaksi tidak bisa diakses karyawan. Karyawan hanya bisa melihat slip gajinya sendiri di halaman Slip Gaji." />;

  const brandChannels: Channel[] = channels.filter(
    (c) => !c.brand_id || c.brand_id === form.brand_id
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Transaksi</h2>
        <BrandSelect brands={brands} value={brandId} onChange={setBrandId} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Income", sum.income],
          ["Pengeluaran terhitung", sum.expense],
          ["Belum reimburse", sum.belumReimburse],
          ["Saldo", sum.net],
        ].map(([label, v]) => (
          <Card key={label as string}>
            <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-bold">{formatIDR(v as number)}</p>
          </Card>
        ))}
      </div>

      <Card>
        <h3 className="font-bold">Tambah transaksi</h3>
        {editable ? (<form onSubmit={add} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <select value={form.brand_id} onChange={(e) => setForm({ ...form, brand_id: e.target.value })} className="rounded-xl border px-3 py-2" required>
            <option value="">Pilih brand…</option>
            {brands.map((b: Brand) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <select value={form.channel_id} onChange={(e) => setForm({ ...form, channel_id: e.target.value })} className="rounded-xl border px-3 py-2">
            <option value="">Channel — (kosong = tanpa channel)</option>
            {brandChannels.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "income" | "expense", pay_debt: false, liability_id: "" })} className="rounded-xl border px-3 py-2">
            <option value="income">Income</option>
            <option value="expense">Pengeluaran</option>
          </select>
          {form.kind === "expense" && (
            <div className="rounded-xl border px-3 py-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={form.pay_debt} onChange={(e) => setForm({ ...form, pay_debt: e.target.checked, liability_id: "" })} />
                Ini pembayaran hutang (cicilan)
              </label>
              {form.pay_debt ? (
                <>
                  <select value={form.liability_id} onChange={(e) => setForm({ ...form, liability_id: e.target.value })} className="mt-2 w-full rounded-xl border px-3 py-2" required>
                    <option value="">Pilih hutang…</option>
                    {liabilities.filter((l) => !form.brand_id || !l.brand_id || l.brand_id === form.brand_id).map((l) => (
                      <option key={l.id} value={l.id}>{l.creditor} — sisa {formatIDR(l.remaining_amount)}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">Cicilan — hanya mengurangi sisa hutang, TIDAK masuk total pengeluaran &amp; laba.</p>
                </>
              ) : (
                <p className="mt-1 text-xs text-slate-500">Pengeluaran biasa — masuk total pengeluaran &amp; laba.</p>
              )}
            </div>
          )}
          <input type="date" value={form.txn_date} onChange={(e) => setForm({ ...form, txn_date: e.target.value })} className="rounded-xl border px-3 py-2" required />
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Keterangan" className="rounded-xl border px-3 py-2" required />
          <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Kategori (mis. Operasional, Bahan Baku)" className="rounded-xl border px-3 py-2" />
          <input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Jumlah (Rp)" className="rounded-xl border px-3 py-2" required />
          <input value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} placeholder="Metode (Transfer / QRIS / DANA / Tunai…)" className="rounded-xl border px-3 py-2" />
          <select value={form.payment_status} onChange={(e) => setForm({ ...form, payment_status: e.target.value as "sudah_dibayar" | "belum_reimburse" })} className="rounded-xl border px-3 py-2">
            <option value="sudah_dibayar">Sudah dibayar</option>
            <option value="belum_reimburse">Belum reimburse</option>
          </select>
          <input value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} placeholder="Ref / nomor invoice (opsional)" className="rounded-xl border px-3 py-2" />
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Catatan (opsional)" className="rounded-xl border px-3 py-2 md:col-span-2" />
          <button className="rounded-xl bg-vektora-500 px-4 py-2 font-semibold text-white">Simpan</button>
        </form>) : (<ReadOnlyNotice role={role} />)}
        {msg && <p className="mt-2 text-sm text-slate-600">{msg}</p>}
        <p className="mt-2 text-xs text-slate-500">
          Belum reimburse: tercatat tapi tidak masuk total pengeluaran/saldo. Klik &quot;Reimburse&quot; di
          daftar saat sudah dibayar — total akan ikut berubah otomatis.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Pembayaran hutang tidak masuk total pengeluaran &amp; laba (bukan biaya operasional) — hanya
          mengurangi sisa hutang. Jumlah bayar tidak boleh melebihi sisa hutang.
        </p>
      </Card>

      <Card>
        <div className="flex flex-wrap gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-xl border px-3 py-2 text-sm">
            <option value="all">Semua jenis</option>
            <option value="income">Income</option>
            <option value="expense">Pengeluaran</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border px-3 py-2 text-sm">
            <option value="all">Semua status</option>
            <option value="sudah_dibayar">Sudah dibayar</option>
            <option value="belum_reimburse">Belum reimburse</option>
          </select>
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="rounded-xl border px-3 py-2 text-sm">
            <option value="all">Semua channel</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <ul className="mt-4 divide-y">
          {filtered.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="break-words font-medium">{t.description}</p>
                <p className="text-xs text-slate-500">
                  {formatDateID(t.txn_date)} · {t.brands?.name} · {t.channels?.name ?? "—"} · {t.category ?? "—"} ·{" "}
                  {t.payment_method ?? "—"}
                  {t.ref ? ` · ${t.ref}` : ""}
                  {t.liability_id ? ` · Bayar hutang: ${t.liabilities?.creditor ?? ""} — tidak masuk total pengeluaran` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`shrink-0 whitespace-nowrap font-bold ${t.kind === "income" ? "text-emerald-600" : "text-rose-600"}`}>
                  {t.kind === "income" ? "+" : "−"}{formatIDR(t.amount)}
                </span>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${t.payment_status === "belum_reimburse" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                  {t.payment_status === "belum_reimburse" ? "Belum reimburse" : "Sudah dibayar"}
                </span>
                {editable && t.kind === "expense" && (
                  <button onClick={() => flip(t)} className="rounded-full bg-vektora-500 px-3 py-1 text-xs font-semibold text-white">
                    {t.payment_status === "belum_reimburse" ? "Reimburse" : "Batalkan reimburse"}
                  </button>
                )}
              </div>
            </li>
          ))}
          {filtered.length === 0 && <li className="py-4 text-sm text-slate-500">Tidak ada transaksi yang cocok.</li>}
        </ul>
      </Card>
    </div>
  );
}
