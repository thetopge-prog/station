"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Target, TrendingUp } from "lucide-react";
import { formatIqdLabel } from "@/lib/cafe/money";
import { getBep, getRecommendations, type Bep, type Recommendation } from "@/lib/cafe/bep-actions";

/**
 * نقطة التعادل — how much of today's fixed cost the shop has actually earned back.
 *
 * Gross profit versus one day's share of rent, utilities and wages. Not a
 * forecast: money already taken minus the cost of what was sold.
 *
 * When the numbers are not configured this refuses to render a progress bar and
 * says what is missing instead. A bar sitting at 100% because every cost is
 * zero would be believed, and would be the single most misleading thing on the
 * screen.
 */
export function BreakEvenCard() {
  const [bep, setBep] = useState<Bep | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [b, r] = await Promise.all([getBep(), getRecommendations(6)]);
      setBep(b);
      setRecs(r);
    } catch {
      /* leave the last good figures */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    const poll = setInterval(() => void refresh(), 60_000);
    return () => {
      clearTimeout(t);
      clearInterval(poll);
    };
  }, [refresh]);

  if (!loaded) {
    return <div className="rounded-2xl border-2 border-dashed border-border p-6 text-center font-bold text-muted-foreground">…</div>;
  }

  if (!bep?.configured) {
    return (
      <div className="rounded-2xl border-2 border-kraft bg-kraft/10 p-5">
        <h2 className="flex items-center gap-2 text-lg font-black">
          <Target className="size-5" />
          نقطة التعادل
        </h2>
        <p className="mt-2 text-sm font-bold">
          لم تُدخَل التكاليف بعد، فلا يمكن حساب نقطة التعادل. مطلوب أمران:
        </p>
        <ul className="mt-2 space-y-1 text-sm font-bold text-muted-foreground">
          <li>· التكاليف الشهرية (إيجار، كهرباء، مولد، مياه) من «المصروفات»</li>
          <li>· تكلفة كل صنف من «المنيو» — بدونها الهامش يبدو ١٠٠٪</li>
        </ul>
      </div>
    );
  }

  const pct = bep.fixed_cost > 0 ? Math.min(100, Math.round((bep.gross_profit / bep.fixed_cost) * 100)) : 0;

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border-2 p-5 ${bep.met ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <Target className="size-5 text-primary" />
            نقطة التعادل اليوم
          </h2>
          <p className="text-sm font-bold text-muted-foreground">
            التكلفة الثابتة {formatIqdLabel(bep.fixed_cost)} · {bep.orders_count} طلب
          </p>
        </div>

        <div className="mt-3 h-4 overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full rounded-full transition-[width] duration-700 ${bep.met ? "bg-primary" : "bg-kraft"}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-2xl font-black tabular-nums">
            {formatIqdLabel(bep.gross_profit)}
            <span className="ms-2 text-sm font-bold text-muted-foreground">ربح إجمالي</span>
          </p>
          {bep.met ? (
            <p className="flex items-center gap-1.5 text-lg font-black text-primary">
              <TrendingUp className="size-5" />
              تجاوزنا التعادل — الربح صافٍ من الآن
            </p>
          ) : (
            <p className="text-lg font-black text-destructive">يتبقّى {formatIqdLabel(bep.remaining)}</p>
          )}
        </div>
      </div>

      {/* the engine only pushes while there is still ground to make up */}
      {!bep.met && recs.length > 0 && (
        <div className="rounded-2xl border-2 border-border bg-card p-5">
          <h3 className="flex items-center gap-2 font-black">
            <Sparkles className="size-5 text-primary" />
            ادفع هذه الأصناف الآن
          </h3>
          <p className="mb-3 text-xs font-bold text-muted-foreground">
            الأعلى مساهمة في تغطية التكلفة الثابتة — والأقرب انتهاءً أولاً
          </p>
          <ul className="space-y-1.5">
            {recs.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/60 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-bold">{r.name_ar}</p>
                  <p className="text-xs font-bold text-muted-foreground">
                    {r.reason}
                    {r.expiry_pressure !== null && r.expiry_pressure <= 2 && " ⚠"}
                  </p>
                </div>
                <p className="shrink-0 text-left text-sm font-black tabular-nums text-primary">
                  +{formatIqdLabel(r.margin)}
                  <span className="block text-[11px] font-bold text-muted-foreground">{r.margin_pct}%</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recs.length === 0 && (
        <p className="rounded-2xl border-2 border-dashed border-border p-4 text-center text-sm font-bold text-muted-foreground">
          لا توجد توصيات — أدخل تكلفة الأصناف من «المنيو» ليعمل المحرّك.
        </p>
      )}
    </div>
  );
}
