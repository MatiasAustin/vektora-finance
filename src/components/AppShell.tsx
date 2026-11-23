"use client";

import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { useAuth } from "@/lib/auth";

/** Shell: /login tampil tanpa sidebar/header; halaman lain pakai layout Finora. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading, configured, signOut } = useAuth();

  if (pathname === "/login") return <>{children}</>;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="bg-gradient-to-r from-vektora-500 via-vektora-600 to-vektora-900 px-6 pt-6 pb-16 text-white md:px-10">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-200">
                PT Vektora Teknologi Nusantara
              </p>
              <h1 className="mt-1 text-2xl font-bold">Vektora Finance</h1>
              <p className="text-sm text-blue-100">
                Satu manajemen, banyak brand — WhereIsIt, Moonimo, dan brand berikutnya.
              </p>
            </div>
            {configured && !loading && user && (
              <div className="rounded-2xl bg-white/15 px-4 py-2 text-right text-sm">
                <p className="font-semibold">{profile?.full_name ?? user.email}</p>
                <p className="text-xs text-blue-100">
                  {profile ? `${profile.role} · ${profile.active ? "Aktif" : "Nonaktif"}` : "Profil belum dibuat — hubungi admin"}
                </p>
                <button
                  onClick={async () => {
                    await signOut();
                    router.push("/login");
                  }}
                  className="mt-1 text-xs font-semibold text-white underline"
                >
                  Keluar
                </button>
              </div>
            )}
            {configured && !loading && !user && (
              <a href="/login" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-vektora-700">
                Masuk
              </a>
            )}
          </div>
        </div>
        <div className="mx-auto -mt-10 max-w-6xl px-4 pb-16 md:px-6">{children}</div>
      </main>
    </div>
  );
}
