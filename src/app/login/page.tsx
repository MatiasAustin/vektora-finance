"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { toLoginEmail } from "@/lib/auth";

const SAVED_DEVICE_KEY = "vektora_saved_device_v1";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saveDevice, setSaveDevice] = useState(true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const next = search.get("next") ?? "/";
  const err = search.get("error");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_DEVICE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { loginId?: string; password?: string; saveDevice?: boolean };
        if (parsed.loginId) setLoginId(parsed.loginId);
        if (parsed.password) setPassword(parsed.password);
        if (typeof parsed.saveDevice === "boolean") setSaveDevice(parsed.saveDevice);
      }
    } catch {
      // Ignore storage read errors
    }
  }, []);

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
    try {
      if (saveDevice) {
        localStorage.setItem(
          SAVED_DEVICE_KEY,
          JSON.stringify({ loginId: loginId.trim(), password, saveDevice: true })
        );
      } else {
        localStorage.removeItem(SAVED_DEVICE_KEY);
      }
    } catch {
      // Ignore storage write errors
    }
    router.push(next.startsWith("/") ? next : "/");
    router.refresh();
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="finora-surface w-full max-w-md rounded-3xl p-6 text-white sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-400 to-blue-700 text-sm font-black text-white">
              V
            </div>
            <div>
              <h1 className="text-base font-black">Vektora Finance</h1>
              <p className="text-xs text-blue-200/75">PT Vektora Teknologi Nusantara</p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-blue-100/80">
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

      <div className="finora-surface relative w-full max-w-md rounded-3xl p-6 text-white sm:p-7">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-400 to-blue-700 text-base font-black text-white shadow-lg shadow-blue-600/35 ring-1 ring-white/25">
              V
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-300">
                PT Vektora Teknologi Nusantara
              </p>
              <h1 className="text-lg font-black tracking-tight text-white sm:text-xl">Vektora Finance</h1>
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
              name="username"
              required
              autoComplete="username"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="januar / tiasaustin32@gmail.com"
              className="mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-xs text-white"
            />
            <span className="mt-1 block text-[11px] font-normal text-slate-400">
              Ketik username saja (mis. <b className="text-blue-200">januar</b>) atau email lengkap.
            </span>
          </label>

          <label className="block text-xs font-semibold text-blue-100">
            Kata Sandi
            <div className="relative mt-1.5">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border py-2.5 pl-3.5 pr-11 text-xs text-white"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                title={showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                className="absolute inset-y-0 right-0 flex items-center px-3.5 text-blue-200/75 transition hover:text-white"
              >
                {showPassword ? (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </label>

          {/* Save Device / Ingat Perangkat Ini */}
          <div className="flex items-center justify-between pt-0.5">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-blue-100/90 select-none">
              <input
                type="checkbox"
                checked={saveDevice}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSaveDevice(checked);
                  if (!checked) {
                    try {
                      localStorage.removeItem(SAVED_DEVICE_KEY);
                    } catch {
                      // Ignore
                    }
                  }
                }}
                className="h-4 w-4 rounded border-white/25 bg-white/10 text-blue-500 focus:ring-blue-400"
              />
              <span>Simpan di perangkat ini (Save Device)</span>
            </label>
          </div>

          {msg && (
            <p className="rounded-xl border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
              {msg}
            </p>
          )}

          <button
            disabled={busy}
            className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-600/35 transition hover:from-blue-400 hover:to-blue-500 disabled:opacity-60"
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

