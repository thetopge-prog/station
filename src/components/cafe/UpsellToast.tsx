"use client";

import { useEffect } from "react";
import { Plus, X } from "lucide-react";
import { formatIqdLabel } from "@/lib/cafe/money";
import type { Upsell } from "@/lib/cafe/upsell";

/**
 * The nudge.
 *
 * Deliberately a toast and not a modal: a modal stops someone mid-decision and
 * demands an answer, which on a menu is how you lose the sale you were about to
 * make. This slides in above the cart bar, can be ignored entirely, and leaves
 * on its own.
 *
 * It offers the PAIR — the item being looked at plus the add-on — and says so.
 * The first version added only the side, so «أضف الويدجز معه» put chips in the
 * basket and left the pizza behind. If the wording promises "with it", the
 * button has to deliver "with it".
 */

const COPY: Record<Upsell["reason"], string> = {
  side: "🍟 يبدو شهياً — أضفهما معاً؟",
  sauce: "😋 تحلو مع صوص — أضفهما معاً؟",
  main: "🍔 تكملها بوجبة — أضفهما معاً؟",
};

export function UpsellToast({
  upsell,
  onAddBoth,
  onAddSideOnly,
  onClose,
  autoHideMs = 9000,
}: {
  upsell: Upsell;
  /** the headline action: the item they were looking at AND the add-on */
  onAddBoth: () => void;
  /** for someone who already has the main in hand and just wants the side */
  onAddSideOnly: () => void;
  onClose: () => void;
  autoHideMs?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, autoHideMs);
    return () => clearTimeout(t);
  }, [onClose, autoHideMs, upsell.focus.id, upsell.item.id]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-24 z-30 mx-auto max-w-md animate-[st-card-in_.35s_both]"
    >
      <div className="rounded-2xl border-2 border-[var(--accent)] bg-[var(--panelsoft)] p-3 shadow-lg">
        <div className="mb-2 flex items-start justify-between gap-2">
          <p className="text-sm font-black text-[var(--text)]">{COPY[upsell.reason]}</p>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="-m-1 shrink-0 rounded-full p-1 text-[var(--muted)] transition active:scale-90"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* both items named explicitly — no surprises in the basket */}
        <ul className="mb-2 space-y-0.5 text-xs font-bold text-[var(--muted)]">
          <li className="flex justify-between gap-2">
            <span className="truncate text-[var(--text)]">{upsell.focus.name_ar}</span>
            <span className="shrink-0 tabular-nums">{formatIqdLabel(upsell.focus.price)}</span>
          </li>
          <li className="flex justify-between gap-2">
            <span className="truncate text-[var(--text)]">+ {upsell.item.name_ar}</span>
            <span className="shrink-0 tabular-nums">{formatIqdLabel(upsell.item.price)}</span>
          </li>
        </ul>

        <div className="flex items-center gap-2">
          <button
            onClick={onAddBoth}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-3 font-black text-[var(--activeink)] transition active:scale-95"
          >
            <Plus className="size-5" />
            أضف الاثنين · {formatIqdLabel(upsell.total)}
          </button>
          <button
            onClick={onAddSideOnly}
            className="min-h-11 shrink-0 rounded-xl border-2 border-[var(--line)] px-3 text-xs font-bold text-[var(--muted)] transition active:scale-95"
          >
            {upsell.item.name_ar} فقط
          </button>
        </div>
      </div>
    </div>
  );
}
