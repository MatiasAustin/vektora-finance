"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { AuditLogRow } from "@/lib/types";
import { formatDateID, formatIDR } from "@/lib/format";
import { AccessDenied, Card, EmptySupabase } from "@/components/ui";
import { canEdit, useAuth } from "@/lib/auth";
import { useBrandsChannels } from "@/lib/useData";

const PAGE_SIZE = 100;

// Label field untuk tampilan diff (old → new) di riwayat.
const FIELD_LABELS: Record<string, string> = {
  brand_id: "Brand",
  channel_id: "Channel",
  kind: "Jenis",
  txn_date: "Tanggal",
  description: "Keterangan",
  category: "Kategori",
  amount: "Jumlah",
  payment_method: "Metode",
  ref: "Ref / invoice",
  notes: "Catatan",
  payment_status: "Status Bayar",
  liability_id: "Bayar hutang",
};

function formatWIB(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export default function HistoryPage() {
  const { role, loading: authLoading } = useAuth();
  const { brands, channels } = useBrandsChannels();
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [creditors, setCreditors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [actionFilter, setActionFilter] = useState<"all" | "edit" | "delete">("all");
  const [search, setSearch] = useState("");

  const brandName = (id: unknown) =>
    typeof id === "string" ? brands.find((b) => b.id === id)?.name ?? "—" : "—";
  const channelName = (id: unknown) =>
    typeof id === "string" ? channels.find((c) => c.id === id)?.name ?? "—" : "—";

  function formatValue(key: string, v: unknown): string {
    if (v === null || v === undefined || v === "") return "—";
    switch (key) {
      case "brand_id":
        return brandName(v);
      case "channel_id":
        return channelName(v);
      case "kind":
        return v === "income" ? "Income" : "Pengeluaran";
      case "txn_date":
        return formatDateID(String(v));
      case "amount":
        return formatIDR(Number(v));
      case "payment_status":
        return v === "belum_reimburse" ? "Belum reimburse" : "Sudah dibayar";
      case "liability_id":
        return typeof v === "string" ? `Ya (${creditors[v] ?? "hutang"})` : "—";
      default:
        return String(v);
    }
  }

  // Field yang berubah saja (edit); untuk hapus tampilkan isi baris lama.
  function diffLines(a: AuditLogRow): string[] {
    const oldV = a.old_values ?? {};
    const newV = a.new_values ?? {};
    const keys = Array.from(new Set([...Object.keys(oldV), ...Object.keys(newV)]));
    const out: string[] = [];
    for (const k of keys) {
      if (k === "updated_at") continue;
      const o = oldV[k];
      const n = newV[k];
      if (JSON.stringify(o) === JSON.stringify(n)) continue;
      out.push(`${FIELD_LABELS[k] ?? k}: ${formatValue(k, o)} → ${formatValue(k, n)}`);
    }
    return out;
  }

  async function loadPage(from: number) {
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    const { data } = await sb
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    const list = (data ?? []) as AuditLogRow[];
    setRows((prev) => (from === 0 ? list : [...prev, ...list]));
    setHasMore(list.length === PAGE_SIZE);
    setLoading(false);
  }

  useEffect(() => {
    loadPage(0);
    const sb = getSupabase();
    if (sb) {
      sb.from("liabilities")
        .select("id, creditor")
        .then(({ data }) => {
          const map: Record<string, string> = {};
          ((data ?? []) as { id: string; creditor: string }[]).forEach((l) => {
            map[l.id] = l.creditor;
          });
          setCreditors(map);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (actionFilter !== "all" && r.action !== actionFilter) return false;
      if (!q) return true;
      return [r.actor_name ?? "", r.actor_email ?? "", r.record_label ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, actionFilter, search]);

  if (!isSupabaseConfigured) return <EmptySupabase />;
  if (loading || authLoading) return <p className="text-slate-500">Memuat…</p>;
  if (!canEdit(role))
    return (
      <AccessDenied text="Halaman Riwayat hanya bisa diakses admin dan management. Komisaris, investor, dan karyawan tidak bisa melihat siapa yang mengubah data." />
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Riwayat Perubahan</h2>
        <p className="text-sm text-slate-500">Siapa mengubah / menghapus transaksi, dan apa yang berubah.</p>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as "all" | "edit" | "delete")}
            className="rounded-xl border px-3 py-2 text-sm"
          >
            <option value="all">Semua aksi</option>
            <option value="edit">Ubah</option>
            <option value="delete">Hapus</option>
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama orang / keterangan…"
            className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm"
          />
        </div>
        <ul className="mt-4 divide-y">
          {filtered.map((a) => {
            const lines = a.action === "edit" ? diffLines(a) : [];
            const oldV = a.old_values ?? {};
            return (
              <li key={a.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      a.action === "delete" ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {a.action === "delete" ? "Hapus" : "Ubah"}
                  </span>
                  <b className="break-words">{a.record_label ?? "—"}</b>
                  <span className="ml-auto shrink-0 text-xs text-slate-500">{formatWIB(a.created_at)} WIB</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {a.actor_name ?? "—"}
                  {a.actor_email ? ` · ${a.actor_email}` : ""}
                </p>
                {a.action === "edit" ? (
                  lines.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
                      {lines.map((l) => (
                        <li key={l} className="break-words">
                          {l}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">Tidak ada field yang berubah.</p>
                  )
                ) : (
                  <p className="mt-1 break-words text-xs text-slate-700">
                    Dihapus: {String(oldV.description ?? a.record_label ?? "—")} ·{" "}
                    {oldV.kind === "income" ? "+" : "−"}
                    {formatIDR(Number(oldV.amount ?? 0))} ·{" "}
                    {oldV.txn_date ? formatDateID(String(oldV.txn_date)) : "—"}
                    {oldV.brand_id ? ` · ${brandName(oldV.brand_id)}` : ""}
                  </p>
                )}
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="py-4 text-sm text-slate-500">
              {rows.length === 0
                ? "Belum ada perubahan tercatat. Edit/hapus transaksi akan muncul di sini."
                : "Tidak ada yang cocok dengan filter."}
            </li>
          )}
        </ul>
        {hasMore && (
          <button
            onClick={async () => {
              setLoadingMore(true);
              await loadPage(rows.length);
              setLoadingMore(false);
            }}
            disabled={loadingMore}
            className="mt-3 rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700"
          >
            {loadingMore ? "Memuat…" : "Muat lebih"}
          </button>
        )}
      </Card>
    </div>
  );
}
