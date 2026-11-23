"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
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
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
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
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-vektora-500 via-vektora-600 to-vektora-900 p-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
          <h1 className="text-2xl font-black">Vektora Finance</h1>
          <p className="mt-2 text-sm text-slate-600">
            Supabase belum terhubung. Buat project di Supabase, jalankan{" "}
            <code>supabase/schema.sql</code> lalu <code>supabase/seed.sql</code>, isi{" "}
            <code>.env.local</code> dari <code>.env.example</code>, lalu deploy ulang.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-vektora-500 via-vektora-600 to-vektora-900 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-vektora-600">
          PT Vektora Teknologi Nusantara
        </p>
        <h1 className="mt-1 text-2xl font-black">Vektora Finance</h1>
        <p className="mt-1 text-sm text-slate-500">Masuk untuk tim, komisaris, dan investor.</p>
        {err === "nonaktif" && (
          <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Akun kamu sudah dinonaktifkan. Hubungi admin (Matias).
          </p>
        )}
        <form onSubmit={submit} className="mt-6 space-y-3">
          <label className="block text-sm font-medium">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@ptvektora.id"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium">
            Kata sandi
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </label>
          {msg && <p className="text-sm text-rose-600">{msg}</p>}
          <button
            disabled={busy}
            className="w-full rounded-xl bg-vektora-500 px-4 py-2.5 font-semibold text-white hover:bg-vektora-600 disabled:opacity-60"
          >
            {busy ? "Memeriksa…" : "Masuk"}
          </button>
        </form>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Akun dibuat admin di Supabase → Authentication → Add user, lalu profil + perannya diisi di halaman
          Tim &amp; Pengguna. Tidak ada kata sandi bawaan di app ini.
        </p>
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
