"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Sidebar, { NavIcon, useVisibleNav } from "@/components/Sidebar";
import { ROLE_LABELS, useAuth } from "@/lib/auth";

/** Shell Finora: /login tampil tanpa sidebar/header; halaman lain memakai header Finora + Bottom Nav mobile. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, role, loading, configured, signOut } = useAuth();
  const visibleNav = useVisibleNav();
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  if (pathname === "/login") return <>{children}</>;

  const displayName = profile?.full_name ?? (user?.email ? user.email.split("@")[0] : "Tim Vektora");
  const firstName = displayName.split(" ")[0];
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-screen text-slate-100">
      <Sidebar />
      <main className="min-w-0 flex-1 pb-24 md:pb-12">
        {/* Header Finora: Avatar + "Hello, <Nama>!" di kiri, tombol notifikasi / profil kaca bulat di kanan */}
        <header className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 md:px-8 md:pt-7">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3.5">
              <button
                onClick={() => setAccountOpen((o) => !o)}
                className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-300 via-blue-500 to-indigo-800 text-sm font-black text-white shadow-lg shadow-blue-950/60 ring-2 ring-white/30 transition hover:scale-105"
                title="Profil & Akun"
              >
                {initials || "VF"}
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-[#0b1942]" />
              </button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="truncate text-lg font-bold tracking-tight text-white sm:text-xl">
                    Hello {firstName}!
                  </h1>
                  {role && (
                    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold leading-none text-blue-100 backdrop-blur-md">
                      {ROLE_LABELS[role]}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-blue-100/75">
                  PT Vektora Teknologi Nusantara · WhereIsIt &amp; Moonimo
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {configured && !loading && user ? (
                <>
                  {role !== "karyawan" && (
                    <Link
                      href="/history"
                      title="Riwayat Perubahan & Audit"
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20"
                    >
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>
                    </Link>
                  )}
                  <button
                    onClick={() => setAccountOpen((o) => !o)}
                    className="hidden items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-white/20 sm:inline-flex"
                  >
                    <span>{displayName}</span>
                    <svg className="h-3.5 w-3.5 text-blue-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                </>
              ) : configured && !loading && !user ? (
                <Link
                  href="/login"
                  className="rounded-full bg-white px-4 py-2 text-xs font-bold text-vektora-700 shadow-md transition hover:bg-blue-50"
                >
                  Masuk
                </Link>
              ) : null}
            </div>
          </div>

          {/* Drawer info akun saat avatar / nama diklik */}
          {accountOpen && (
            <div className="finora-surface mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3.5 text-xs">
              <div>
                <p className="font-bold text-white">{profile?.full_name ?? user?.email ?? "Mode Pratinjau"}</p>
                <p className="text-blue-200/75">
                  {profile
                    ? `${ROLE_LABELS[profile.role]} · Status: ${profile.active ? "Aktif" : "Nonaktif"}`
                    : user
                    ? "Profil belum dibuat di tabel profiles — hubungi Admin"
                    : "Database Supabase belum dikonfigurasi"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {(role === "admin" || role === "management") && (
                  <Link
                    href="/team"
                    className="rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 font-semibold text-white hover:bg-white/20"
                  >
                    Kelola Tim
                  </Link>
                )}
                {user && (
                  <button
                    onClick={async () => {
                      await signOut();
                      router.push("/login");
                    }}
                    className="rounded-xl bg-rose-500/20 px-3 py-1.5 font-semibold text-rose-200 ring-1 ring-rose-400/30 hover:bg-rose-500/30"
                  >
                    Keluar Akun
                  </button>
                )}
              </div>
            </div>
          )}
        </header>

        {/* Konten halaman */}
        <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 md:px-8">{children}</div>

        {/* Drawer "More" untuk Mobile Bottom Nav */}
        {moreOpen && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/65 backdrop-blur-sm md:hidden" onClick={() => setMoreOpen(false)}>
            <div
              className="finora-surface max-h-[82vh] overflow-y-auto rounded-t-3xl border-t border-white/15 p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white">Semua Menu Vektora</h3>
                  <p className="text-xs text-blue-200/70">Akses cepat seluruh modul keuangan</p>
                </div>
                <button
                  onClick={() => setMoreOpen(false)}
                  className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white"
                >
                  ✕ Tutup
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {visibleNav.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={`flex flex-col items-center justify-center gap-2 rounded-2xl border p-3 text-center transition ${
                        active
                          ? "border-blue-400/40 bg-blue-600/30 text-white"
                          : "border-white/10 bg-white/5 text-blue-100/80 hover:bg-white/10"
                      }`}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-blue-300">
                        <NavIcon name={item.icon} className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-semibold leading-tight">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
              {configured && !loading && user && (
                <button
                  onClick={async () => {
                    await signOut();
                    router.push("/login");
                  }}
                  className="mt-4 w-full rounded-2xl border border-rose-400/30 bg-rose-500/20 py-2.5 text-xs font-bold text-rose-200"
                >
                  Keluar dari Akun ({displayName})
                </button>
              )}
            </div>
          </div>
        )}

        {/* Finora Bottom Navigation Bar (5 tab di mobile, persis referensi Finora: Home, Card, Transfer, More, Account) */}
        <nav
          aria-label="Navigasi bawah"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#070e22]/95 px-2 py-2 backdrop-blur-xl md:hidden"
        >
          <div className="mx-auto grid max-w-md grid-cols-5 items-center">
            <Link
              href="/"
              className={`flex flex-col items-center gap-1 py-1 text-[11px] font-medium transition ${
                pathname === "/" ? "text-blue-400" : "text-slate-400 hover:text-white"
              }`}
            >
              <NavIcon name="home" className="h-5 w-5" />
              <span>Home</span>
            </Link>

            <Link
              href={role === "karyawan" ? "/payslips" : "/brands"}
              className={`flex flex-col items-center gap-1 py-1 text-[11px] font-medium transition ${
                pathname === "/brands" || (role === "karyawan" && pathname === "/payslips")
                  ? "text-blue-400"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <NavIcon name="card" className="h-5 w-5" />
              <span>{role === "karyawan" ? "Slip" : "Card"}</span>
            </Link>

            <Link
              href={role === "karyawan" ? "/payslips" : "/transactions"}
              className={`flex flex-col items-center gap-1 py-1 text-[11px] font-medium transition ${
                pathname === "/transactions" ? "text-blue-400" : "text-slate-400 hover:text-white"
              }`}
            >
              <NavIcon name="transfer" className="h-5 w-5" />
              <span>Transfer</span>
            </Link>

            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              className={`flex flex-col items-center gap-1 py-1 text-[11px] font-medium transition ${
                moreOpen ? "text-blue-400" : "text-slate-400 hover:text-white"
              }`}
            >
              <NavIcon name="more" className="h-5 w-5" />
              <span>More</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (role === "admin" || role === "management") {
                  router.push("/team");
                } else {
                  setAccountOpen((o) => !o);
                }
              }}
              className={`flex flex-col items-center gap-1 py-1 text-[11px] font-medium transition ${
                pathname === "/team" || accountOpen ? "text-blue-400" : "text-slate-400 hover:text-white"
              }`}
            >
              <NavIcon name="account" className="h-5 w-5" />
              <span>Account</span>
            </button>
          </div>
        </nav>
      </main>
    </div>
  );
}

