"use client";

import { useState } from "react";
import { ChefHat, Sparkles, X } from "lucide-react";
import { formatIqdLabel } from "@/lib/cafe/money";
import { getChefPicks, type ChefPick } from "@/lib/cafe/bep-actions";

/**
 * «على ذوقكم» — the chef's recommendation.
 *
 * Honestly: it is the shop's highest-margin items, with anything whose
 * ingredients are about to expire pushed to the front. The customer sees a
 * curated combo; the shop sees margin protected and waste avoided.
 *
 * One rule that keeps it from feeling algorithmic: one item per category. Three
 * burgers is not a combo, it is a list — and a customer can tell the difference
 * instantly, at which point the whole "chef chose this" framing collapses.
 *
 * Returns nothing at all when item costs are unset, rather than suggesting at
 * random. A bad recommendation costs more trust than a missing one.
 */
export function SurpriseMe({
  variant = "customer",
  onAdd,
}: {
  variant?: "customer" | "pos";
  /** POS only — drop the whole combo into the open order */
  onAdd?: (picks: ChefPick[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [picks, setPicks] = useState<ChefPick[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function suggest() {
    setBusy(true);
    setOpen(true);
    try {
      setPicks(await getChefPicks(3));
    } finally {
      setBusy(false);
    }
  }

  const total = (picks ?? []).reduce((s, p) => s + p.price, 0);
  const pos = variant === "pos";

  return (
    <>
      <button
        onClick={() => void suggest()}
        className={
          pos
            ? "flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl border-2 border-primary text-lg font-black text-primary transition hover:bg-primary hover:text-primary-foreground"
            : "flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-lg font-black text-[var(--activeink)] shadow-lg transition active:scale-[0.99]"
        }
      >
        <Sparkles className="size-5" />
        على ذوقكم
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-sm rounded-3xl bg-card p-6 text-center text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <ChefHat className="size-8" />
            </div>
            <h2 className="mt-3 text-xl font-black">اختيار الشيف</h2>

            {busy || picks === null ? (
              <p className="py-8 font-bold text-muted-foreground">…</p>
            ) : picks.length === 0 ? (
              <p className="py-6 text-sm font-bold text-muted-foreground">
                لا توجد اقتراحات الآن — جرّب المنيو كاملاً.
              </p>
            ) : (
              <>
                <p className="mt-1 mb-4 text-sm font-bold text-muted-foreground">جرّبها معاً — اختيارنا لهذا اليوم</p>
                <ul className="space-y-2 text-right">
                  {picks.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border-2 border-border px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-black">{p.name_ar}</p>
                        <p className="text-xs font-bold text-muted-foreground">{p.category_name}</p>
                      </div>
                      <p className="shrink-0 font-black tabular-nums text-primary">{formatIqdLabel(p.price)}</p>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex items-center justify-between border-t-2 border-border pt-3">
                  <span className="font-black">المجموع</span>
                  <span className="text-xl font-black tabular-nums text-primary">{formatIqdLabel(total)}</span>
                </div>

                {pos && onAdd && (
                  <button
                    onClick={() => {
                      onAdd(picks);
                      setOpen(false);
                    }}
                    className="mt-4 min-h-14 w-full rounded-xl bg-primary font-black text-primary-foreground shadow-station"
                  >
                    أضف الكومبو للطلب
                  </button>
                )}
              </>
            )}

            <button
              onClick={() => setOpen(false)}
              className="mt-3 flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-border font-black"
            >
              <X className="size-4" />
              إغلاق
            </button>
          </div>
        </div>
      )}
    </>
  );
}
