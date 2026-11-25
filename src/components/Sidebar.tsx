"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth, type Role } from "@/lib/auth";

export interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
  roles: Role[];
  icon: "home" | "transfer" | "history" | "assets" | "debt" | "employees" | "payslips" | "fees" | "team" | "card" | "settings";
}

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", shortLabel: "Home", icon: "home", roles: ["admin", "management", "komisaris", "investor", "karyawan"] },
  { href: "/brands", label: "Brand & Kartu", shortLabel: "Card", icon: "card", roles: ["admin", "management", "komisaris", "investor"] },
  { href: "/transactions", label: "Transaksi", shortLabel: "Transfer", icon: "transfer", roles: ["admin", "management", "komisaris", "investor"] },
  { href: "/assets", label: "Aset & Investasi", shortLabel: "Aset", icon: "assets", roles: ["admin", "management", "komisaris", "investor"] },
  { href: "/liabilities", label: "Hutang & Cicilan", shortLabel: "Hutang", icon: "debt", roles: ["admin", "management", "komisaris", "investor"] },
  { href: "/fee-split", label: "Pembagian Fee", shortLabel: "Fee Split", icon: "fees", roles: ["admin", "management", "komisaris", "investor"] },
  { href: "/employees", label: "Karyawan & Gaji", shortLabel: "Karyawan", icon: "employees", roles: ["admin", "management"] },
  { href: "/payslips", label: "Slip Gaji", shortLabel: "Slip Gaji", icon: "payslips", roles: ["admin", "management", "karyawan"] },
  { href: "/history", label: "Riwayat Audit", shortLabel: "Riwayat", icon: "history", roles: ["admin", "management"] },
  { href: "/team", label: "Tim & Pengguna", shortLabel: "Account", icon: "team", roles: ["admin", "management"] },
  { href: "/settings", label: "Pengaturan", shortLabel: "Settings", icon: "settings", roles: ["admin", "management"] },
];

export function NavIcon({ name, className = "h-5 w-5" }: { name: NavItem["icon"] | "more" | "account"; className?: string }) {
  switch (name) {
    case "home":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
      );
    case "card":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2.5" y="5" width="19" height="14" rx="3" />
          <path d="M2.5 10h19" />
          <path d="M6.5 15h4" />
        </svg>
      );
    case "transfer":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 4l4 4-4 4" />
          <path d="M3 8h18" />
          <path d="M7 20l-4-4 4-4" />
          <path d="M21 16H3" />
        </svg>
      );
    case "assets":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5Z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      );
    case "debt":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      );
    case "fees":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
          <path d="M22 12A10 10 0 0 0 12 2v10z" />
        </svg>
      );
    case "employees":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "payslips":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8" />
          <path d="M8 17h5" />
        </svg>
      );
    case "history":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M12 7v5l4 2" />
        </svg>
      );
    case "team":
    case "account":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    case "settings":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      );
    case "more":
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="6" height="6" rx="1.5" />
          <rect x="14" y="4" width="6" height="6" rx="1.5" />
          <rect x="4" y="14" width="6" height="6" rx="1.5" />
          <rect x="14" y="14" width="6" height="6" rx="1.5" />
        </svg>
      );
  }
}

/** Daftar menu yang terlihat untuk peran saat ini (dipakai sidebar desktop + nav mobile). */
export function useVisibleNav() {
  const { role, loading } = useAuth();
  return NAV.filter((item) => !role || loading || item.roles.includes(role));
}

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const visible = useVisibleNav();
  return (
    <>
      {visible.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-2.5 rounded-2xl px-3 py-2 text-xs font-medium transition-all ${
              active
                ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-600/30 ring-1 ring-white/20"
                : "text-blue-100/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            <NavIcon name={item.icon} className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}

export default function Sidebar() {
  const { role } = useAuth();
  return (
    <aside className="hidden w-60 shrink-0 border-r border-white/10 bg-[#050a18]/90 p-4 text-white backdrop-blur-xl md:flex md:flex-col">
      <div className="flex items-center gap-2.5 px-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-400 to-blue-700 text-xs font-black text-white shadow-lg shadow-blue-600/30 ring-1 ring-white/25">
          V
        </div>
        <div>
          <div className="text-base font-black tracking-tight text-white">
            Vektora<span className="text-blue-400">.</span>
          </div>
          <p className="text-[10px] font-medium text-blue-200/70">Finora Edition · PT Vektora</p>
        </div>
      </div>

      <nav className="mt-6 flex-1 space-y-1">
        <NavLinks />
      </nav>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-3 text-[11px] leading-relaxed text-blue-100/80">
        <p className="font-semibold text-white">Aturan Akuntansi</p>
        <p className="mt-1">
          Pengeluaran <b className="text-amber-300">Belum reimburse</b> &amp; <b className="text-blue-200">Cicilan hutang</b> tercatat rapi tapi tidak mengurangi laba operasional.
        </p>
        {role === "komisaris" || role === "investor" ? (
          <p className="mt-2 font-semibold text-blue-200">Mode baca saja ({role}).</p>
        ) : null}
        {role === "karyawan" ? (
          <p className="mt-2 font-semibold text-blue-200">Akses khusus slip gaji pribadi.</p>
        ) : null}
      </div>
    </aside>
  );
}

