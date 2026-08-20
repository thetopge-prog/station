"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Flame, Timer } from "lucide-react";
import { listPrepOrders, startCooking, type PrepOrder } from "@/lib/cafe/prep-actions";
import { useLiveOrders } from "./use-live-orders";
import { chimeNewOrder, unlockAudio } from "@/lib/cafe/chime";

/**
 * شاشة المطبخ (KDS) — one station's work, nothing else.
 *
 * A chef at the grill must not have to read past pizza and fries to find their
 * own tickets, so the server filters by station and drops orders that leave
 * nothing for this station to cook (see listPrepOrders).
 *
 * Deliberately read-mostly: the only action is «بدأت» because a chef holding
 * tongs should be tapping one big button, not managing state. Releasing the
 * order to the customer stays with the expediter, who checks it first.
 */
export function KdsClient({ stationId, stationName }: { stationId: string | null; stationName: string }) {
  const fetcher = useCallback(() => listPrepOrders(stationId), [stationId]);
  const { rows, loaded, live, refresh } = useLiveOrders<PrepOrder>(fetcher, { channelName: `station-kds-${stationId ?? "all"}` });

  // one clock for the whole board: card age must not be read during render
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef<Set<string>>(new Set());
  const first = useRef(true);

  useEffect(() => {
    const ids = rows.map((r) => r.id);
    if (first.current) {
      ids.forEach((id) => seen.current.add(id));
      first.current = false;
      return;
    }
    if (ids.some((id) => !seen.current.has(id))) chimeNewOrder();
    ids.forEach((id) => seen.current.add(id));
  }, [rows]);

  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    const clock = setInterval(() => setNow(Date.now()), 20_000);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      clearInterval(clock);
    };
  }, []);

  // ready orders are the expediter's problem now; the kitchen is done with them
  const cooking = rows.filter((r) => r.prep_status !== "ready");

  return (
    <div className="touch-pos space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">{stationName}</h1>
          <p className="text-sm font-bold text-muted-foreground">{cooking.length} طلب قيد العمل</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            live ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {live ? "● اتصال لحظي" : "○ تحديث دوري"}
        </span>
      </header>

      {!stationId && (
        <p className="rounded-2xl border-2 border-kraft bg-kraft/10 p-4 text-sm font-bold">
          لم تُسنَد لك محطة بعد — تعرض هذه الشاشة كل الطلبات. يحدّد المدير المحطة من صفحة الموظفين.
        </p>
      )}

      {!loaded ? (
        <p className="rounded-2xl border-2 border-dashed border-border p-10 text-center font-bold text-muted-foreground">…</p>
      ) : cooking.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-border p-12 text-center text-xl font-bold text-muted-foreground">
          لا توجد طلبات لهذه المحطة
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {cooking.map((o) => (
            <KdsCard key={o.id} order={o} now={now} onStart={() => void startCooking(o.id).then(refresh)} />
          ))}
        </div>
      )}
    </div>
  );
}

function KdsCard({ order, now, onStart }: { order: PrepOrder; now: number; onStart: () => void }) {
  const mins = Math.floor((now - new Date(order.created_at).getTime()) / 60000);
  // colour the whole card by age: a kitchen reads urgency at a glance, not by
  // squinting at a number
  const tone =
    mins >= 12 ? "border-destructive bg-destructive/5" : mins >= 7 ? "border-primary bg-primary/5" : "border-border bg-card";
  const started = order.prep_status === "preparing";

  return (
    <article className={`flex flex-col gap-3 rounded-2xl border-2 p-4 ${tone}`}>
      <header className="flex items-start justify-between gap-2">
        <p className="text-5xl font-black leading-none tabular-nums">{String(order.order_seq).padStart(3, "0")}</p>
        <p className={`flex items-center gap-1 text-lg font-black ${mins >= 12 ? "text-destructive" : "text-muted-foreground"}`}>
          <Timer className="size-5" />
          {mins} د
        </p>
      </header>

      <p className="text-sm font-bold text-muted-foreground">
        {order.table_no ? `طاولة ${order.table_no}` : CHANNEL_AR[order.channel] ?? order.channel}
      </p>

      {order.note && (
        <p className="rounded-xl border-2 border-destructive bg-destructive/10 px-3 py-2 text-base font-black text-destructive">
          📝 {order.note}
        </p>
      )}

      <ul className="space-y-1">
        {order.items.map((it) => (
          <li key={it.id} className="flex items-baseline gap-2 rounded-lg bg-background/60 px-3 py-2">
            <span className="text-2xl font-black tabular-nums text-primary">{it.qty}×</span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-bold leading-tight">{it.name_ar}</span>
              {it.flavor_ar && <span className="block text-sm font-bold text-muted-foreground">{it.flavor_ar}</span>}
            </span>
          </li>
        ))}
      </ul>

      <button
        onClick={onStart}
        disabled={started}
        className={`flex min-h-14 items-center justify-center gap-2 rounded-xl text-lg font-black transition ${
          started
            ? "border-2 border-primary text-primary"
            : "bg-primary text-primary-foreground shadow-station hover:opacity-90"
        }`}
      >
        <Flame className="size-5" />
        {started ? "قيد التحضير" : "بدأت التحضير"}
      </button>
    </article>
  );
}

const CHANNEL_AR: Record<string, string> = {
  cashier: "كاشير",
  qr: "طاولة",
  kiosk: "كشك",
  delivery: "توصيل",
  pickup: "استلام",
};
