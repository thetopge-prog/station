"use client";

import { Bike, Car, ShoppingBag, UtensilsCrossed } from "lucide-react";
import type { Fulfilment } from "@/lib/cafe/order-actions";

/**
 * «كيف تريد طلبك؟» — the four ways to receive an order.
 *
 * Shown ONLY to someone who opened the menu link directly. A customer who
 * scanned the QR sticker on table 5 arrives with ?t=5, and asking them where
 * they are sitting when we already know is the kind of question that makes an
 * app feel stupid — so that path skips this entirely.
 *
 * Each mode asks for the least it can get away with. Delivery cannot work
 * without an address, curbside cannot work without a phone, and dine-in needs
 * nothing but a headcount because the server picks the table.
 */

export type FulfilmentMode = "delivery" | "pickup" | "dinein" | "curbside";

/** dine-in rides the existing `qr` channel — it IS a QR-menu order, just one
 *  where the customer told us they are staying rather than the sticker doing it */
export const CHANNEL_OF: Record<FulfilmentMode, Fulfilment> = {
  delivery: "delivery",
  pickup: "pickup",
  dinein: "qr",
  curbside: "curbside",
};

type Spec = {
  mode: FulfilmentMode;
  label: string;
  hint: string;
  icon: typeof Bike;
};

export const MODES: Spec[] = [
  { mode: "delivery", label: "توصيل", hint: "نوصّله إلى عنوانك", icon: Bike },
  { mode: "pickup", label: "استلام من المطعم", hint: "نجهّزه ونغلّفه بانتظارك", icon: ShoppingBag },
  { mode: "dinein", label: "الأكل في المطعم", hint: "نحجز لك طاولة", icon: UtensilsCrossed },
  { mode: "curbside", label: "الطلب من السيارة", hint: "نسلّمك إياه دون نزولك", icon: Car },
];

export function FulfilmentPicker({
  value,
  onChange,
}: {
  value: FulfilmentMode | null;
  onChange: (m: FulfilmentMode) => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-black text-[var(--muted)]">كيف تريد طلبك؟</h3>
      <div className="grid grid-cols-2 gap-2">
        {MODES.map(({ mode, label, hint, icon: Icon }) => {
          const on = value === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onChange(mode)}
              aria-pressed={on}
              className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 py-3 text-center transition active:scale-95 ${
                on
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--activeink)]"
                  : "border-[var(--line)] bg-[var(--panel)] text-[var(--text)]"
              }`}
            >
              <Icon className="size-7" />
              <span className="text-sm font-black leading-tight">{label}</span>
              <span className={`text-[11px] font-bold leading-tight ${on ? "opacity-90" : "text-[var(--muted)]"}`}>{hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** What each mode must have before «إتمام الطلب» is allowed to fire. */
export function missingFields(
  mode: FulfilmentMode | null,
  f: { name: string; phone: string; address: string },
): string | null {
  if (!mode) return "اختر طريقة الاستلام";
  const phone = f.phone.trim();
  const needsPhone = mode === "delivery" || mode === "curbside";
  if (needsPhone && phone.length < 10) return "رقم الهاتف مطلوب";
  if (mode === "delivery" && f.address.trim().length < 5) return "العنوان مطلوب للتوصيل";
  return null;
}
