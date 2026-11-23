import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createBrowserClient,
  createServerClient as createSsrClient,
} from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

// Supabase sekarang pakai key baru: Publishable (= anon lama) dan Secret
// (= service_role lama). Terima nama env baru dulu, fallback ke nama lama.
export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

export const isSupabaseConfigured =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(supabasePublishableKey);

let client: SupabaseClient | null = null;

// PENTING: pakai createBrowserClient (@supabase/ssr), BUKAN createClient
// biasa. createClient menyimpan sesi di localStorage, sedangkan
// middleware (server) membaca sesi dari cookie — jadi login yang
// berhasil pun langsung mental balik ke /login. createBrowserClient
// menyimpan sesi di cookie, sehingga middleware bisa melihat user
// yang sudah login. (Bug ini yang bikin login 24 Nov 2026 tidak
// bisa masuk walau email/kata sandi benar.)
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      supabasePublishableKey
    );
  }
  return client;
}

/** Client untuk middleware / server: sesi disimpan di cookie, bukan localStorage. */
export function createServerSupabase(request: NextRequest, response: NextResponse) {
  return createSsrClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );
}

