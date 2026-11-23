// Peran & akses — PT Vektora Teknologi Nusantara.
// Aturan (Mattin, 19 Nov 2026):
//   admin       : akses penuh, kelola tim, settings, fee-split config
//   management  : akses operasional penuh, TIDAK bisa ubah fee-split config
//                 atau kelola user admin
//   komisaris   : READ-ONLY dashboard + laporan + pembagian fee (bagiannya)
//   investor    : READ-ONLY portfolio: modal, aset, hutang, laba/rugi, dividen.
//                 TIDAK boleh lihat detail gaji / slip gaji per karyawan
//                 (hanya total). Tidak bisa edit apa pun.
//   karyawan    : hanya profil sendiri + slip gaji sendiri. Tidak boleh lihat
//                 total perusahaan, karyawan lain, transaksi, fee split,
//                 atau data investor.
import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

export type Role = "admin" | "management" | "komisaris" | "investor" | "karyawan";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin (Dirut)",
  management: "Management",
  komisaris: "Komisaris",
  investor: "Investor",
  karyawan: "Karyawan",
};

export const ALL_ROLES: Role[] = ["admin", "management", "komisaris", "investor", "karyawan"];

export interface AuthState {
  user: User | null;
  profile: Profile | null;
  role: Role | null;
  loading: boolean;
  configured: boolean;
}

/** Boleh tulis (tambah/edit/hapus) data operasional? */
export function canEdit(role: Role | null): boolean {
  return role === "admin" || role === "management";
}

/** Boleh ubah konfigurasi fee split? Hanya admin. */
export function canEditFeeSplit(role: Role | null): boolean {
  return role === "admin";
}

/** Boleh kelola tim / user? Hanya admin (management hanya lihat daftar). */
export function canManageTeam(role: Role | null): boolean {
  return role === "admin";
}

/** Boleh lihat halaman operasional (transaksi/aset/hutang/karyawan)? */
export function canViewOperations(role: Role | null): boolean {
  return role === "admin" || role === "management" || role === "komisaris" || role === "investor";
}

/** Boleh lihat detail gaji per karyawan? Admin + management saja. */
export function canViewSalaries(role: Role | null): boolean {
  return role === "admin" || role === "management";
}

/** Boleh lihat slip gaji (milik sendiri untuk karyawan; semua untuk admin/management)? */
export function canViewPayslips(role: Role | null): boolean {
  return role === "admin" || role === "management" || role === "karyawan";
}

export function useAuth(): AuthState & { signOut: () => Promise<void>; refresh: () => Promise<void> } {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (u: User | null) => {
    if (!u) {
      setProfile(null);
      return;
    }
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb.from("profiles").select("*").eq("id", u.id).maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, []);

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    const { data } = await sb.auth.getSession();
    const u = data.session?.user ?? null;
    setUser(u);
    await loadProfile(u);
    setLoading(false);
  }, [loadProfile]);

  useEffect(() => {
    refresh();
    const sb = getSupabase();
    if (!sb) return;
    const { data: sub } = sb.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      await loadProfile(u);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh, loadProfile]);

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  return {
    user,
    profile,
    role: (profile?.role as Role | null) ?? null,
    loading,
    configured: isSupabaseConfigured,
    signOut,
    refresh,
  };
}
