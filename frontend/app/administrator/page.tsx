"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Logo } from "@/components/Logo";
import { apiFetch, setStoredToken } from "@/lib/api";

export default function AdministratorLoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail || "Ошибка входа");
      }

      const data = (await res.json()) as { token: string };
      setStoredToken(data.token);
      router.push("/administrator/manager");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10 sm:px-6">
      <div className="mb-6 rounded-3xl border border-white/80 bg-white/85 p-6 shadow-[0_12px_35px_rgba(30,42,78,0.08)] backdrop-blur">
        <Logo />
        <p className="mt-2 text-sm text-neutral-600">Вход в админ-панель AvantaPrint</p>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-4 rounded-3xl border border-white/80 bg-white p-6 shadow-[0_12px_35px_rgba(30,42,78,0.08)]"
      >
        <label className="block text-sm">
          <span className="font-medium text-neutral-500">Логин</span>
          <input
            className="mt-2 h-11 w-full rounded-xl border border-neutral-200 px-3"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            placeholder="Введите логин"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-neutral-500">Пароль</span>
          <input
            type="password"
            className="mt-2 h-11 w-full rounded-xl border border-neutral-200 px-3"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="Введите пароль"
          />
        </label>

        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-gradient-to-r from-neutral-900 to-neutral-700 py-3 font-semibold text-white transition hover:opacity-95 disabled:opacity-50"
        >
          {loading ? "Вход..." : "Войти"}
        </button>
      </form>

      <Link href="/" className="mt-6 text-center text-sm text-neutral-600 underline-offset-4 hover:underline">
        На главную
      </Link>
    </main>
  );
}
