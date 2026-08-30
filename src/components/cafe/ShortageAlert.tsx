"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Ban, MessageCircle, Phone } from "lucide-react";
import { CopyButton } from "./CopyButton";
import { formatIqdLabel } from "@/lib/cafe/money";
import { ackShortage, pendingShortage, type Shortage } from "@/lib/cafe/shortage-actions";

/**
 * «صنف نفد» — full screen on the till, because it cannot be missed.
 *
 * This is the one alert in the system that deliberately takes the whole screen.
 * Everything else can wait for a glance; this cannot. Somewhere a bag is being
 * closed with an item missing, the total has already changed, and a customer is
 * about to be surprised at the door unless somebody rings them first.
 *
 * It carries the sentence to say, so the cashier is not composing an apology
 * under pressure, and the number to say it to. It stays until acknowledged —
 * an alert that disappears on its own is an alert nobody acted on.
 *
 * Three ways to reach the customer, because the till is a Windows PC and
 * `tel:` on Windows opens a "how do you want to open this?" dialog at best.
 * The number is offered as a dial link (right on a tablet), a WhatsApp link
 * (right on the shop's phone and on Windows, where WhatsApp Desktop or Web
 * picks it up), and a copy button, which is right everywhere.
 */

const POLL_MS = 6000;

/**
 * The apology, pre-written, addressed to the customer's own WhatsApp.
 *
 * Local numbers are folded to E.164 because wa.me refuses anything else — a
 * link that silently opens an empty chat is worse than no button.
 */
function waLink(phone: string, items: string[]): string {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? `964${digits.slice(1)}` : digits;
  const body = `عذراً، ${items.join(" و")} غير متوفر حالياً. سيتم احتساب السعر الجديد، أو نضيف لك صنفاً آخر تختاره — أيهما تفضّل؟`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(body)}`;
}

export function ShortageAlert() {
  const [s, setS] = useState<Shortage | null>(null);

  const poll = useCallback(async () => {
    try {
      setS(await pendingShortage());
    } catch {
      /* never let an alert break the till it is drawn on */
    }
  }, []);

  useEffect(() => {
    const kick = setTimeout(() => void poll(), 0);
    const t = setInterval(() => void poll(), POLL_MS);
    return () => {
      clearTimeout(kick);
      clearInterval(t);
    };
  }, [poll]);

  if (!s) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-destructive/95 p-6 text-white" role="alertdialog" aria-modal="true">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 text-center">
        <AlertTriangle className="mx-auto size-16 animate-pulse" />

        <div>
          <p className="text-3xl font-black">صنف غير متوفر</p>
          <p className="mt-1 text-lg font-bold opacity-90">
            الطلب #{String(s.orderSeq).padStart(3, "0")}
            {s.customerName ? ` · ${s.customerName}` : ""}
          </p>
        </div>

        <div className="rounded-2xl bg-white/15 p-4">
          <p className="flex items-center justify-center gap-2 text-2xl font-black">
            <Ban className="size-6 shrink-0" />
            {s.items.join(" · ")}
          </p>
        </div>

        {/* the sentence, ready to read out — nobody composes an apology well
            while a queue is waiting */}
        <div className="rounded-2xl border-2 border-white/40 p-4 text-lg font-bold leading-relaxed">
          «عذراً، الصنف غير موجود حالياً — سيتم احتساب السعر الجديد، أو نضيف لك صنفاً آخر تختاره.»
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl bg-white/15 p-3">
            <p className="text-xs font-bold opacity-80">المجموع الجديد</p>
            <p className="text-2xl font-black tabular-nums">{formatIqdLabel(s.newTotal)}</p>
          </div>
          {s.refundDue > 0 && (
            <div className="rounded-2xl bg-white p-3 text-destructive">
              <p className="text-xs font-black">الطلب مدفوع — أعِد للزبون</p>
              <p className="text-2xl font-black tabular-nums">{formatIqdLabel(s.refundDue)}</p>
            </div>
          )}
        </div>

        {s.phone ? (
          <div className="space-y-2">
            <p className="text-3xl font-black tabular-nums" dir="ltr">
              {s.phone}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <a
                href={`tel:${s.phone}`}
                className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white font-black text-destructive"
              >
                <Phone className="size-5" />
                اتصال
              </a>
              <a
                href={waLink(s.phone, s.items)}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white font-black text-destructive"
              >
                <MessageCircle className="size-5" />
                واتساب
              </a>
              <CopyButton value={s.phone} label="نسخ الرقم" className="min-h-14 justify-center border-white bg-white text-destructive" />
            </div>
          </div>
        ) : (
          <p className="rounded-2xl bg-white/15 p-4 text-lg font-black">
            لا يوجد رقم هاتف لهذا الطلب — أبلِغ الزبون عند الاستلام
          </p>
        )}

        <button
          onClick={() => void ackShortage(s.orderId).then(() => setS(null))}
          className="min-h-16 rounded-2xl border-2 border-white text-xl font-black"
        >
          تم — أبلغتُ الزبون
        </button>
      </div>
    </div>
  );
}
