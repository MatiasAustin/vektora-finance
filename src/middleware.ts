import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase, isSupabaseConfigured } from "@/lib/supabase";

/**
 * Lindungi semua route app. /login terbuka; sisanya butuh sesi Supabase Auth.
 * Bila Supabase belum dikonfigurasi (env kosong), lewatkan saja supaya build
 * dan halaman "Hubungkan Supabase dulu" tetap bisa tampil.
 * User yang profilnya nonaktif (active=false) di-logout dan dikembalikan ke /login.
 */
export async function middleware(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.next();

  const response = NextResponse.next({ request });
  const supabase = createServerSupabase(request, response);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLogin = request.nextUrl.pathname === "/login";

  if (!user) {
    if (isLogin) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // User login tapi profil dinonaktifkan (mis. diberhentikan) -> paksa logout.
  const { data: profile } = await supabase
    .from("profiles")
    .select("active")
    .eq("id", user.id)
    .maybeSingle();
  if (profile && profile.active === false) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "nonaktif");
    return NextResponse.redirect(url);
  }

  if (isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
