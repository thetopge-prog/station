"use client";

import { useEffect, useState } from "react";
import { Delete, Lock } from "lucide-react";
import { changeTillPin, unlockTill } from "@/lib/cafe/till-lock";

/**
 * «قفل الشاشة» — الوردية تبقى، والشاشة تُغلق.
 *
 * تسجيل الخروج يُنهي الوردية ويُقفل الدرج، فلا أحد يفعله لأجل دقيقتين في
 * الحمّام. والنتيجة أن الشاشة تبقى مفتوحة باسم كاشير غائب، وأي مارّ يستطيع أن
 * يضيف صنفاً إلى طلب باسمه.
 *
 * وحدّه صريح ولا أُخفيه: هذا يوقف العابث لا المخترق. من يفتح أدوات المطوّر
 * يتجاوزه — لكن من يقف عند الكاونتر لا يستطيع، وهو الخطر المقصود.
 */
const KEY = "station:till-locked";

export function useTillLock() {
  const [locked, setLocked] = useState(false);
  // القفل يعيش في التخزين لا في الذاكرة: لو عاش في الذاكرة لفتحه زر التحديث
  useEffect(() => {
    const read = () => setLocked(localStorage.getItem(KEY) === "1");
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, []);
  return {
    locked,
    lock: () => {
      localStorage.setItem(KEY, "1");
      setLocked(true);
    },
    unlock: () => {
      localStorage.removeItem(KEY);
      setLocked(false);
    },
  };
}

export function TillLockScreen({ name, onUnlock }: { name: string; onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const [next, setNext] = useState("");

  async function submit(value: string) {
    setBusy(true);
    setErr(null);
    try {
      if (changing) {
        const res = await changeTillPin(value, next);
        if (res.ok) {
          setChanging(false);
          setNext("");
          setPin("");
          setErr("تم تغيير الرمز.");
        } else setErr(res.error ?? "تعذّر التغيير.");
      } else if (await unlockTill(value)) {
        onUnlock();
      } else {
        setErr("رمز غير صحيح.");
        setPin("");
      }
    } catch {
      setErr("تعذّر التحقّق — تحقّق من الاتصال.");
    } finally {
      setBusy(false);
    }
  }

  function press(d: string) {
    setErr(null);
    const v = (pin + d).slice(0, 8);
    setPin(v);
    if (v.length === 4 && !changing) void submit(v);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/95 p-4 backdrop-blur print:hidden">
      <div className="w-full max-w-xs text-center">
        <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Lock className="size-8" />
        </div>
        <p className="text-xl font-black">{name}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {changing ? "أدخل الرمز الحالي للتأكيد" : "الشاشة مقفلة — أدخل الرمز"}
        </p>

        {changing && (
          <input
            value={next}
            onChange={(e) => setNext(e.target.value.replace(/\D/g, "").slice(0, 8))}
            inputMode="numeric"
            placeholder="الرمز الجديد (٤–٨ أرقام)"
            className="mt-3 w-full rounded-xl border border-border bg-card px-3 py-2 text-center text-lg font-bold"
          />
        )}

        <div className="my-4 flex justify-center gap-2" aria-label="الرمز">
          {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
            <span key={i} className={`size-3.5 rounded-full ${i < pin.length ? "bg-primary" : "bg-border"}`} />
          ))}
        </div>

        {err && <p className="mb-2 text-sm font-bold text-destructive">{err}</p>}

        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} onClick={() => press(d)} disabled={busy} className="touch-pos rounded-2xl border border-border py-4 text-2xl font-black hover:bg-secondary disabled:opacity-50">
              {d}
            </button>
          ))}
          <button onClick={() => setPin((p) => p.slice(0, -1))} className="touch-pos rounded-2xl border border-border py-4 hover:bg-secondary" aria-label="مسح">
            <Delete className="mx-auto size-6" />
          </button>
          <button onClick={() => press("0")} disabled={busy} className="touch-pos rounded-2xl border border-border py-4 text-2xl font-black hover:bg-secondary disabled:opacity-50">
            0
          </button>
          <button
            onClick={() => void submit(pin)}
            disabled={busy || pin.length < 4 || (changing && next.length < 4)}
            className="touch-pos rounded-2xl bg-primary py-4 text-sm font-black text-primary-foreground disabled:opacity-40"
          >
            {busy ? "…" : changing ? "حفظ" : "فتح"}
          </button>
        </div>

        <button
          onClick={() => {
            setChanging((c) => !c);
            setPin("");
            setErr(null);
          }}
          className="mt-4 text-sm font-semibold text-muted-foreground underline"
        >
          {changing ? "إلغاء" : "تغيير الرمز"}
        </button>
      </div>
    </div>
  );
}
