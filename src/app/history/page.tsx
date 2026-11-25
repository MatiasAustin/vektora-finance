"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { AuditLogRow } from "@/lib/types";
import { formatDateID, formatIDR } from "@/lib/format";
import { AccessDenied, Card, EmptySupabase } from "@/components/ui";
import { canEdit, useAuth } from "@/lib/auth";
import { useBrandsChannels } from "@/lib/useData";

const PAGE_SIZE = 100;

const FIELD_LABELS: Record<string, string> = {
  brand_id: "Brand",
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
  const { brands } = useBrandsChannels();
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [creditors, setCreditors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [actionFilter, setActionFilter] = useState<"all" | "edit" | "delete">("all");
  const [search, setSearch] = useState("");

  const brandName = (id: unknown) =>
    typeof id === "string" ? brands.find((b) => b.id === id)?.name ?? "—" : "—";

  function formatValue(key: string, v: unknown): string {
    if (v === null || v === undefined || v === "") return "—";
    switch (key) {
      case "brand_id":
        return brandName(v);
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
  if (loading || authLoading) return <p className="text-blue-200/70">Memuat riwayat…</p>;
  if (!canEdit(role))
    return (
      <AccessDenied text="Halaman Riwayat hanya bisa diakses admin dan management. Komisaris, investor, dan karyawan tidak bisa melihat siapa yang mengubah data." />
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Riwayat Perubahan (Audit Log)</h2>
          <p className="text-xs text-blue-200/75">
            Catatan otomatis setiap kali transaksi diubah atau dihapus beserta pelaku dan rincian perubahannya.
          </p>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as "all" | "edit" | "delete")}
            className="rounded-xl border px-3 py-2 text-sm"
          >
            <option value="all">Semua aksi</option>
            <option value="edit">Ubah (Edit)</option>
            <option value="delete">Hapus (Delete)</option>
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama pengguna atau keterangan transaksi…"
            className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm"
          />
        </div>
        <ul className="mt-4 space-y-2.5">
          {filtered.map((a) => {
            const lines = a.action === "edit" ? diffLines(a) : [];
            const oldV = a.old_values ?? {};
            return (
              <li
                key={a.id}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      a.action === "delete"
                        ? "bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/30"
                        : "bg-blue-500/20 text-blue-200 ring-1 ring-blue-400/30"
                    }`}
                  >
                    {a.action === "delete" ? "Hapus" : "Ubah"}
                  </span>
                  <b className="break-words text-white">{a.record_label ?? "—"}</b>
                  <span className="ml-auto shrink-0 text-xs text-slate-400">{formatWIB(a.created_at)} WIB</span>
                </div>
                <p className="mt-1 text-xs text-blue-200/75">
                  Oleh: <b className="text-white">{a.actor_name ?? "—"}</b>
                  {a.actor_email ? ` (${a.actor_email})` : ""}
                </p>
                {a.action === "edit" ? (
                  lines.length > 0 ? (
                    <ul className="mt-2 space-y-1 rounded-xl bg-black/25 p-2.5 text-xs text-slate-200">
                      {lines.map((l) => (
                        <li key={l} className="break-words">
                          • {l}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">Tidak ada field yang berubah.</p>
                  )
                ) : (
                  <p className="mt-2 break-words rounded-xl bg-rose-950/30 p-2.5 text-xs text-rose-200">
                    Data yang dihapus: {String(oldV.description ?? a.record_label ?? "—")} ·{" "}
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
            <li className="rounded-2xl border border-white/5 bg-white/[0.02] py-8 text-center text-sm text-slate-400">
              {rows.length === 0
                ? "Belum ada perubahan tercatat. Edit/hapus transaksi akan muncul di sini."
                : "Tidak ada riwayat yang cocok dengan filter."}
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
            className="mt-4 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
          >
            {loadingMore ? "Memuat…" : "Muat lebih banyak"}
          </button>
        )}
      </Card>
    </div>
  );
}

