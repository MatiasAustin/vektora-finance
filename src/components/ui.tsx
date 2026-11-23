import { formatIDR } from "@/lib/format";
import type { Brand } from "@/lib/types";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100 sm:p-5 ${className}`}>{children}</div>
  );
}

export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 break-words text-xl font-bold text-slate-900 sm:text-2xl">{value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
    </Card>
  );
}

export function EmptySupabase() {
  return (
    <Card className="border-2 border-dashed border-vektora-500/40 bg-blue-50">
      <h2 className="text-lg font-bold">Hubungkan Supabase dulu</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        App ini belum terhubung ke database. Buat project di Supabase, jalankan{" "}
        <code>supabase/schema.sql</code> lalu <code>supabase/seed.sql</code> di SQL Editor, lalu isi{" "}
        <code>.env.local</code> dari <code>.env.example</code> dan deploy ulang di Vercel. Tidak ada data
        palsu yang ditampilkan di sini — begitu Supabase terhubung, angka November 2026 WhereIsIt akan
        muncul dari seed.
      </p>
    </Card>
  );
}

export function BrandSelect({
  brands,
  value,
  onChange,
}: {
  brands: Brand[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="font-medium text-slate-600">Brand</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium"
      >
        <option value="all">Semua brand</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Money({ n, className = "" }: { n: number; className?: string }) {
  return <span className={className}>{formatIDR(n)}</span>;
}

export function ReadOnlyNotice({ role }: { role?: string | null }) {
  return (
    <Card className="border-blue-200 bg-blue-50">
      <p className="text-sm text-slate-700">
        <b>Mode baca saja.</b> Peran kamu{role ? ` (${role})` : ""} hanya boleh melihat data — tombol
        tambah / ubah / hapus disembunyikan. Minta admin bila ada yang perlu diubah.
      </p>
    </Card>
  );
}

export function AccessDenied({ text }: { text?: string }) {
  return (
    <Card className="border-rose-200 bg-rose-50">
      <h2 className="text-lg font-bold">Akses ditolak</h2>
      <p className="mt-2 text-sm text-slate-600">
        {text ?? "Peran kamu tidak boleh membuka halaman ini. Hubungi admin (Matias) bila kamu merasa ini salah."}
      </p>
    </Card>
  );
}
