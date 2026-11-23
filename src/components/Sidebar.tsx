"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth, type Role } from "@/lib/auth";

interface NavItem {
  href: string;
  label: string;
  roles: Role[];
}

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", roles: ["admin", "management", "komisaris", "investor", "karyawan"] },
  { href: "/transactions", label: "Transaksi", roles: ["admin", "management", "komisaris", "investor"] },
  { href: "/assets", label: "Aset & Investasi", roles: ["admin", "management", "komisaris", "investor"] },
  { href: "/liabilities", label: "Hutang", roles: ["admin", "management", "komisaris", "investor"] },
  { href: "/employees", label: "Karyawan & Gaji", roles: ["admin", "management"] },
  { href: "/payslips", label: "Slip Gaji", roles: ["admin", "management", "karyawan"] },
  { href: "/fee-split", label: "Pembagian Fee", roles: ["admin", "management", "komisaris", "investor"] },
  { href: "/team", label: "Tim & Pengguna", roles: ["admin", "management"] },
  { href: "/brands", label: "Brand", roles: ["admin", "management"] },
  { href: "/settings", label: "Pengaturan", roles: ["admin", "management"] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { role, loading } = useAuth();
  // Tanpa Supabase / belum login: tampilkan semua menu (middleware akan
  // mengarahkan ke /login); setelah login, menu difilter sesuai peran.
  const visible = NAV.filter((item) => !role || loading || item.roles.includes(role));
  return (
    <aside className="hidden w-60 shrink-0 bg-vektora-950 p-5 text-white md:block">
      <div className="text-2xl font-black tracking-tight">
        Vektora<span className="text-blue-400">.</span>
      </div>
      <p className="mt-1 text-xs text-blue-300">Finance · PT Vektora</p>
      <nav className="mt-8 space-y-1">
        {visible.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-xl px-3 py-2 text-sm font-medium ${
                active ? "bg-vektora-500 text-white" : "text-blue-200 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-10 rounded-2xl bg-white/10 p-4 text-xs leading-relaxed text-blue-100">
        <p className="font-semibold text-white">Aturan penting</p>
        <p className="mt-1">
          Belum reimburse dicatat tapi tidak masuk total. Flip ke Sudah dibayar saat direimburse.
        </p>
        {role === "komisaris" || role === "investor" ? (
          <p className="mt-2 font-semibold text-white">Mode baca saja — peran {role} tidak bisa mengubah data.</p>
        ) : null}
        {role === "karyawan" ? (
          <p className="mt-2 font-semibold text-white">Kamu hanya bisa melihat slip gajimu sendiri.</p>
        ) : null}
      </div>
    </aside>
  );
}
