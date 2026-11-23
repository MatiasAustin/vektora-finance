"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar, { NavLinks } from "@/components/Sidebar";
import { useAuth } from "@/lib/auth";

/** Shell: /login tampil tanpa sidebar/header; halaman lain pakai layout Finora. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading, configured, signOut } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Tutup menu mobile setiap pindah halaman.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  if (pathname === "/login") return <>{children}</>;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1">
        {/* Bar atas mobile: hamburger + logo + keluar. Di desktop disembunyikan
            karena navigasi sudah ada di sidebar. */}
        <div className="sticky top-0 z-40 flex items-center justify-between gap-2 bg-vektora-950 px-4 py-3 text-white md:hidden">
          <button
            onClick={() => setMobileNavOpen((o) => !o)}
            aria-label={mobileNavOpen ? "Tutup menu" : "Buka menu"}
            className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold"
          >
            {mobileNavOpen ? "✕ Tutup" : "☰ Menu"}
          </button>
          <span className="min-w-0 truncate text-base font-black tracking-tight">
            Vektora<span className="text-blue-400">.</span> Finance
          </span>
          {configured && !loading && user ? (
            <button
              onClick={async () => {
                await signOut();
                router.push("/login");
              }}
              className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold"
            >
              Keluar
            </button>
          ) : (
            <a href="/login" className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-vektora-700">
              Masuk
            </a>
          )}
        </div>
        {mobileNavOpen && (
          <nav className="space-y-1 bg-vektora-950 px-4 pb-4 pt-1 text-white md:hidden">
            <NavLinks />
            <p className="px-3 pt-3 text-xs leading-relaxed text-blue-200">
              Belum reimburse dicatat tapi tidak masuk total. Flip ke Sudah dibayar saat direimburse.
            </p>
          </nav>
        )}

        <div className="bg-gradient-to-r from-vektora-500 via-vektora-600 to-vektora-900 px-4 pb-16 pt-5 text-white sm:px-6 md:px-10 md:pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-200">
                PT Vektora Teknologi Nusantara
              </p>
              <h1 className="mt-1 text-xl font-bold sm:text-2xl">Vektora Finance</h1>
              <p className="text-sm text-blue-100">
                Satu manajemen, banyak brand — WhereIsIt, Moonimo, dan brand berikutnya.
              </p>
            </div>
            {configured && !loading && user && (
              <div className="w-full rounded-2xl bg-white/15 px-4 py-2 text-left text-sm sm:w-auto sm:text-right">
                <p className="break-words font-semibold">{profile?.full_name ?? user.email}</p>
                <p className="text-xs text-blue-100">
                  {profile ? `${profile.role} · ${profile.active ? "Aktif" : "Nonaktif"}` : "Profil belum dibuat — hubungi admin"}
                </p>
                <button
                  onClick={async () => {
                    await signOut();
                    router.push("/login");
                  }}
                  className="mt-1 hidden text-xs font-semibold text-white underline md:inline"
                >
                  Keluar
                </button>
              </div>
            )}
            {configured && !loading && !user && (
              <a href="/login" className="hidden rounded-full bg-white px-4 py-2 text-sm font-semibold text-vektora-700 md:inline-block">
                Masuk
              </a>
            )}
          </div>
        </div>
        <div className="mx-auto -mt-10 max-w-6xl px-3 pb-16 sm:px-4 md:px-6">{children}</div>
      </main>
    </div>
  );
}
