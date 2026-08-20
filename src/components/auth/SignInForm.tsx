"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useCafeUI } from "@/components/CafeUIProvider";
import { StationMark } from "@/components/cafe/Logo";

export function SignInForm({ redirectTo }: { redirectTo: string }) {
  const { t } = useCafeUI();
  const router = useRouter();

  // If the visitor landed here only because their access token expired, the
  // browser client can silently refresh it from the refresh token — then send
  // them straight back in instead of asking for the password again.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await createSupabaseBrowserClient().auth.getSession();
        if (!cancelled && data.session) router.replace(redirectTo);
      } catch {
        /* demo mode or no session — stay on the form */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, redirectTo]);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // phone numbers & usernames map to <login>@station.iq auth accounts
      const email = login.includes("@") ? login.trim() : `${login.trim()}@station.iq`;
      // Supabase enforces >=6-char passwords; short PINs (e.g. the cashier's
      // «123») are stored zero-padded to 6, so pad the same way on login.
      const realPassword = password.length < 6 ? password.padEnd(6, "0") : password;
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: realPassword });
      if (signInError) {
        setError(t("auth.error"));
        return;
      }
      router.replace(redirectTo);
    } catch {
      setError(t("auth.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <div className="space-y-2 text-center">
        <StationMark className="mx-auto size-20" />
        <h1 className="text-2xl font-bold text-primary">ستيشن</h1>
        <p className="text-sm text-muted-foreground">{t("auth.title")}</p>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium">{t("auth.email")}</span>
        <input
          type="text"
          required
          autoComplete="username"
          placeholder="07XXXXXXXXX"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
          dir="ltr"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">{t("auth.password")}</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
          dir="ltr"
        />
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
      >
        {loading ? t("auth.signingIn") : t("auth.signIn")}
      </button>
    </form>
  );
}
