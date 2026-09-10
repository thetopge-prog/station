"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing } from "lucide-react";
import { formatIqdLabel } from "@/lib/cafe/money";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { latestExternalAlerts, markAlertHandled, type ExternalAlert } from "@/lib/cafe/external-actions";
import { sinceLabel } from "@/lib/cafe/time";
import { agentAlive, kickDrawer, printJobs } from "@/lib/cafe/print-client";
import { buildOrderJobs } from "@/lib/cafe/printer-actions";
import { claimPrint, releasePrint } from "@/lib/cafe/print-spool-actions";
import {
  listPendingOrders,
  payPendingOrder,
  cancelOrder,
  type PendingOrder,
} from "@/lib/cafe/cashier-actions";
import { Receipt, type ReceiptData } from "./Receipt";
import { PartnerLogo } from "./PartnerLogo";

const SOURCE_AR: Record<string, string> = { telegram: "تليغرام", whatsapp: "واتساب", web: "الموقع", toters: "توترز", talabaty: "طلباتي" };
const CHANNEL_AR: Record<string, string> = {
  qr: "موبايل",
  kiosk: "لوحي",
  cashier: "كاشير",
  delivery: "توصيل",
  pickup: "استلام",
  takeaway: "سفري",
  curbside: "من السيارة",
};

function ageMinutes(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

function ticketFor(o: PendingOrder, heading?: string): ReceiptData {
  return {
    orderNumber: String(o.order_seq).padStart(3, "0"),
    heading,
    table: o.table_no,
    note: o.note,
    lines: o.items.map((it) => ({ name: it.name_ar, flavor: it.flavor_ar, qty: it.qty, unitPrice: it.unit_price })),
    subtotal: o.subtotal,
    discount: 0,
    total: o.subtotal,
    dateTime: new Date().toLocaleString("en-GB", { timeZone: "Asia/Baghdad", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }),
  };
}

/** Dedicated incoming-orders screen: the counter's live queue of table
 *  self-orders, with auto-print and cash-drawer device toggles. */
export function IncomingOrdersClient() {
  const [pending, setPending] = useState<PendingOrder[]>([]);
  const [queueErr, setQueueErr] = useState<string | null>(null);

  // device settings (shared with the cashier screen via the same localStorage keys)
  const [autoPrint, setAutoPrint] = useState(false);
  // تنبيهات جهاز توترز/طلباتي — تُستطلع على حدة كي لا تمسّ استطلاع الطلبات
  const [alerts, setAlerts] = useState<ExternalAlert[]>([]);
  useEffect(() => {
    let live = true;
    const tick = () => void latestExternalAlerts().then((a) => { if (live) setAlerts(a); }).catch(() => {});
    const kick = setTimeout(tick, 0);
    const iv = setInterval(tick, 30_000);
    return () => { live = false; clearTimeout(kick); clearInterval(iv); };
  }, []);
  async function dismissAlert(id: string) {
    setAlerts((a) => a.filter((x) => x.id !== id));
    await markAlertHandled(id);
  }
  const [drawerKick, setDrawerKick] = useState(false);
  const autoPrintRef = useRef(false);
  const drawerKickRef = useRef(false);
  const kickBusyRef = useRef(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of persisted device settings
    setAutoPrint(localStorage.getItem("st-autoprint") === "1");
    setDrawerKick(localStorage.getItem("st-drawer") === "1");
  }, []);
  useEffect(() => {
    autoPrintRef.current = autoPrint;
    localStorage.setItem("st-autoprint", autoPrint ? "1" : "0");
  }, [autoPrint]);
  useEffect(() => {
    drawerKickRef.current = drawerKick;
    localStorage.setItem("st-drawer", drawerKick ? "1" : "0");
  }, [drawerKick]);
  function openDrawer() {
    // guard against a double-open if the pay action fires twice in quick succession
    if (!drawerKickRef.current || kickBusyRef.current) return;
    kickBusyRef.current = true;
    setTimeout(() => { kickBusyRef.current = false; }, 2500);
    // 9988, via the shared helper. This called 9977 directly — the port
    // print-client.ts:9 records as belonging to the PREVIOUS system's drawer
    // agent, which the two systems were explicitly kept apart over. So our
    // drawer never opened from this screen, and theirs might have.
    void kickDrawer();
  }

  // print queued tickets one by one
  const [tickets, setTickets] = useState<ReceiptData[]>([]);
  const seenIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!tickets.length) return;
    const t = setTimeout(() => {
      window.print();
      setTickets((q) => q.slice(1));
    }, 400);
    return () => clearTimeout(t);
  }, [tickets]);

  // ponytail: 5s poll — swap to Supabase realtime if volume grows.
  const refreshPending = useCallback(async () => {
    try {
      const orders = await listPendingOrders();
      setPending(orders);
      if (seenIds.current && autoPrintRef.current) {
        const fresh = orders.filter((o) => !seenIds.current!.has(o.id));
        if (fresh.length) {
          setTickets((q) => [
            ...q,
            ...fresh.map((o) => ticketFor(o, "طلب جديد — غير مدفوع")),
          ]);
        }
      }
      seenIds.current = new Set(orders.map((o) => o.id));
      setQueueErr(null);
    } catch (e) {
      // «لا توجد طلبات معلّقة» كذبةٌ حين يكون السبب استعلاماً مرفوضاً
      setQueueErr(e instanceof Error ? e.message : "تعذّر جلب الطلبات المعلّقة");
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling an external system; state is set after an await
    refreshPending();
    // خمس ثوانٍ كانت ١٧٬٢٨٠ استدعاءً يومياً. الطلب الجديد يصل عبر الزمن الحيّ
    // خلال ثانية؛ الاستطلاع لمن انقطع عنه الاشتراك.
    const t = setInterval(refreshPending, 20_000);
    let channel: ReturnType<ReturnType<typeof createSupabaseBrowserClient>["channel"]> | null = null;
    try {
      channel = createSupabaseBrowserClient()
        .channel("incoming-orders")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void refreshPending())
        .subscribe();
    } catch {
      /* بلا إعداد: الاستطلاع يحمل الشاشة */
    }
    return () => {
      clearInterval(t);
      if (channel) void createSupabaseBrowserClient().removeChannel(channel);
    };
  }, [refreshPending]);

  async function accept(id: string, method: "cash" | "card" | "partner", partnerId: string | null = null, o?: PendingOrder) {
    setQueueErr(null);
    // شركة «مخصّص» (زاد): المندوب يدفع الآن. الافتراضي = سعرنا ناقص أجرة التوصيل
    // التي ندفعها؛ حيث يدفعها الزبون للمندوب يكتب الكاشير الإجمالي كاملاً.
    // قبولٌ صامت بالافتراضي خطأ في نصف الحالات، فيُسأل. إلغاء = يبقى معلّقاً.
    let cash: number | null = null;
    if (method === "partner" && o?.partner_settlement === "custom") {
      const def = Math.max(0, o.subtotal - (o.partner_fee ?? 0));
      const v = window.prompt(
        `دفع المندوب الآن؟\nسعر النظام ${formatIqdLabel(o.subtotal)} · سعر الشركة ${o.partner_total ? formatIqdLabel(o.partner_total) : "—"}${o.partner_fee ? ` · أجرة التوصيل ${formatIqdLabel(o.partner_fee)}` : ""}`,
        String(def),
      );
      if (v == null) return;
      cash = Number(v.replace(/[^\d]/g, "")) || 0;
    }
    // `method` was taken and then dropped: payPendingOrder defaults to "cash",
    // so every card sale accepted here was booked as cash and counted into the
    // shift's expected drawer — a shortage the cashier is asked to explain at
    // close, for money that was never in the drawer to begin with.
    // A company order read off its own device arrives with the company attached:
    // one tap books it to them (credit or cash-at-pickup, per their settlement).
    const res = await payPendingOrder(id, 0, null, method, partnerId, cash);
    if (!res.ok) setQueueErr(res.error);
    else {
      if (method === "cash") openDrawer();
      // Paper comes from the agent now — receipt AND kitchen tickets, the same
      // slips a counter sale gets — and the order is marked printed so the
      // spooler does not print it twice. No agent here (a phone)? Left
      // unmarked; the till prints it within seconds.
      void (async () => {
        try {
          // a printer here ⇒ claim first, so no other tab prints it meanwhile
          if (await agentAlive(500)) await claimPrint(id);
          const { jobs } = await buildOrderJobs(id);
          const out = jobs.length ? await printJobs(jobs) : { sent: 0 };
          if (out.sent === 0) await releasePrint(id);
        } catch {
          /* the spooler will try */
        }
      })();
    }
    void refreshPending();
  }
  async function reject(id: string) {
    setQueueErr(null);
    const res = await cancelOrder(id);
    if (!res.ok) setQueueErr(res.error);
    void refreshPending();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <BellRing className="size-5 text-primary" />
          الطلبات الواردة
          {pending.length > 0 && (
            <span className="rounded-full bg-destructive px-2.5 py-0.5 text-sm font-bold text-destructive-foreground">{pending.length}</span>
          )}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <input type="checkbox" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} className="accent-[var(--accent)]" />
            🖨️ طباعة تلقائية للطلبات الواردة
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <input type="checkbox" checked={drawerKick} onChange={(e) => setDrawerKick(e.target.checked)} className="accent-[var(--accent)]" />
            💰 فتح القاصة عند الدفع
          </label>
        </div>
      </div>

      {queueErr && <p className="text-sm text-destructive">{queueErr}</p>}

      {pending.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
          <p className="text-lg font-semibold">لا توجد طلبات معلّقة</p>
          <p className="mt-1 text-sm">الطلبات الجديدة من الطاولات تظهر هنا فوراً مع جرس تنبيه.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {/* طلبات شركات التوصيل كما وصلت من جهازها: إن طابقت المنيو فهي بطاقة طلب
              أدناه أيضاً؛ وإلا فهذا كل ما يُعرف — الرقم، ليُفتح في تطبيقها ويُدخل. */}
          {alerts.map((a) => (
            <div key={a.id} className="flex flex-col rounded-2xl border-2 border-primary bg-primary/5 p-4 sm:col-span-full">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-lg font-black text-primary">
                  <PartnerLogo name={a.source} className="h-7" />
                  🛵 طلب {SOURCE_AR[a.source] ?? a.source}{a.ref ? ` #${a.ref}` : ""}
                </span>
                <span className="text-xs font-bold text-muted-foreground">{sinceLabel(ageMinutes(a.created_at))}</span>
              </div>
              {(a.title || a.body) && <p className="mt-1 whitespace-pre-line text-sm">{[a.title, a.body].filter(Boolean).join("\n")}</p>}
              {a.unknown_items?.length ? (
                <p className="mt-1 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-sm font-bold">
                  أصناف غير معروفة عندنا: {a.unknown_items.join("، ")} — تُربط مرّة واحدة من صفحة «شركات التوصيل»
                </p>
              ) : null}
              <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                <span className="font-bold text-muted-foreground">
                  {a.order_id ? "أُنشئ طلباً أدناه — اقبله" : a.unknown_items?.length ? "لم يُنشأ طلب — أدخله من الكاشير هذه المرّة" : "الأصناف لم تُطابَق — أدخلها من الكاشير كطلب توصيل"}
                </span>
                <button onClick={() => void dismissAlert(a.id)} className="rounded-lg border border-border px-3 py-1.5 font-bold hover:bg-secondary">
                  تمّ
                </button>
              </div>
            </div>
          ))}
          {pending.map((o) => {
            const age = ageMinutes(o.created_at);
            return (
              <div key={o.id} className="flex flex-col rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-2xl font-extrabold text-primary">#{String(o.order_seq).padStart(3, "0")}</span>
                  {o.table_no && (
                    <span className="rounded-full bg-primary px-3 py-1 text-sm font-bold text-primary-foreground">طاولة {o.table_no}</span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{CHANNEL_AR[o.channel] ?? o.channel}</span>
                  {SOURCE_AR[o.order_source] && (
                    <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-bold text-primary">
                      <PartnerLogo name={o.order_source} className="h-4" />
                      {SOURCE_AR[o.order_source]}
                    </span>
                  )}
                  <span>·</span>
                  <span className={age >= 10 ? "font-bold text-destructive" : ""}>{age === 0 ? "الآن" : `منذ ${sinceLabel(age)}`}</span>
                </div>
                {/* طلب من بعيد: من يطلب وأين — بلا هذين لا يستطيع الكاشير قبوله بثقة */}
                {(o.customer_name || o.customer_phone || o.address_note) && (
                  <div className="mt-2 space-y-0.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm">
                    {o.customer_name && <p className="font-bold">👤 {o.customer_name}</p>}
                    {o.customer_phone && <p className="tabular-nums" dir="ltr">📞 {o.customer_phone}</p>}
                    {o.address_note && <p>📍 {o.address_note}</p>}
                  </div>
                )}
                {o.partner_id && (o.partner_ref || o.partner_total) && (
                  <p className="mt-2 text-xs font-bold text-muted-foreground" dir="ltr">
                    {o.partner_ref ?? ""}{o.partner_total ? ` · سعر الشركة ${formatIqdLabel(o.partner_total)}` : ""}{o.partner_fee ? ` · توصيل ${formatIqdLabel(o.partner_fee)}` : ""}
                  </p>
                )}
                {o.note && (
                  <p className="mt-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-sm font-bold">📝 {o.note}</p>
                )}
                <ul className="my-3 flex-1 space-y-1 text-sm">
                  {o.items.map((it, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                      <span>
                        {it.name_ar}
                        {it.flavor_ar ? ` (${it.flavor_ar})` : ""}
                      </span>
                      <span className="font-semibold text-muted-foreground">×{it.qty}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                  <span className="text-lg font-extrabold">{formatIqdLabel(o.subtotal)}</span>
                  <div className="flex gap-1.5">
                    {o.partner_id ? (
                      <button onClick={() => accept(o.id, "partner", o.partner_id, o)} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
                        <PartnerLogo name={o.order_source} className="h-4" />
                        ✅ قبول — {SOURCE_AR[o.order_source] ?? "شركة"}
                      </button>
                    ) : (
                      <>
                        <button onClick={() => accept(o.id, "cash")} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
                          💵 نقدي
                        </button>
                        <button onClick={() => accept(o.id, "card")} className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground hover:opacity-90">
                          💳 كي كارد
                        </button>
                      </>
                    )}
                    <button onClick={() => reject(o.id)} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-destructive hover:bg-secondary">
                      إلغاء
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* print-only ticket */}
      {tickets[0] && <Receipt data={tickets[0]} />}
    </div>
  );
}
