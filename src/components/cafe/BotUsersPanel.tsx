"use client";

import { Bot, MessageCircle } from "lucide-react";
import { whatsappOrderLink } from "@/lib/brand";
import { formatIqdLabel } from "@/lib/cafe/money";
import type { BotUser } from "@/lib/cafe/bot-users";

/**
 * جدول زبائن بوت واتساب.
 *
 * وعمود «وقف عند» هو سبب الجدول: محادثةٌ وقفت عند العنوان وسلّتها ثلاثون ألفاً
 * ليست إحصاءً، هي طلبٌ ينتظر مكالمة. ولذلك زرُّ «راسله» في آخر كل صفّ.
 *
 * ولا مجاميع دينارية في رأس الجدول غير مجموع السلّات المعلّقة — وهي ليست بيعاً
 * فلا تكشف أرباحاً، والصفحة للإدارة وحدها أصلاً.
 */

const when = (iso: string) =>
  new Date(iso).toLocaleString("ar-IQ", {
    timeZone: "Asia/Baghdad",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function BotUsersPanel({ rows }: { rows: BotUser[] }) {
  const pending = rows.filter((r) => r.cartCount > 0);
  const waiting = pending.reduce((t, r) => t + r.cartTotal, 0);

  return (
    <details className="rounded-2xl border-2 border-border bg-card">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-4 text-lg font-black">
        <Bot className="size-5 text-primary" />
        زبائن بوت واتساب
        <span className="text-sm font-bold text-muted-foreground">
          {rows.length} محادثة
          {pending.length ? ` · ${pending.length} سلّة معلّقة بـ${formatIqdLabel(waiting)}` : ""}
        </span>
      </summary>

      {!rows.length ? (
        <p className="px-4 pb-4 text-sm font-bold text-muted-foreground">ما كلّم أحد البوت بعد.</p>
      ) : (
        <div className="overflow-x-auto px-4 pb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-right text-muted-foreground">
                <th className="py-2 font-bold">الزبون</th>
                <th className="py-2 font-bold">وقف عند</th>
                <th className="py-2 font-bold">السلّة</th>
                <th className="py-2 font-bold">طلباته</th>
                <th className="py-2 font-bold">آخر رسالة</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.waId} className="border-b border-border/60 last:border-0">
                  <td className="py-2 font-black">
                    {r.name ?? (r.phone ?? `+${r.waId}`)}
                    {r.phone && r.name && <span className="ms-2 font-bold text-muted-foreground">{r.phone}</span>}
                    {r.foreign && <span className="ms-2 rounded-full bg-secondary px-2 text-xs font-black">رقم أجنبي</span>}
                  </td>
                  <td className="py-2 font-bold">{r.step}</td>
                  <td className="py-2 font-bold">
                    {r.cartCount ? `${r.cartCount} صنف · ${formatIqdLabel(r.cartTotal)}` : "—"}
                  </td>
                  <td className="py-2 font-bold">{r.orders || "—"}</td>
                  <td className="py-2 font-bold whitespace-nowrap">{when(r.lastSeen)}</td>
                  <td className="py-2 text-end">
                    <a
                      href={whatsappOrderLink("هلا بيك 🌟 شفت إنك كنت تطلب من المنيو — أكمّللك الطلب؟", r.waId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-9 items-center gap-1 rounded-full border-2 border-[#25D366] px-3 text-xs font-black text-[#25D366] transition hover:bg-[#25D366] hover:text-white"
                    >
                      <MessageCircle className="size-3.5" />
                      راسله
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
