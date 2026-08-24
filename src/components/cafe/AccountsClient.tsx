"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, RefreshCw, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { saveAccount, setAccountActive, type AccountRow } from "@/lib/cafe/account-actions";
import { ROLE_AR, STAFF_ROLES, type StaffRole } from "@/lib/cafe/roles";
import { CopyButton } from "./CopyButton";

/**
 * Staff logins.
 *
 * Two jobs on one screen, because they are the same form: creating an account
 * and resetting a forgotten password. Submitting an existing login just sets
 * the new password — which is what somebody at the counter actually needs at
 * eight in the morning, and it means there is no second flow to get wrong.
 *
 * The password is shown ONCE, right after creation, with a copy button. It
 * cannot be recovered later — nobody can read it back, including us — so the
 * moment to write it down is now.
 */

const STATIONS = [
  { en: "pizza_oven", ar: "فرن البيتزا" },
  { en: "burger", ar: "مطبخ البرجر والفرايس" },
  { en: "grill", ar: "الشواية" },
];

/** Readable out loud over a noisy counter: no O/0, no I/l/1. */
function suggestPassword(): string {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const num = "23456789";
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  return (
    pick(abc) + pick(abc.toLowerCase()) + pick(abc.toLowerCase()) + pick(abc.toLowerCase()) + pick(num) + pick(num) + pick(num) + pick(num)
  );
}

export function AccountsClient({ accounts }: { accounts: AccountRow[] }) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [login, setLogin] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("cashier");
  const [stationEn, setStationEn] = useState(STATIONS[0].en);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ login: string; password: string } | null>(null);

  function start(prefill?: AccountRow) {
    setErr(null);
    setDone(null);
    setLogin(prefill?.login ?? "");
    setName(prefill?.name_ar ?? "");
    setRole(prefill?.role ?? "cashier");
    setPassword(suggestPassword());
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await saveAccount({
      login,
      password,
      name_ar: name,
      role,
      stationEn: role === "chef" ? stationEn : null,
    });
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    setDone({ login: res.login, password });
    setOpen(false);
    router.refresh();
  }

  async function toggle(a: AccountRow) {
    await setAccountActive(a.employeeId, !a.is_active);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-black">
          <KeyRound className="size-5 text-primary" />
          حسابات الدخول
        </h2>
        <button
          onClick={() => start()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 font-bold text-primary-foreground"
        >
          <Plus className="size-5" />
          حساب جديد
        </button>
      </div>

      {/* shown once — there is no way to read a password back later */}
      {done && (
        <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-500/10 p-4">
          <p className="font-black text-emerald-700 dark:text-emerald-300">تم إنشاء الحساب ✅ — اكتب هذه البيانات الآن</p>
          <p className="mb-2 text-xs text-muted-foreground">لن تظهر كلمة المرور مرة أخرى؛ لا أحد يستطيع قراءتها لاحقاً.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="اسم الدخول" value={done.login} />
            <Field label="كلمة المرور" value={done.password} />
          </div>
          <button onClick={() => setDone(null)} className="mt-3 min-h-11 rounded-lg border border-border px-4 text-sm font-bold">
            كتبتها — إغلاق
          </button>
        </div>
      )}

      {open && (
        <form onSubmit={submit} className="space-y-3 rounded-2xl border-2 border-primary/40 bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-muted-foreground">رقم الهاتف (اسم الدخول)</span>
              <input
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                required
                dir="ltr"
                placeholder="07XXXXXXXXX"
                className="mt-1 block min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="text-sm">
              <span className="text-muted-foreground">اسم الموظف</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="كاشير ١"
                className="mt-1 block min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="text-sm">
              <span className="text-muted-foreground">الصلاحية</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as StaffRole)}
                className="mt-1 block min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_AR[r]}
                  </option>
                ))}
              </select>
            </label>
            {role === "chef" && (
              <label className="text-sm">
                <span className="text-muted-foreground">المحطة — يرى أصنافها فقط</span>
                <select
                  value={stationEn}
                  onChange={(e) => setStationEn(e.target.value)}
                  className="mt-1 block min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  {STATIONS.map((s) => (
                    <option key={s.en} value={s.en}>
                      {s.ar}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <label className="block text-sm">
            <span className="text-muted-foreground">كلمة المرور</span>
            <div className="mt-1 flex gap-2">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                dir="ltr"
                className="min-h-11 flex-1 rounded-lg border border-input bg-background px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setPassword(suggestPassword())}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-bold hover:bg-secondary"
              >
                <RefreshCw className="size-4" />
                توليد
              </button>
            </div>
          </label>

          <p className="text-xs text-muted-foreground">
            رقم مسجّل مسبقاً؟ نفس النموذج يغيّر كلمة مروره — استعمله عند نسيان كلمة المرور.
          </p>
          {err && <p className="text-sm font-bold text-destructive">{err}</p>}

          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-primary px-5 font-bold text-primary-foreground disabled:opacity-50">
              {busy ? "…" : "حفظ"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-xl border border-border px-5 font-bold">
              إلغاء
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {accounts.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">لا توجد حسابات دخول بعد.</p>
        )}
        {accounts.map((a) => (
          <div
            key={a.employeeId}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3 ${a.is_active ? "border-border" : "border-dashed border-border opacity-60"}`}
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 font-bold">
                {a.name_ar}
                {a.is_developer && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-black text-primary">
                    <ShieldCheck className="size-3" />
                    مطوّر
                  </span>
                )}
                {!a.is_active && <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold">موقوف</span>}
              </p>
              <p className="text-xs text-muted-foreground" dir="ltr">
                {a.login}
              </p>
              <p className="text-xs text-muted-foreground">
                {a.role ? ROLE_AR[a.role] : "بلا صلاحية"}
                {a.station ? ` · ${a.station}` : ""}
                {" · "}
                {a.last_sign_in ? `آخر دخول ${a.last_sign_in.slice(0, 10)}` : "لم يدخل بعد"}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => start(a)} className="min-h-11 rounded-lg border border-border px-3 text-sm font-bold hover:bg-secondary">
                كلمة مرور جديدة
              </button>
              <button
                onClick={() => void toggle(a)}
                title={a.is_active ? "إيقاف" : "تفعيل"}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border hover:bg-secondary"
              >
                {a.is_active ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-background px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-mono font-bold" dir="ltr">
          {value}
        </p>
      </div>
      <CopyButton value={value} />
    </div>
  );
}
