"use client";

import { useState } from "react";
import { Printer, Sparkles } from "lucide-react";
import { buildPrepSheetPrint } from "@/lib/cafe/prep-forecast-actions";
import type { PrepBoard } from "@/lib/cafe/prep-forecast-actions";
import { printJobs } from "@/lib/cafe/print-client";

/**
 * «التجهيز الذكي» — شاشةٌ مستقلّة في قائمة الإدارة.
 *
 * كانت مطويّةً أسفل شبكة الأصناف في الكاشير، فطلب المالك نقلها: «كي لا يسبب
 * ارتباك للكاشير». وهو محقّ — الكاونتر يُضغط فيه زرٌّ كل ثانية، وكلُّ ما يقع
 * تحت اليد في مسار البيع يُضغط بالخطأ ولو كان مطويّاً. فصارت باباً يُفتح حين
 * يُراد، لا شيئاً يقع تحت الإبهام.
 *
 * **ولا دينار عليها.** كمّياتٌ وأوقاتٌ فقط — قاعدة المالك أن الكاشير لا يرى
 * الأرباح، والمال لا يدخل هذا الملفّ أصلاً.
 */
export function PrepBoardPanel({ board }: { board: PrepBoard | null }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!board || !board.categories.length) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-border p-6 text-center font-black text-muted-foreground">
        ما عدنا بيانات كافية للخطة — تحتاج أيام بيع أكثر.
      </p>
    );
  }

  async function print(target: "counter" | "kitchen") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await buildPrepSheetPrint(target);
      if (!res.ok) return setMsg(res.error);
      const out = await printJobs([res.job]);
      setMsg(out.sent > 0 ? "خرجت الورقة ✓" : (out.errors[0] ?? "وكيل الطباعة لا يستجيب"));
    } catch (e) {
      // بلا هذا يبقى الزرّ يدور بصمت — وهي العلّة نفسها التي أسكتت المصروف السريع
      setMsg(e instanceof Error ? e.message : "تعذّرت الطباعة.");
    } finally {
      setBusy(false);
    }
  }

  const tint = (c: string) =>
    c === "قوي" ? "text-primary" : c === "متوسّط" ? "text-amber-600" : "text-muted-foreground";

  return (
    <div className="mx-auto w-full max-w-2xl rounded-2xl border-2 border-border bg-card p-4">
      <h1 className="flex items-center gap-2 text-xl font-black">
        <Sparkles className="size-5 text-primary" />
        التجهيز الذكي
        <span className="text-sm font-bold text-muted-foreground">
          — متوقَّع اليوم {board.orders.orders} طلب
        </span>
      </h1>

      <p className="mt-2 text-sm font-bold text-muted-foreground">
        ذروة المحل: <span className="font-black text-foreground">{board.peak}</span>
      </p>

      <h3 className="mt-4 font-black">بالأقسام</h3>
      <ul className="mt-2 space-y-2">
        {board.categories.map((c) => (
          <li key={c.name} className="rounded-xl bg-secondary p-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-black">{c.name}</span>
              <span className="font-black text-primary">{c.qty} قطعة</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-bold text-muted-foreground">
              {c.bands
                .filter((b) => b.qty > 0)
                .map((b) => (
                  <span key={b.label}>
                    {b.label}: <span className="font-black text-foreground">{b.qty}</span>
                  </span>
                ))}
              <span>الذروة: {c.peakHours}</span>
            </div>
          </li>
        ))}
      </ul>

      {board.items.length > 0 && (
        <>
          <h3 className="mt-4 font-black">أعلى الأصناف</h3>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {board.items.map((i) => (
              <li key={i.name} className="flex items-baseline justify-between gap-2 text-sm font-bold">
                <span className="truncate">{i.name}</span>
                <span className="shrink-0">
                  <span className="font-black">{i.qty}</span>
                  <span className={"ms-1 text-xs " + tint(i.confidence)}>{i.confidence}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => void print("counter")}
          disabled={busy}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-border font-black disabled:opacity-50"
        >
          <Printer className="size-4" />
          اطبع بالكاونتر
        </button>
        <button
          onClick={() => void print("kitchen")}
          disabled={busy}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary font-black text-primary-foreground disabled:opacity-50"
        >
          <Printer className="size-4" />
          اطبع بالمطبخ
        </button>
      </div>
      {msg && <p className="mt-2 text-center text-sm font-black text-primary">{msg}</p>}

      {/*
        المدى مكتوبٌ تحت الأرقام لا في شرحٍ شفهي: رقمٌ لا يقول كم يعرف يُصدَّق
        أكثر مما يستحقّ، ويُجهَّز عليه ويُلام حين يخطئ.
      */}
      <p className="mt-3 text-xs font-bold leading-relaxed text-muted-foreground">
        تقدير مبنيّ على {board.orders.days} يوم بيع، ومن {board.orders.samples} يوم مماثل من الأسبوع.
        الأقسام أدقّ من الأصناف، ويتحسّن كل أسبوع تجمع فيه بياناتٍ أكثر — والعين أصدق منه في المناسبات والأعياد.
      </p>
    </div>
  );
}
