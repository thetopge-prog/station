"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, PackagePlus, ScrollText, Trash2 } from "lucide-react";
import { formatIqdLabel } from "@/lib/cafe/money";
import { consumeStock, createShortagePo, getPurchaseOrder, listStock, receiveStock, type PurchaseOrder } from "@/lib/cafe/inventory-actions";
import { daysUntil, urgency, type StockRow } from "@/lib/cafe/inventory";
import { PrintButton } from "./PrintButton";

/**
 * المخزون — receiving, expiry, and the shortage invoice.
 *
 * Ordered by urgency, not alphabetically: expired first, then expiring, then
 * short. A kitchen manager opens this between rushes and needs the answer to
 * "what is about to cost me money" in the first screenful, without scrolling.
 *
 * Expiry is the reason batches exist at all. Two deliveries of the same
 * ingredient are different rows because one of them goes off first, and FEFO
 * consumption depends on knowing which.
 */

const STATE_AR = { ok: "متوفر", low: "قارب النفاد", out: "نفد" } as const;

export function InventoryClient({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<StockRow | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRows(await listStock());
    } catch {
      /* keep the last good list */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  // urgency = expired, then expiring within 3 days, then below reorder point
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => urgency(a) - urgency(b) || a.name_ar.localeCompare(b.name_ar, "ar"));
  }, [rows]);

  const alerts = useMemo(() => {
    let expired = 0;
    let soon = 0;
    for (const r of rows) {
      const d = daysUntil(r.nearest_expiry);
      if (d === null) continue;
      if (d < 0) expired++;
      else if (d <= 3) soon++;
    }
    return { expired, soon, short: rows.filter((r) => r.stock_state !== "ok").length };
  }, [rows]);

  async function makePo() {
    setBusy(true);
    try {
      const res = await createShortagePo();
      if (!res.ok) return setMsg({ kind: "err", text: res.error });
      setPo(await getPurchaseOrder(res.poId));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="touch-pos space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">المخزون</h1>
          <p className="text-sm font-bold text-muted-foreground">{rows.length} مادة · الأقرب انتهاءً يُستهلك أولاً</p>
        </div>
        <button
          onClick={() => void makePo()}
          disabled={busy || alerts.short === 0}
          className="flex min-h-12 items-center gap-2 rounded-xl bg-primary px-4 font-black text-primary-foreground shadow-station disabled:opacity-40"
        >
          <ScrollText className="size-5" />
          فاتورة النواقص {alerts.short > 0 ? `(${alerts.short})` : ""}
        </button>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="منتهية" value={alerts.expired} tone={alerts.expired ? "bad" : "plain"} icon={<AlertTriangle className="size-4" />} />
        <Stat label="تنتهي خلال ٣ أيام" value={alerts.soon} tone={alerts.soon ? "warn" : "plain"} icon={<CalendarClock className="size-4" />} />
        <Stat label="تحت حد الطلب" value={alerts.short} tone={alerts.short ? "warn" : "plain"} icon={<PackagePlus className="size-4" />} />
      </div>

      {msg && (
        <p
          className={`rounded-2xl border-2 px-4 py-3 font-bold ${
            msg.kind === "ok" ? "border-primary bg-primary/10 text-primary" : "border-destructive bg-destructive/10 text-destructive"
          }`}
        >
          {msg.text}
        </p>
      )}

      {!loaded ? (
        <p className="rounded-2xl border-2 border-dashed border-border p-10 text-center font-bold text-muted-foreground">…</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((r) => (
            <StockCard key={r.id} row={r} onOpen={() => setOpen(r)} isAdmin={isAdmin} />
          ))}
        </div>
      )}

      {open && (
        <MovementSheet
          row={open}
          isAdmin={isAdmin}
          onClose={() => setOpen(null)}
          onDone={(text) => {
            setMsg({ kind: "ok", text });
            setOpen(null);
            void refresh();
          }}
        />
      )}

      {po && <PoSheet po={po} onClose={() => setPo(null)} />}
    </div>
  );
}

/* ── cards ────────────────────────────────────────────────────────────────── */

function StockCard({ row, onOpen, isAdmin }: { row: StockRow; onOpen: () => void; isAdmin: boolean }) {
  const d = daysUntil(row.nearest_expiry);
  const expired = d !== null && d < 0;
  const soon = d !== null && d >= 0 && d <= 3;

  const tone = expired
    ? "border-destructive bg-destructive/5"
    : soon || row.stock_state === "out"
      ? "border-destructive/60 bg-destructive/5"
      : row.stock_state === "low"
        ? "border-kraft bg-kraft/10"
        : "border-border bg-card";

  return (
    <button onClick={onOpen} className={`rounded-2xl border-2 p-3 text-right transition active:scale-[0.99] ${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-black">{row.name_ar}</p>
          <p className="text-xs font-bold text-muted-foreground">{row.category ?? "—"}</p>
        </div>
        <div className="text-left">
          <p className="text-xl font-black tabular-nums">
            {row.on_hand} <span className="text-xs font-bold text-muted-foreground">{row.unit}</span>
          </p>
          <p className="text-[11px] font-bold text-muted-foreground">حد الطلب {row.min_qty}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone={row.stock_state === "ok" ? "ok" : row.stock_state === "low" ? "warn" : "bad"}>
          {STATE_AR[row.stock_state]}
        </Badge>
        {expired && <Badge tone="bad">منتهية منذ {Math.abs(d!)} يوم</Badge>}
        {soon && <Badge tone="warn">{d === 0 ? "تنتهي اليوم" : `تنتهي خلال ${d} يوم`}</Badge>}
        {/* الكلفة ربح مقلوب: من يعرف كلفة المادة يعرف هامش الصنف. للإدارة وحدها. */}
        {isAdmin && row.avg_unit_cost > 0 && <Badge tone="plain">{formatIqdLabel(row.avg_unit_cost)} / {row.unit}</Badge>}
      </div>
    </button>
  );
}

/* ── receive / waste sheet ────────────────────────────────────────────────── */

function MovementSheet({
  row,
  isAdmin,
  onClose,
  onDone,
}: {
  row: StockRow;
  isAdmin: boolean;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const [tab, setTab] = useState<"receive" | "out">("receive");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [expiry, setExpiry] = useState("");
  const [supplier, setSupplier] = useState("");
  const [reason, setReason] = useState<"waste" | "expired" | "consume" | "adjust">("waste");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const n = Number(qty);

  async function submit() {
    if (!(n > 0)) return setErr("أدخل كمية صحيحة.");
    setBusy(true);
    setErr(null);
    try {
      if (tab === "receive") {
        const res = await receiveStock({
          ingredientId: row.id,
          qty: n,
          unitCost: Number(cost) || 0,
          expiry: expiry || null,
          supplier,
        });
        if (!res.ok) return setErr(res.error);
        onDone(`أُضيف ${n} ${row.unit} إلى ${row.name_ar}`);
      } else {
        const res = await consumeStock({ ingredientId: row.id, qty: n, reason });
        if (!res.ok) return setErr(res.error);
        onDone(
          res.shortfall > 0
            ? `خُصم ${n} ${row.unit} — ${res.shortfall} بلا رصيد، سُجّل كعجز`
            : `خُصم ${n} ${row.unit} من ${row.name_ar}`,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-black">{row.name_ar}</h2>
        <p className="mb-4 text-sm font-bold text-muted-foreground">
          الرصيد {row.on_hand} {row.unit} · حد الطلب {row.min_qty}
        </p>

        <div className="mb-4 grid grid-cols-2 gap-1.5 rounded-xl bg-secondary p-1.5">
          {(
            [
              ["receive", "استلام"],
              ["out", "صرف / هدر"],
            ] as const
          ).map(([k, lbl]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-lg py-2.5 font-black transition ${tab === k ? "bg-primary text-primary-foreground" : ""}`}
            >
              {lbl}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <Field label={`الكمية (${row.unit})`}>
            <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" dir="ltr" className={FIELD} autoFocus />
          </Field>

          {tab === "receive" ? (
            <>
              <Field label="سعر الوحدة (د.ع)">
                <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="numeric" dir="ltr" className={FIELD} />
              </Field>
              <Field label="تاريخ الانتهاء">
                {/* native date input: no picker library, and it speaks Arabic
                    locale + RTL on every device the shop owns */}
                <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} dir="ltr" className={FIELD} />
              </Field>
              <Field label="المورّد (اختياري)">
                <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={FIELD} />
              </Field>
              <p className="text-xs font-bold text-muted-foreground">
                اتركه فارغاً وسيُحسب تلقائياً من مدة الصلاحية المعتادة لهذه المادة.
              </p>
            </>
          ) : (
            <Field label="السبب">
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    ["waste", "هدر"],
                    ["expired", "منتهية"],
                    ["consume", "استهلاك"],
                    ["adjust", "تسوية جرد"],
                  ] as const
                ).map(([k, lbl]) => (
                  <button
                    key={k}
                    onClick={() => setReason(k)}
                    className={`min-h-11 rounded-xl border-2 font-bold transition ${
                      reason === k ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {err && <p className="rounded-xl border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive">{err}</p>}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button onClick={onClose} className="min-h-14 rounded-xl border-2 border-border font-black">
              إلغاء
            </button>
            <button
              onClick={() => void submit()}
              disabled={busy}
              className={`flex min-h-14 items-center justify-center gap-2 rounded-xl font-black text-white shadow-station disabled:opacity-40 ${
                tab === "receive" ? "bg-primary" : "bg-destructive"
              }`}
            >
              {tab === "receive" ? <PackagePlus className="size-5" /> : <Trash2 className="size-5" />}
              {busy ? "…" : tab === "receive" ? "استلام" : "خصم"}
            </button>
          </div>
          {!isAdmin && <p className="text-center text-xs font-bold text-muted-foreground">تعديل حدود الطلب للمدير فقط.</p>}
        </div>
      </div>
    </div>
  );
}

/* ── shortage invoice ─────────────────────────────────────────────────────── */

function PoSheet({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="receipt-print max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-black">فاتورة النواقص</h2>
        <p className="mb-4 text-sm font-bold text-muted-foreground">{po.business_day} · {po.lines.length} مادة</p>

        <table className="w-full text-sm">
          <thead className="border-b-2 border-border text-xs font-black text-muted-foreground">
            <tr>
              <th className="py-1.5 text-right">المادة</th>
              <th className="text-center">الرصيد</th>
              <th className="text-center">المطلوب</th>
              <th className="text-left">التقديري</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((l, i) => (
              <tr key={i} className="border-b border-border/60">
                <td className="py-2 font-bold">{l.name_ar}</td>
                <td className="text-center tabular-nums text-destructive">{l.on_hand}</td>
                <td className="text-center font-black tabular-nums">
                  {l.qty} <span className="text-xs font-normal text-muted-foreground">{l.unit}</span>
                </td>
                <td className="text-left tabular-nums">{l.est_unit_cost > 0 ? formatIqdLabel(l.qty * l.est_unit_cost) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 flex items-center justify-between border-t-2 border-border pt-3">
          <span className="font-black">التقدير الإجمالي</span>
          <span className="text-xl font-black tabular-nums text-primary">{formatIqdLabel(po.total)}</span>
        </div>
        <p className="mt-1 text-xs font-bold text-muted-foreground">
          التقدير مبني على متوسط سعر آخر الدفعات — السعر الفعلي يُدخل عند الاستلام.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2 print:hidden">
          <button onClick={onClose} className="min-h-14 rounded-xl border-2 border-border font-black">
            إغلاق
          </button>
          <PrintButton label="طباعة" />
        </div>
      </div>
    </div>
  );
}

/* ── bits ─────────────────────────────────────────────────────────────────── */

const FIELD = "w-full rounded-xl border-2 border-input bg-background px-3 py-2.5 outline-none focus:border-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-black">{label}</span>
      {children}
    </label>
  );
}

function Badge({ tone, children }: { tone: "ok" | "warn" | "bad" | "plain"; children: React.ReactNode }) {
  const cls = {
    ok: "bg-primary/10 text-primary",
    warn: "bg-kraft/25 text-cocoa",
    bad: "bg-destructive/15 text-destructive",
    plain: "bg-muted text-muted-foreground",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${cls}`}>{children}</span>;
}

function Stat({ label, value, tone, icon }: { label: string; value: number; tone: "plain" | "warn" | "bad"; icon: React.ReactNode }) {
  const cls = {
    plain: "border-border bg-card text-muted-foreground",
    warn: "border-kraft bg-kraft/10 text-cocoa",
    bad: "border-destructive bg-destructive/10 text-destructive",
  }[tone];
  return (
    <div className={`rounded-2xl border-2 p-3 ${cls}`}>
      <p className="flex items-center gap-1.5 text-xs font-bold">
        {icon}
        {label}
      </p>
      <p className="text-2xl font-black tabular-nums">{value}</p>
    </div>
  );
}
