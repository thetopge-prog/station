"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, LockKeyhole, Wallet } from "lucide-react";
import { formatIqd, formatIqdLabel } from "@/lib/cafe/money";
import {
  closeSession,
  myOpenSession,
  openSession,
  pendingHandover,
  sessionReport,
  type OpenSession,
  type PendingHandover,
  type SessionReport,
} from "@/lib/cafe/session-actions";
import { PriceInput } from "./PriceInput";

/**
 * الوردية المالية — wraps the POS and refuses to let it open without one.
 *
 * Three states, in strict order:
 *   1. a colleague left a drawer nobody accepted → COUNT AND CONFIRM, nothing
 *      else is possible
 *   2. no session → enter the opening float
 *   3. session open → the POS, with a live Z-report available
 *
 * Blocking is the whole point. An accountability step that can be skipped gets
 * skipped, and then "the till is short" has no owner. The one thing it must
 * never do is show the expected figure before the count is typed — a cashier
 * who can see the target types the target, and the variance goes to zero
 * forever.
 */
export function CashierSessionGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<OpenSession | null>(null);
  const [handover, setHandover] = useState<PendingHandover | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [float, setFloat] = useState(0);
  const [counted, setCounted] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([myOpenSession(), pendingHandover()]);
      setSession(s);
      setHandover(s ? null : h);
    } catch {
      /* keep what we had */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  async function start(fromSession: string | null, amount: number) {
    setBusy(true);
    setErr(null);
    try {
      const res = await openSession({ float: amount, fromSession, counted: fromSession ? amount : null });
      if (!res.ok) return setErr(res.error);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return <p className="rounded-2xl border-2 border-dashed border-border p-10 text-center font-bold text-muted-foreground">…</p>;
  }

  // ── 1. an unaccepted drawer blocks everything ──────────────────────────
  if (handover) {
    return (
      <Card
        icon={<LockKeyhole className="size-8" />}
        tone="warn"
        title="استلام الصندوق"
        subtitle={`${handover.from_name} أنهى ورديته وترك في الصندوق ${formatIqdLabel(handover.amount)}`}
      >
        <p className="text-sm font-bold text-muted-foreground">
          عُدّ النقد في الصندوق الآن وأدخل ما وجدته فعلاً. إن اختلف عن المبلغ أعلاه، سجّله كما هو — الفرق هو الفائدة كلها من هذه
          الخطوة.
        </p>
        <PriceInput value={counted} onChange={setCounted} />
        <button
          onClick={() => void start(handover.session_id, counted)}
          disabled={busy || counted <= 0}
          className="min-h-16 w-full rounded-2xl bg-primary text-xl font-black text-primary-foreground shadow-station disabled:opacity-50"
        >
          {busy ? "…" : `أؤكّد استلام ${formatIqdLabel(counted)}`}
        </button>
        {counted > 0 && counted !== handover.amount && (
          <p className="rounded-xl border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm font-black text-destructive">
            فرق {formatIqd(Math.abs(counted - handover.amount))} د.ع {counted < handover.amount ? "نقصاً" : "زيادة"} — سيُسجَّل
            للمدير.
          </p>
        )}
        {err && <Err msg={err} />}
      </Card>
    );
  }

  // ── 2. no session → opening float ──────────────────────────────────────
  if (!session) {
    return (
      <Card icon={<Wallet className="size-8" />} tone="plain" title="بدء الوردية" subtitle="أدخل المبلغ الافتتاحي في الصندوق">
        <PriceInput value={float} onChange={setFloat} />
        <button
          onClick={() => void start(null, float)}
          disabled={busy}
          className="min-h-16 w-full rounded-2xl bg-primary text-xl font-black text-primary-foreground shadow-station disabled:opacity-50"
        >
          {busy ? "…" : `ابدأ الوردية بـ ${formatIqdLabel(float)}`}
        </button>
        <p className="text-xs font-bold text-muted-foreground">
          كل بيع ومصروف ودين تسجّله من الآن يُنسَب إلى هذه الوردية وحدها.
        </p>
        {err && <Err msg={err} />}
      </Card>
    );
  }

  // ── 3. open → the POS, plus the end-of-shift control ───────────────────
  return (
    <div className="space-y-4">
      <SessionBar session={session} onClosed={() => void refresh()} />
      {children}
    </div>
  );
}

/* ── the bar that sits above the POS ──────────────────────────────────────── */

function SessionBar({ session, onClosed }: { session: OpenSession; onClosed: () => void }) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<SessionReport | null>(null);
  const [counted, setCounted] = useState(0);
  const [deposited, setDeposited] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ expected: number; variance: number } | null>(null);

  async function openReport() {
    setOpen(true);
    setReport(await sessionReport(session.id));
  }

  async function finish() {
    setBusy(true);
    try {
      const res = await closeSession({ sessionId: session.id, counted, deposited, note });
      if (res.ok) setDone({ expected: res.expected, variance: res.variance });
    } finally {
      setBusy(false);
    }
  }

  const since = new Intl.DateTimeFormat("ar-IQ", { timeZone: "Asia/Baghdad", hour: "2-digit", minute: "2-digit" }).format(
    new Date(session.opened_at),
  );

  return (
    <>
      <div className="touch-pos flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-primary bg-primary/5 p-3">
        <div className="flex items-center gap-2">
          <Banknote className="size-5 text-primary" />
          <div>
            <p className="text-xs font-bold text-muted-foreground">الوردية مفتوحة منذ {since}</p>
            <p className="font-black">
              {session.cashier_name} · افتتاحي {formatIqdLabel(session.opening_float)}
            </p>
          </div>
        </div>
        <button
          onClick={() => void openReport()}
          className="min-h-11 rounded-xl border-2 border-primary px-4 font-black text-primary transition hover:bg-primary hover:text-primary-foreground"
        >
          إنهاء الوردية
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !busy && setOpen(false)}>
          <div
            className="touch-pos max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl bg-card p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {done ? (
              <Result done={done} onClose={onClosed} />
            ) : (
              <>
                <h2 className="mb-1 text-xl font-black">تقرير الوردية (Z)</h2>
                <p className="mb-4 text-sm font-bold text-muted-foreground">راجع الأرقام ثم عُدّ الصندوق</p>

                {report ? (
                  <dl className="space-y-1.5 rounded-2xl border-2 border-border p-3 text-sm font-bold">
                    <Line label="المبلغ الافتتاحي" value={report.opening_float} />
                    <Line label="مبيعات نقدية" value={report.cash_sales} tone="plus" />
                    <Line label="مصروفات" value={-report.expenses_total} tone="minus" />
                    <Line label="مودع للإدارة" value={-deposited} tone="minus" />
                    <div className="border-t-2 border-dashed border-border pt-1.5" />
                    <Line label="مبيعات كي كارد (خارج الصندوق)" value={report.card_sales} muted />
                    <Line label="ديون صدرت" value={report.debts_issued} muted />
                    <p className="pt-1 text-xs font-bold text-muted-foreground">{report.orders_count} طلب في هذه الوردية</p>
                  </dl>
                ) : (
                  <p className="text-center font-bold text-muted-foreground">…</p>
                )}

                <div className="mt-4 space-y-3">
                  <Field label="المبلغ المودع للإدارة">
                    <PriceInput value={deposited} onChange={setDeposited} />
                  </Field>
                  <Field label="النقد الموجود فعلاً في الصندوق (عُدّه الآن)">
                    <PriceInput value={counted} onChange={setCounted} />
                  </Field>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="ملاحظة (اختياري)"
                    className="w-full rounded-xl border-2 border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button onClick={() => setOpen(false)} disabled={busy} className="min-h-14 rounded-xl border-2 border-border font-black">
                    رجوع
                  </button>
                  <button
                    onClick={() => void finish()}
                    disabled={busy || counted <= 0}
                    className="min-h-14 rounded-xl bg-primary font-black text-primary-foreground shadow-station disabled:opacity-40"
                  >
                    {busy ? "…" : "إنهاء وتسليم"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** The variance, shown only AFTER the count is committed. */
function Result({ done, onClose }: { done: { expected: number; variance: number }; onClose: () => void }) {
  const ok = done.variance === 0;
  const short = done.variance < 0;
  return (
    <div className="space-y-4 text-center">
      <h2 className="text-xl font-black">انتهت الوردية</h2>
      <div className="rounded-2xl border-2 border-border p-4">
        <p className="text-sm font-bold text-muted-foreground">المتوقّع في الصندوق</p>
        <p className="text-3xl font-black tabular-nums">{formatIqdLabel(done.expected)}</p>
      </div>
      <div
        className={`rounded-2xl border-2 p-4 ${
          ok ? "border-primary bg-primary/10 text-primary" : "border-destructive bg-destructive/10 text-destructive"
        }`}
      >
        <p className="text-sm font-bold">الفرق</p>
        <p className="text-3xl font-black tabular-nums">
          {ok ? "مطابق ✓" : `${short ? "نقص" : "زيادة"} ${formatIqd(Math.abs(done.variance))}`}
        </p>
      </div>
      <p className="text-xs font-bold text-muted-foreground">
        سُجّل التقرير. الكاشير التالي سيُطالَب بعدّ الصندوق وتأكيد استلامه قبل أن يبيع.
      </p>
      <button onClick={onClose} className="min-h-14 w-full rounded-xl bg-primary font-black text-primary-foreground">
        تمام
      </button>
    </div>
  );
}

/* ── small pieces ─────────────────────────────────────────────────────────── */

function Line({ label, value, tone, muted }: { label: string; value: number; tone?: "plus" | "minus"; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${muted ? "text-muted-foreground" : ""}`}>
      <dt>{label}</dt>
      <dd className={`tabular-nums ${tone === "plus" ? "text-primary" : tone === "minus" ? "text-destructive" : ""}`}>
        {formatIqdLabel(Math.abs(value))}
      </dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-black">{label}</span>
      {children}
    </label>
  );
}

function Err({ msg }: { msg: string }) {
  return <p className="rounded-xl border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive">{msg}</p>;
}

function Card({
  icon,
  title,
  subtitle,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tone: "warn" | "plain";
  children: React.ReactNode;
}) {
  return (
    <div className="touch-pos mx-auto max-w-md space-y-4 pt-8">
      <div
        className={`space-y-4 rounded-3xl border-2 p-6 ${
          tone === "warn" ? "border-destructive bg-destructive/5" : "border-primary bg-card"
        }`}
      >
        <div className="flex items-center gap-3">
          <span className={`flex size-14 items-center justify-center rounded-2xl ${tone === "warn" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
            {icon}
          </span>
          <div>
            <h1 className="text-xl font-black">{title}</h1>
            <p className="text-sm font-bold text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
