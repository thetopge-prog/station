"use client";

import { Activity, ArrowDownRight, ArrowUpRight, Minus, Store, TrendingUp } from "lucide-react";
import type { KitchenWatch, CatReport } from "@/lib/cafe/kitchen-watch-actions";

/**
 * مراقبة المطبخ — ما تحرّك هذا الأسبوع، ولماذا.
 *
 * وأول ما تراه العين **حركة المحل كلّه**، لا الأقسام. لأنها المسطرة: قسمٌ نزل
 * ٢٢٪ ومحلٌّ نزل ٢٠٪ لم يحدث له شيء. ووضعُ المسطرة فوق الجدول يجعل كل رقمٍ
 * تحتها يُقرأ صحيحاً من أول نظرة.
 *
 * وترتيب الأقسام من الأعلى صعوداً إلى الأدنى نزولاً: الرأس للتوسّع، والذيل
 * للعلاج، والوسط لا يحتاج وقتاً.
 */

const TONE: Record<CatReport["trend"], { cls: string; icon: React.ReactNode }> = {
  صاعد: { cls: "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30", icon: <ArrowUpRight className="size-5 text-emerald-600" /> },
  نازل: { cls: "border-destructive bg-destructive/5", icon: <ArrowDownRight className="size-5 text-destructive" /> },
  ثابت: { cls: "border-border bg-card", icon: <Minus className="size-5 text-muted-foreground" /> },
};

const sign = (n: number) => (n > 0 ? `+${n}` : String(n));

export function KitchenWatchClient({ data }: { data: KitchenWatch }) {
  const up = data.cats.filter((c) => c.trend === "صاعد");
  const down = data.cats.filter((c) => c.trend === "نازل");

  return (
    <div dir="rtl" className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Activity className="size-6 text-primary" />
          مراقبة المطبخ
        </h1>
        <p className="text-sm font-bold text-muted-foreground">
          أسبوع {data.from} ← {data.to} مقابل الأسبوع الذي قبله
        </p>
      </div>

      {/* المسطرة أولاً: بدونها كل رقمٍ تحتها يُقرأ خطأً */}
      <section className="rounded-2xl border-2 border-primary/40 bg-secondary p-4">
        <p className="flex items-center gap-1.5 text-base font-black">
          <Store className="size-5 text-primary" />
          حركة المحل كلّه
        </p>
        <p className="mt-1 text-3xl font-black">
          {sign(data.shopPct)}٪
          <span className="ms-2 align-middle text-sm font-bold text-muted-foreground">
            {data.shopPrior} ← {data.shopRecent} طلب
          </span>
        </p>
        <p className="mt-1.5 text-xs font-bold leading-relaxed text-muted-foreground">
          كل نسبةٍ تحت مقيسةٌ <b>بعد طرح هذه</b>. فقسمٌ نزل مثل المحل لم ينزل — الزبائن قلّوا،
          والقسم على حاله.
        </p>
      </section>

      {up.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-lg font-black">
            <TrendingUp className="size-5 text-emerald-600" />
            يستحقّ الاهتمام ({up.length})
          </h2>
          <div className="space-y-2">{up.map((c) => <Card key={c.name} c={c} />)}</div>
        </section>
      )}

      {down.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-black text-destructive">يحتاج مراجعة ({down.length})</h2>
          <div className="space-y-2">{down.map((c) => <Card key={c.name} c={c} />)}</div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-lg font-black">على حاله</h2>
        <div className="space-y-2">
          {data.cats.filter((c) => c.trend === "ثابت").map((c) => <Card key={c.name} c={c} />)}
        </div>
      </section>

      <p className="rounded-xl border-2 border-border bg-card px-3 py-2 text-xs font-bold leading-relaxed text-muted-foreground">
        الأسباب <b>مرشَّحة لا مؤكَّدة</b> — النظام يشهد بما في بياناته وحدها: تغيّر سعر، أو توقّف بيع،
        أو هدوء المحل. ولا يعرف أن الطبّاخ تغيّر ولا أن منافساً فتح. وسببٌ مخترع أسوأ من لا سبب.
      </p>
    </div>
  );
}

function Card({ c }: { c: CatReport }) {
  const t = TONE[c.trend];
  return (
    <div className={`rounded-2xl border-2 p-3 ${t.cls}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-lg font-black">
          {t.icon}
          {c.name}
        </p>
        <p className="text-sm font-bold">
          <span className="text-xl font-black">{sign(c.relativePct)}٪</span>
          <span className="ms-2 text-muted-foreground">
            {c.prior} ← {c.recent} قطعة
            {c.changePct !== c.relativePct && <span className="ms-1">(خام {sign(c.changePct)}٪)</span>}
          </span>
        </p>
      </div>

      {c.movers.length > 0 && (
        <p className="mt-2 text-sm font-bold">
          <span className="text-muted-foreground">الأصناف التي حرّكته: </span>
          {c.movers.map((m, i) => (
            <span key={m.name}>
              {i > 0 && " · "}
              <b>{m.name}</b> {m.prior}←{m.recent}
            </span>
          ))}
        </p>
      )}

      <ul className="mt-2 space-y-1">
        {c.why.map((w) => (
          <li key={w} className="text-sm font-black leading-relaxed">↳ {w}</li>
        ))}
      </ul>
    </div>
  );
}
