"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { toLoginEmail } from "@/lib/auth";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const next = search.get("next") ?? "/";
  const err = search.get("error");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true);
    setMsg("");
    const { error } = await sb.auth.signInWithPassword({ email: toLoginEmail(loginId), password });
    setBusy(false);
    if (error) {
      setMsg("Gagal masuk: " + error.message);
      return;
    }
    router.push(next.startsWith("/") ? next : "/");
    router.refresh();
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="finora-surface w-full max-w-md rounded-3xl p-6 text-white sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-400 to-blue-700 font-black text-white">
              V
            </div>
            <div>
              <h1 className="text-xl font-black">Vektora Finance</h1>
              <p className="text-xs text-blue-200/75">PT Vektora Teknologi Nusantara</p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-blue-100/80">
            Supabase belum terhubung. Buat project di Supabase, jalankan{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">supabase/schema.sql</code> lalu{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">supabase/seed.sql</code>, isi{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">.env.local</code> dari{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">.env.example</code>, lalu deploy ulang.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Glow Finora background */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-blue-500/30 blur-3xl" />

      <div className="finora-surface relative w-full max-w-md rounded-3xl p-6 text-white sm:p-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-400 to-blue-700 text-lg font-black text-white shadow-lg shadow-blue-600/35 ring-1 ring-white/25">
              V
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-300">
                PT Vektora Teknologi Nusantara
              </p>
              <h1 className="text-2xl font-black tracking-tight text-white">Vektora Finance</h1>
            </div>
          </div>
        </div>

        {/* Mini Finora Card Preview */}
        <div className="finora-glossy-card mt-5 rounded-2xl p-4 text-white">
          <div className="flex items-center justify-between text-xs text-blue-100">
            <span className="font-bold tracking-wider">MULTI-BRAND PORTAL</span>
            <span>WHEREISIT · MOONIMO</span>
          </div>
          <p className="mt-3 font-mono text-sm tracking-widest text-white/90">**** **** **** 2026</p>
        </div>

        {err === "nonaktif" && (
          <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-200">
            Akun kamu sudah dinonaktifkan. Hubungi admin (Matias).
          </p>
        )}

        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-xs font-semibold text-blue-100">
            Username atau Email
            <input
              type="text"
              required
              autoComplete="username"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="januar / tiasaustin32@gmail.com"
              className="mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm text-white"
            />
            <span className="mt-1 block text-[11px] font-normal text-slate-400">
              Ketik username saja (mis. <b className="text-blue-200">januar</b>) atau email lengkap.
            </span>
          </label>

          <label className="block text-xs font-semibold text-blue-100">
            Kata Sandi
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm text-white"
            />
          </label>

          {msg && (
            <p className="rounded-xl border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
              {msg}
            </p>
          )}

          <button
            disabled={busy}
            className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/35 transition hover:from-blue-400 hover:to-blue-500 disabled:opacity-60"
          >
            {busy ? "Memeriksa kredensial…" : "Masuk ke Vektora Finance →"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

