import { formatIDR } from "@/lib/format";
import type { Brand } from "@/lib/types";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`finora-surface min-w-0 rounded-3xl p-4 text-slate-100 sm:p-5 ${className}`}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "positive" | "negative" | "warning";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "negative"
      ? "text-rose-300"
      : tone === "warning"
      ? "text-amber-300"
      : "text-white";
  return (
    <Card className="relative overflow-hidden p-3.5 sm:p-4">
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-blue-500/10 blur-xl" />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-200/70">{label}</p>
      <p className={`mt-1.5 break-words text-base font-bold tracking-tight sm:text-lg ${toneClass}`}>{value}</p>
      {sub ? <p className="mt-1 text-[11px] text-slate-400">{sub}</p> : null}
    </Card>
  );
}

export function EmptySupabase() {
  return (
    <Card className="border-dashed border-blue-400/40 bg-blue-950/40">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-300 ring-1 ring-white/15">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M3 5V19A9 3 0 0 0 21 19V5" />
            <path d="M3 12A9 3 0 0 0 21 12" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-white">Hubungkan Supabase dulu</h2>
          <p className="mt-1 text-xs leading-relaxed text-blue-100/80">
            App ini belum terhubung ke database. Buat project di Supabase, jalankan{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-blue-200">supabase/schema.sql</code> lalu{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-blue-200">supabase/seed.sql</code> di SQL
            Editor, lalu isi <code className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-blue-200">.env.local</code>{" "}
            dari <code className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-blue-200">.env.example</code> dan
            deploy ulang di Vercel. Begitu Supabase terhubung, angka keuangan WhereIsIt &amp; Moonimo akan langsung
            tampil.
          </p>
        </div>
      </div>
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
    <label className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] backdrop-blur-md">
      <span className="font-semibold uppercase tracking-wider text-blue-200/80">Brand</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border-0 bg-transparent py-0 pr-1 text-xs font-semibold text-white focus:ring-0"
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
    <Card className="border-blue-400/25 bg-blue-950/40">
      <p className="text-xs text-blue-100/90">
        <b className="text-white">Mode Lihat Info &amp; Arus Kas (Read-Only).</b> Akun kamu{role ? ` (${role})` : ""} hanya memiliki akses melihat informasi &amp; laporan arus kas. Hanya <b>Admin (Dirut)</b> atau <b>Accountant (Management yang ditunjuk)</b> yang dapat menambah/mengedit transaksi atau merilis slip gaji.
      </p>
    </Card>
  );
}

export function AccessDenied({ text }: { text?: string }) {
  return (
    <Card className="border-rose-400/30 bg-rose-950/40">
      <h2 className="text-sm font-bold text-rose-200">Akses ditolak</h2>
      <p className="mt-1.5 text-xs text-rose-100/80">
        {text ?? "Peran kamu tidak boleh membuka halaman ini. Hubungi admin (Matias) bila kamu merasa ini salah."}
      </p>
    </Card>
  );
}

