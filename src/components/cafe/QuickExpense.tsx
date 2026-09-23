"use client";

import { useEffect, useRef, useState } from "react";
import { Wallet, X } from "lucide-react";
import { addExpense } from "@/lib/cafe/expense-actions";
import { PriceInput } from "./PriceInput";

/**
 * مصروف بضغطة — من أي شاشة.
 *
 * ثمانية مصاريف ونصف في اليوم، وكلّها تُكتب والطابور واقف: ثلج، غاز، أجرة
 * مندوب. ونقل الموظّف إلى صفحة المصروفات ثم إعادته إلى الكاشير يكلّف أكثر من
 * المصروف نفسه — و`addExpense` لا تطلب إلا مبلغاً، فهذه الخانتان تكفيان.
 *
 * والتفاصيل (الشركة، التاريخ السابق، من دفع من خارج الدرج) تبقى في صفحتها:
 * هي حالات الإدارة لا حالات الكاونتر.
 */

const QUICK = ["مشتريات", "أجرة توصيل", "صيانة", "أخرى"];

export function QuickExpense({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState(QUICK[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // المؤشّر في خانة المبلغ فوراً: الموظّف فتحها ليكتب رقماً لا ليبحث عنها
  useEffect(() => {
    box.current?.querySelector("input")?.focus();
  }, []);

  async function save() {
    if (amount <= 0 || busy) return;
    setBusy(true);
    setMsg(null);
    const res = await addExpense({ amount, category, note });
    setBusy(false);
    if (!res.ok) return setMsg(res.error);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div ref={box} className="w-full max-w-sm space-y-3 rounded-2xl bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="flex items-center gap-2 text-lg font-black">
          <Wallet className="size-5 text-primary" />
          مصروف سريع
        </h3>

        <label className="block space-y-1 text-sm">
          <span className="font-bold text-muted-foreground">المبلغ</span>
          <PriceInput value={amount} onChange={setAmount} />
        </label>

        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`min-h-10 rounded-full px-3 text-sm font-black transition ${
                category === c ? "bg-primary text-primary-foreground" : "border-2 border-border hover:bg-secondary"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ملاحظة (اختياري)"
          className="w-full rounded-xl border-2 border-border bg-background px-3 py-2.5 font-bold outline-none focus:border-primary"
        />

        {msg && <p className="rounded-xl border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm font-black text-destructive">{msg}</p>}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => void save()}
            disabled={busy || amount <= 0}
            className="min-h-12 rounded-xl bg-primary px-4 font-black text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "…" : "تسجيل"}
          </button>
          <button onClick={onClose} className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl border-2 border-border px-4 font-bold hover:bg-secondary">
            <X className="size-4" />
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
