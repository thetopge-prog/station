"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Ban, Camera, Check, Hand, MessageCircle, PackageCheck, ScanLine, Timer } from "lucide-react";
import { claimOrder, confirmAssembled, listPrepOrders, markItemUnavailable, markNotified, markOrderHanded, type PrepOrder } from "@/lib/cafe/prep-actions";
import { sinceLabel } from "@/lib/cafe/time";
import { curbsideReadyLink } from "@/lib/brand";
import { useLiveOrders } from "./use-live-orders";
import { orderIdFromScan, useBarcodeScanner } from "./use-barcode-scanner";
import { QrScanner } from "./QrScanner";
import { chimeNewOrder, unlockAudio } from "@/lib/cafe/chime";

/**
 * شاشة المجهّز — assemble, verify, release.
 *
 * The expediter is the last check before food reaches a customer, so the flow
 * is deliberately two-handed: tick every line, and only then does «جاهز» light
 * up. That single gate is the whole reason this screen exists rather than the
 * cashier just flipping a status.
 *
 * Ticks live in component state, not the database. They are a within-shift
 * working aid for one person at one screen; persisting them would buy nothing
 * and cost a table, a migration and a sync path.
 */
export function ExpediterClient({ name }: { name: string }) {
  const fetcher = useCallback(() => listPrepOrders(null), []);
  const { rows, loaded, live, refresh } = useLiveOrders<PrepOrder>(fetcher, { channelName: "station-expediter" });

  const [checked, setChecked] = useState<Record<string, Set<string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [scan, setScan] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // camera fallback for when the hardware scanner is flat, lost, or refuses
  const [camOpen, setCamOpen] = useState(false);
  // one clock for the whole board: card age must not be read during render
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef<Set<string>>(new Set());
  const first = useRef(true);

  // ring once when a genuinely new order lands
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

  useEffect(() => {
    if (!scan) return;
    const t = setTimeout(() => setScan(null), 3000);
    return () => clearTimeout(t);
  }, [scan]);

  function toggle(orderId: string, itemId: string) {
    setChecked((prev) => {
      const next = new Set(prev[orderId] ?? []);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return { ...prev, [orderId]: next };
    });
  }

  const act = useCallback(
    async (id: string, fn: (id: string) => Promise<{ ok: boolean }>) => {
      if (busy) return;
      setBusy(id);
      try {
        // The result was thrown away and a thrown error escaped as an unhandled
        // rejection, so «تأكيد وإعادة استلام» could refuse and look identical to
        // a button that simply does not work. The expediter is holding a bag;
        // they need the reason on the same screen, in the same second.
        const res = await fn(id);
        if (!res.ok) {
          setScan({ kind: "err", text: (res as { error?: string }).error ?? "تعذّر إتمام العملية" });
          return;
        }
        await refresh();
      } catch (e) {
        setScan({ kind: "err", text: e instanceof Error ? e.message : "تعذّر إتمام العملية" });
      } finally {
        setBusy(null);
      }
    },
    [busy, refresh],
  );

  /**
   * Open WhatsApp with the «طلبك جاهز» message for a customer in their car.
   *
   * The window is opened FIRST and stamped after: browsers only allow
   * window.open synchronously inside a click, so awaiting the server action
   * first would get the popup blocked.
   */
  function notifyCustomer(o: PrepOrder) {
    if (!o.customer_phone) return;
    window.open(
      curbsideReadyLink({ phone: o.customer_phone, orderNumber: String(o.order_seq).padStart(3, "0"), code: o.pickup_code }),
      "_blank",
      "noopener",
    );
    void markNotified(o.id).then(refresh);
  }

  /**
   * Zero-touch: scanning the QR on the assembly ticket marks the order ready.
   *
   * The expediter is holding a bag in one hand and a scanner in the other. The
   * scan IS the confirmation — no tapping, no finding the card on screen. The
   * toast is the only feedback, and it has to be loud enough to read from arm's
   * length while already reaching for the next bag.
   */
  const onScan = useCallback(
    async (raw: string) => {
      const id = orderIdFromScan(raw);
      if (!id) return setScan({ kind: "err", text: "رمز غير معروف" });

      const target = rows.find((r) => r.id === id);
      if (!target) return setScan({ kind: "err", text: "هذا الطلب ليس في القائمة" });
      if (target.prep_status === "ready") {
        return setScan({ kind: "ok", text: `طلب ${String(target.order_seq).padStart(3, "0")} جاهز مسبقاً` });
      }

      const res = await confirmAssembled(id);
      if (!res.ok) {
        return setScan({ kind: "err", text: (res as { error?: string }).error ?? "تعذّر التأكيد" });
      }
      setScan({ kind: "ok", text: `طلب ${String(target.order_seq).padStart(3, "0")} → جاهز ✓` });
      await refresh();
    },
    [rows, refresh],
  );
  useBarcodeScanner((code) => void onScan(code));

  const queue = rows.filter((r) => r.prep_status !== "ready");
  const ready = rows.filter((r) => r.prep_status === "ready");

  return (
    <div className="touch-pos space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">شاشة التجهيز</h1>
          <p className="text-sm font-bold text-muted-foreground">
            {name} · {queue.length} قيد العمل · {ready.length} بانتظار التسليم
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold">
            <ScanLine className="size-4" />
            امسح التذكرة لتجهيز الطلب
          </span>
          {/* Same handler as the hardware scanner — one code path, so the two
              input methods can never drift apart in behaviour. */}
          <button
            onClick={() => setCamOpen(true)}
            className="flex min-h-11 items-center gap-1.5 rounded-full border-2 border-primary px-3 text-xs font-black text-primary transition hover:bg-primary hover:text-primary-foreground"
          >
            <Camera className="size-4" />
            الكاميرا
          </button>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              live ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            {live ? "● اتصال لحظي" : "○ تحديث دوري"}
          </span>
        </div>
      </header>

      {/* scan feedback — big, because it is read at arm's length mid-task */}
      {scan && (
        <p
          className={`rounded-2xl border-2 px-5 py-4 text-center text-xl font-black ${
            scan.kind === "ok"
              ? "border-primary bg-primary/10 text-primary"
              : "border-destructive bg-destructive/10 text-destructive"
          }`}
        >
          {scan.text}
        </p>
      )}

      {!loaded ? (
        <p className="rounded-2xl border-2 border-dashed border-border p-10 text-center font-bold text-muted-foreground">…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-border p-10 text-center text-lg font-bold text-muted-foreground">
          لا توجد طلبات حالياً
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...queue, ...ready].map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              now={now}
              checked={checked[o.id] ?? new Set()}
              busy={busy === o.id}
              onToggle={(itemId) => toggle(o.id, itemId)}
              onUnavailable={async (itemId) => {
                if (!confirm("تأكيد: هذا الصنف نفد؟ سيُخصم من الفاتورة ويُبلَّغ الكاشير ليتصل بالزبون.")) return;
                await markItemUnavailable(itemId);
                await refresh();
              }}
              onClaim={() => act(o.id, claimOrder)}
              onReady={() => act(o.id, confirmAssembled)}
              onHanded={() => act(o.id, markOrderHanded)}
              onNotify={() => void notifyCustomer(o)}
            />
          ))}
        </div>
      )}

      {camOpen && (
        <QrScanner
          onScan={(text) => {
            setCamOpen(false);
            void onScan(text);
          }}
          onClose={() => setCamOpen(false)}
        />
      )}
    </div>
  );
}

function OrderCard({
  order,
  now,
  checked,
  busy,
  onToggle,
  onUnavailable,
  onClaim,
  onReady,
  onHanded,
  onNotify,
}: {
  order: PrepOrder;
  now: number;
  checked: Set<string>;
  busy: boolean;
  onToggle: (itemId: string) => void;
  onUnavailable: (itemId: string) => void | Promise<void>;
  onClaim: () => void;
  onReady: () => void;
  onHanded: () => void;
  onNotify: () => void;
}) {
  // a line that ran out is not a line anybody can tick, so it leaves the count
  const live = order.items.filter((i) => !i.unavailable);
  const allTicked = live.every((i) => checked.has(i.id));
  const isReady = order.prep_status === "ready";
  const mins = Math.floor((now - new Date(order.created_at).getTime()) / 60000);
  const late = mins >= 12;

  return (
    <article
      className={`flex flex-col gap-3 rounded-2xl border-2 bg-card p-4 ${
        isReady ? "border-primary shadow-station" : late ? "border-destructive" : "border-border"
      }`}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-4xl font-black tabular-nums leading-none">{String(order.order_seq).padStart(3, "0")}</p>
          <p className="mt-1 text-sm font-bold text-muted-foreground">
            {order.table_no ? `طاولة ${order.table_no}` : CHANNEL_AR[order.channel] ?? order.channel}
            {order.cashier_name ? ` · ${order.cashier_name}` : ""}
          </p>
        </div>
        <div className="text-left">
          {order.pickup_code && (
            <p className="rounded-full bg-primary px-3 py-0.5 text-lg font-black tabular-nums text-primary-foreground" dir="ltr">
              {order.pickup_code}
            </p>
          )}
          <p className={`mt-1 flex items-center justify-end gap-1 text-sm font-bold ${late ? "text-destructive" : "text-muted-foreground"}`}>
            <Timer className="size-4" />
            {sinceLabel(mins)}
          </p>
        </div>
      </header>

      {order.note && (
        <p className="rounded-xl border-2 border-destructive bg-destructive/5 px-3 py-2 text-sm font-black text-destructive">
          📝 {order.note}
        </p>
      )}

      <ul className="space-y-1.5">
        {order.items.map((it) => {
          const on = checked.has(it.id);
          if (it.unavailable) {
            return (
              <li key={it.id}>
                <div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-destructive/50 bg-destructive/5 p-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg border-2 border-destructive/50 text-destructive">
                    <Ban className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold line-through opacity-60">
                      {it.qty} × {it.name_ar}
                    </span>
                    <span className="block text-xs font-black text-destructive">نفد — خُصم من الفاتورة وأُبلغ الكاشير</span>
                  </span>
                </div>
              </li>
            );
          }
          return (
            <li key={it.id} className="flex items-stretch gap-1.5">
              <button
                onClick={() => onToggle(it.id)}
                aria-pressed={on}
                className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl border-2 p-3 text-right transition ${
                  on ? "border-primary bg-primary/10" : "border-border hover:bg-secondary"
                }`}
              >
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-2 ${
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border"
                  }`}
                >
                  {on && <Check className="size-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-bold ${on ? "line-through opacity-60" : ""}`}>
                    {it.qty} × {it.name_ar}
                  </span>
                  {(it.flavor_ar || it.station_name) && (
                    <span className="block text-xs font-bold text-muted-foreground">
                      {[it.flavor_ar, it.station_name].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
              </button>
              {/* «نفد» — the only honest answer when the shelf is empty. Without
                  it the assemble button stays locked and the only way out is to
                  tick an item that never went in the bag. */}
              <button
                onClick={() => void onUnavailable(it.id)}
                title="الصنف نفد — يُخصم ويُبلَّغ الكاشير"
                className="grid w-12 shrink-0 place-items-center rounded-xl border-2 border-border text-muted-foreground transition hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Ban className="size-5" />
              </button>
            </li>
          );
        })}
      </ul>

      {isReady ? (
        <div className="grid gap-2">
          {/* curbside: message them BEFORE they arrive, which is the whole
              promise of the mode — «اتصل بنا قبل وصولك بدقيقتين» */}
          {order.channel === "curbside" && order.customer_phone && (
            <button
              onClick={onNotify}
              className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-xl text-lg font-black transition ${
                order.notified_at
                  ? "border-2 border-border text-muted-foreground"
                  : "bg-[#25D366] text-white shadow-station"
              }`}
            >
              <MessageCircle className="size-5" />
              {order.notified_at ? "تم إبلاغ الزبون ✓" : "أبلِغ الزبون عبر واتساب"}
            </button>
          )}
          <button
            onClick={onHanded}
            disabled={busy}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-primary px-4 text-lg font-black text-primary transition hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
          >
            <Hand className="size-5" />
            {busy ? "…" : "تم التسليم للزبون"}
          </button>
        </div>
      ) : (
        <div className="grid gap-2">
          {order.prep_status === "new" && (
            <button
              onClick={onClaim}
              disabled={busy}
              className="min-h-12 rounded-xl border-2 border-border px-4 font-black transition hover:bg-secondary disabled:opacity-50"
            >
              {busy ? "…" : "استلمت الطلب"}
            </button>
          )}
          <button
            onClick={onReady}
            disabled={busy || !allTicked}
            title={allTicked ? undefined : "أكّد كل الأصناف أولاً"}
            className="flex min-h-16 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xl font-black text-primary-foreground shadow-station transition hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
          >
            <PackageCheck className="size-6" />
            {busy ? "…" : allTicked ? "تأكيد وإعادة استلام" : `تبقّى ${live.length - checked.size}`}
          </button>
        </div>
      )}
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
