"use client";

import { useEffect, useRef, useState } from "react";
import { Printer, Search } from "lucide-react";
import { listOrdersByDay, type HistoryOrder } from "@/lib/cafe/history-actions";
import { buildReceiptJob } from "@/lib/cafe/printer-actions";
import { printJobs } from "@/lib/cafe/print-client";
import { formatIqdLabel } from "@/lib/cafe/money";

/**
 * سجلّ الطلبات — يوم، وبحث، وإعادة طباعة.
 *
 * البحث يُرسَل بعد توقّف الكتابة لا مع كل حرف: طلب خادمي لكل ضغطة على شاشة
 * الكاونتر إسراف بلا فائدة. وإعادة الطباعة تسلك مسار الكاشير نفسه
 * (buildReceiptJob + printJobs) فتخرج الورقة مطابقة للأصل حرفاً بحرف.
 */

const CHANNEL_AR: Record<string, string> = { cashier: "كاشير", qr: "طاولة", kiosk: "كشك", delivery: "توصيل", pickup: "استلام", curbside: "من السيارة" };
const SOURCE_AR: Record<string, string> = { telegram: "تليغرام", whatsapp: "واتساب", web: "الموقع", toters: "توترز", talabaty: "طلباتي" };
const STATUS_AR: Record<string, string> = { pending: "معلّق", paid: "مدفوع", cancelled: "ملغي", refunded: "مسترجع" };
const PAY_AR: Record<string, string> = { cash: "نقد", card: "بطاقة", partner: "شركة توصيل" };

const time = (iso: string) => new Intl.DateTimeFormat("ar-IQ", { timeZone: "Asia/Baghdad", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function HistoryClient({ initialDay, initialOrders }: { initialDay: string; initialOrders: HistoryOrder[] }) {
  const [day, setDay] = useState(initialDay);
  const [q, setQ] = useState("");
  const [orders, setOrders] = useState<HistoryOrder[]>(initialOrders);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const first = useRef(true);

  // يُعاد الجلب بعد ٣٠٠ مللي ثانية من آخر تغيير — لا مع كل حرف
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      setBusy(true);
      listOrdersByDay(day, q).then(setOrders).catch(() => setOrders([])).finally(() => setBusy(false));
    }, 300);
    return () => clearTimeout(t);
  }, [day, q]);

  async function reprint(id: string, seq: number) {
    setMsg(null);
    try {
      const job = await buildReceiptJob(id, 1);
      if (!job) return setMsg("لا توجد طابعة كاشير مفعّلة.");
      const out = await printJobs([job]);
      setMsg(out.sent > 0 ? `طُبع إيصال ${String(seq).padStart(3, "0")} ✓` : out.errors[0] ?? "الطابعة لم تستجب.");
    } catch {
      setMsg("تعذّرت الطباعة.");
    }
  }

  const total = orders.filter((o) => o.status === "paid").reduce((s, o) => s + o.total, 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">سجلّ الطلبات</h1>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
        <input
          type="date"
          value={day}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setDay(e.target.value)}
          dir="ltr"
          className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <label className="flex min-h-11 min-w-56 flex-1 items-center gap-2 rounded-lg border border-input bg-background px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="رقم الطلب · الهاتف · الاسم"
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>
        <span className="text-sm font-bold text-muted-foreground">
          {busy ? "…" : `${orders.length} طلب · ${formatIqdLabel(total)}`}
        </span>
      </div>

      {msg && <p className="rounded-xl bg-secondary p-2.5 text-sm font-bold">{msg}</p>}

      {orders.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-border p-8 text-center font-bold text-muted-foreground">
          {busy ? "…" : "لا طلبات في هذا اليوم."}
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((o) => (
            <li key={o.id} className={`flex flex-col rounded-2xl border bg-card p-4 ${o.status === "cancelled" || o.status === "refunded" ? "border-destructive/40 opacity-70" : "border-border"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-2xl font-extrabold text-primary">#{String(o.order_seq).padStart(3, "0")}</span>
                <span className="text-xs font-bold text-muted-foreground tabular-nums" dir="ltr">{time(o.created_at)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="rounded-full bg-secondary px-2 py-0.5 font-bold">{CHANNEL_AR[o.channel] ?? o.channel}</span>
                {SOURCE_AR[o.order_source] && <span className="rounded-full bg-secondary px-2 py-0.5 font-bold text-primary">{SOURCE_AR[o.order_source]}</span>}
                {o.table_no && <span className="rounded-full bg-secondary px-2 py-0.5 font-bold">طاولة {o.table_no}</span>}
                <span className={`rounded-full px-2 py-0.5 font-bold ${o.status === "paid" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                  {STATUS_AR[o.status] ?? o.status}
                </span>
                {o.payment_method && <span className="text-muted-foreground">{PAY_AR[o.payment_method] ?? o.payment_method}</span>}
              </div>
              {(o.customer_name || o.customer_phone || o.address_note) && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {[o.customer_name, o.customer_phone, o.address_note].filter(Boolean).join(" · ")}
                </p>
              )}
              <ul className="my-3 flex-1 space-y-0.5 text-sm">
                {o.items.map((it, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>{it.qty > 1 ? `${it.qty} × ` : ""}{it.name_ar}{it.flavor_ar ? ` (${it.flavor_ar})` : ""}</span>
                    <span className="tabular-nums text-muted-foreground">{formatIqdLabel(it.line_total)}</span>
                  </li>
                ))}
              </ul>
              {o.note && <p className="mb-2 rounded-lg bg-secondary px-2 py-1 text-xs font-bold">📝 {o.note}</p>}
              <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
                <span className="font-black tabular-nums">{formatIqdLabel(o.total)}</span>
                <button
                  onClick={() => void reprint(o.id, o.order_seq)}
                  className="touch-pos flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-bold hover:bg-secondary"
                >
                  <Printer className="size-4" />
                  إعادة طباعة
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
