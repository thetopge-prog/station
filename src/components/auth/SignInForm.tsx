"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useCafeUI } from "@/components/CafeUIProvider";
import { StationMark } from "@/components/cafe/Logo";

const STALE_KEY = "st-stale-bounces";

export function SignInForm({ redirectTo, stale = false }: { redirectTo: string; stale?: boolean }) {
  const { t } = useCafeUI();
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);

  // If the visitor landed here only because their access token expired, the
  // browser client can silently refresh it from the refresh token — then send
  // them straight back in instead of asking for the password again.
  //
  // `stale` means the server just rejected a cookie that still looked valid.
  // One refresh attempt is allowed (a transient blip heals itself); if the
  // server bounces us twice, or the refresh fails, the session is gone on the
  // server side — drop it locally and say so, instead of looping forever.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        if (stale) {
          const n = Number(sessionStorage.getItem(STALE_KEY) ?? 0) + 1;
          sessionStorage.setItem(STALE_KEY, String(n));
          if (n <= 2) {
            const { data } = await supabase.auth.refreshSession();
            if (!cancelled && data.session) {
              router.replace(redirectTo);
              return;
            }
          }
          await supabase.auth.signOut({ scope: "local" });
          sessionStorage.removeItem(STALE_KEY);
          if (!cancelled) setNotice("انتهت جلستك على هذا الجهاز — سجّل الدخول من جديد.");
          return;
        }
        const { data } = await supabase.auth.getSession();
        if (!cancelled && data.session) router.replace(redirectTo);
      } catch {
        /* demo mode or no session — stay on the form */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, redirectTo, stale]);
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
        // السبب الحقيقي لا رسالة عامة: كلمة مرور خاطئة ≠ حظر مؤقت ≠ انقطاع
        const m = signInError.message || "";
        setError(
          /invalid login credentials/i.test(m)
            ? "كلمة المرور غير صحيحة لهذا الرقم — تأكد من اللغة الإنجليزية وCaps Lock، وامسح ما ملأه المتصفح واكتبها يدوياً."
            : /rate limit|too many/i.test(m)
              ? "محاولات كثيرة — انتظر ٥ دقائق ثم أعد المحاولة."
              : /fetch|network/i.test(m)
                ? "تعذّر الوصول إلى الخادم — تحقق من الإنترنت."
                : `${t("auth.error")} (${m.slice(0, 80)})`,
        );
        return;
      }
      sessionStorage.removeItem(STALE_KEY);
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

      {notice && <p className="rounded-lg bg-secondary px-3 py-2 text-sm font-bold">{notice}</p>}
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
