"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { summarize } from "@/lib/types";
import type { Brand, Channel, TransactionRow } from "@/lib/types";
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
  });

  async function load() {
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    const { data } = await sb
      .from("transactions")
      .select("*, brands(name), channels(name)")
      .order("txn_date", { ascending: false })
      .limit(500);
    if (data) setRows(data as TransactionRow[]);
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

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!editable) return;
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from("transactions").insert({
      ...form,
      amount: Number(form.amount),
      channel_id: form.channel_id || null,
      reimbursed_at: null,
    });
    if (error) setMsg("Gagal simpan: " + error.message);
    else {
      setMsg("Tersimpan.");
      setForm((f) => ({ ...f, description: "", amount: "", ref: "", notes: "" }));
      load();
    }
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
        {editable ? (<form onSubmit={add} className="mt-3 grid gap-3 md:grid-cols-3">
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
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "income" | "expense" })} className="rounded-xl border px-3 py-2">
            <option value="income">Income</option>
            <option value="expense">Pengeluaran</option>
          </select>
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
              <div>
                <p className="font-medium">{t.description}</p>
                <p className="text-xs text-slate-500">
                  {formatDateID(t.txn_date)} · {t.brands?.name} · {t.channels?.name ?? "—"} · {t.category ?? "—"} ·{" "}
                  {t.payment_method ?? "—"}
                  {t.ref ? ` · ${t.ref}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`font-bold ${t.kind === "income" ? "text-emerald-600" : "text-rose-600"}`}>
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
