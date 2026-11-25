"use client";

import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase";
import { AccessDenied, Card, EmptySupabase } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function SettingsPage() {
  const { role, loading: authLoading } = useAuth();

  if (!isSupabaseConfigured) return <EmptySupabase />;
  if (authLoading) return <p className="text-blue-200/70">Memuat pengaturan…</p>;
  if (role !== "admin" && role !== "management") return <AccessDenied />;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">Pengaturan Sistem &amp; Akuntansi</h2>
        <p className="text-xs text-blue-200/75">
          Konfigurasi aturan kategori transaksi, metode pembayaran, dan struktur modul PT Vektora Teknologi Nusantara.
        </p>
      </div>

      <Card>
        <h3 className="text-base font-bold text-white">Kategori &amp; Metode Pembayaran Transaksi</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
          Untuk menghindari input yang berulang/tumpang-tindih, form transaksi kini langsung menggunakan{" "}
          <b className="text-white">Kategori</b> (mis. Penjualan, Operasional, Bahan Baku, Logistik) dan{" "}
          <b className="text-white">Metode Pembayaran</b> (mis. Transfer, QRIS, Shopee, Tokopedia, Tunai) tanpa perlu
          memilih dropdown Channel terpisah.
        </p>
      </Card>

      <Card>
        <h3 className="text-base font-bold text-white">Pintasan Konfigurasi Modul</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            href="/brands"
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:bg-white/[0.08]"
          >
            <p className="font-bold text-white">Kelola Brand &amp; Unit</p>
            <p className="mt-1 text-xs text-slate-400">Tambah atau nonaktifkan brand (WhereIsIt, Moonimo, dst).</p>
          </Link>
          <Link
            href="/fee-split"
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:bg-white/[0.08]"
          >
            <p className="font-bold text-white">Rasio Pembagian Fee</p>
            <p className="mt-1 text-xs text-slate-400">Atur persentase Dividen, Management Fee, dan Laba Ditahan.</p>
          </Link>
          <Link
            href="/team"
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:bg-white/[0.08]"
          >
            <p className="font-bold text-white">Tim &amp; Hak Akses</p>
            <p className="mt-1 text-xs text-slate-400">Kelola akun login, peran, dan hak akses per brand.</p>
          </Link>
        </div>
      </Card>
    </div>
  );
}


