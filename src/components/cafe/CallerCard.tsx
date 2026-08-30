"use client";

import { useEffect, useState } from "react";
import { Check, History, Loader2, PhoneCall, Save, Sparkles, X } from "lucide-react";
import { formatIqdLabel } from "@/lib/cafe/money";
import {
  recentDistinctOrders,
  saveCallerDetails,
  type IncomingCall,
  type LastLine,
  type LastOrder,
} from "@/lib/cafe/call-actions";

/**
 * The caller, full screen, while the phone is still ringing.
 *
 * Everything a cashier needs to take a delivery order without asking a single
 * question they have already been told the answer to:
 *
 *   right  — who they are and where they live, editable, saved on the CUSTOMER
 *   left   — up to three of their previous orders, as full receipts
 *   bottom — take one of those, or start empty
 *
 * The three are three DIFFERENT baskets, not the three most recent: somebody
 * who orders the same two burgers every Friday would otherwise fill the panel
 * with one order printed three times. Deduplication happens server-side in
 * recentDistinctOrders.
 *
 * A chosen order lands in the basket as ordinary editable lines. It is not a
 * shortcut past the cashier reading it back — it is the difference between
 * reading it back and typing it from scratch.
 */

export function CallerCard({
  call,
  onClose,
  onUse,
  onRepeat,
  onDetailsSaved,
}: {
  call: IncomingCall;
  onClose: () => void;
  onUse: (call: IncomingCall) => void;
  onRepeat: (call: IncomingCall, lines: LastLine[]) => void;
  onDetailsSaved?: (name: string | null, address: string | null) => void;
}) {
  const [name, setName] = useState(call.name ?? "");
  const [address, setAddress] = useState(call.address ?? "");
  const [saved, setSaved] = useState(false);
  const [orders, setOrders] = useState<LastOrder[] | null>(null);
  const [picked, setPicked] = useState(0);

  useEffect(() => {
    // fetched HERE, not in the strip's four-second poll
    let alive = true;
    void recentDistinctOrders(call.phone)
      .then((o) => alive && setOrders(o))
      .catch(() => alive && setOrders([]));
    return () => {
      alive = false;
    };
  }, [call.phone]);

  async function save() {
    const res = await saveCallerDetails(call.phone, name, address);
    if (!res.ok) return;
    setSaved(true);
    onDetailsSaved?.(name.trim() || null, address.trim() || null);
    setTimeout(() => setSaved(false), 2000);
  }

  const chosen = orders?.[picked] ?? null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-modal="true">
      {/* ── header ── */}
      <header className="flex items-center justify-between gap-3 border-b border-border bg-primary/10 px-4 py-3">
        <p className="flex items-center gap-2 text-lg font-black text-primary">
          <PhoneCall className="size-5 animate-pulse" />
          زبون يتصل الآن
        </p>
        <button onClick={onClose} aria-label="إغلاق" className="grid size-11 place-items-center rounded-full hover:bg-secondary">
          <X className="size-6" />
        </button>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        {/* ── the customer ── */}
        <section className="space-y-3 rounded-2xl border-2 border-border bg-card p-4">
          <h2 className="font-black">بيانات الزبون</h2>

          <label className="block text-sm">
            <span className="text-muted-foreground">الاسم</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اسم الزبون"
              className="mt-1 block min-h-12 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <label className="block text-sm">
            <span className="text-muted-foreground">العنوان</span>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              placeholder="الحي، الشارع، أقرب نقطة دالة"
              className="mt-1 block w-full rounded-xl border border-input bg-background p-3 text-base outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <div className="rounded-xl bg-secondary/60 p-3">
            <p className="text-lg font-black tabular-nums" dir="ltr">
              {call.phone}
            </p>
            {call.points != null && <p className="text-xs font-bold text-muted-foreground">{call.points} نقطة</p>}
          </div>

          <button
            onClick={() => void save()}
            className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 font-black transition ${
              saved ? "bg-emerald-600 text-white" : "bg-secondary hover:opacity-90"
            }`}
          >
            {saved ? <Check className="size-5" /> : <Save className="size-5" />}
            {saved ? "حُفظ — لن يُسأل مرة أخرى" : "حفظ الاسم والعنوان"}
          </button>
        </section>

        {/* ── their previous orders ── */}
        <section className="min-w-0 space-y-3">
          <h2 className="flex items-center gap-2 font-black">
            <History className="size-5 text-primary" />
            طلباته السابقة
            <span className="text-xs font-bold text-muted-foreground">(المختلفة فقط)</span>
          </h2>

          {orders === null ? (
            <p className="flex items-center gap-2 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              جارٍ جلب طلباته…
            </p>
          ) : orders.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm font-bold text-muted-foreground">
              لا توجد طلبات سابقة — هذه أول مرة يطلب فيها.
            </p>
          ) : (
            <>
              {/* the chooser strip */}
              <div className="flex flex-wrap gap-2">
                {orders.map((o, i) => (
                  <button
                    key={o.seq}
                    onClick={() => setPicked(i)}
                    className={`min-h-12 rounded-xl border-2 px-4 text-sm font-black transition ${
                      i === picked ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary"
                    }`}
                  >
                    #{String(o.seq).padStart(3, "0")}
                    <span className="block text-[11px] font-bold opacity-80">{o.at.slice(0, 10)}</span>
                  </button>
                ))}
              </div>

              {/* the chosen one, as a receipt */}
              {chosen && (
                <div className="rounded-2xl border-2 border-border bg-card p-4">
                  <ul className="space-y-1.5">
                    {chosen.lines.map((l, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3 border-b border-dashed border-border pb-1.5 last:border-0">
                        <span className="min-w-0 text-base font-bold">
                          {l.qty > 1 && <span className="text-primary">{l.qty}× </span>}
                          {l.name}
                          {l.flavor ? <span className="text-sm text-muted-foreground"> — {l.flavor}</span> : null}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{formatIqdLabel(l.unitPrice * l.qty)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex items-baseline justify-between border-t-2 border-border pt-2 text-lg font-black">
                    <span>الإجمالي</span>
                    <span className="tabular-nums">{formatIqdLabel(chosen.total)}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* ── what happens next ── */}
      <footer className="grid gap-2 border-t border-border bg-card p-4 sm:grid-cols-2">
        <button
          onClick={() => chosen && onRepeat(call, chosen.lines)}
          disabled={!chosen}
          className="min-h-14 rounded-2xl bg-primary text-lg font-black text-primary-foreground transition active:scale-[0.99] disabled:opacity-40"
        >
          {chosen ? `اختر هذا الطلب · ${formatIqdLabel(chosen.total)}` : "لا يوجد طلب سابق"}
        </button>
        <button
          onClick={() => onUse(call)}
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-primary text-lg font-black text-primary transition active:scale-[0.99]"
        >
          <Sparkles className="size-5" />
          طلب جديد
        </button>
      </footer>
    </div>
  );
}
