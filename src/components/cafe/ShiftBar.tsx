"use client";

import { useCallback, useEffect, useState } from "react";
import { UserCheck, UserX } from "lucide-react";
import {
  closeShift,
  listActiveShifts,
  listShiftCandidates,
  openShift,
  type ActiveShift,
  type ShiftCandidate,
} from "@/lib/cafe/shift-actions";

/**
 * «المجهّز في الوردية» — sits on top of the POS.
 *
 * The assembly ticket prints the expediter's name at the moment of payment, so
 * that name has to be chosen BEFORE the first sale of the shift, not after. A
 * bar the cashier cannot miss is the point: it turns an invisible data
 * requirement into a visible one-tap step at the start of service.
 *
 * When nobody is selected it goes red and says so, because the alternative is
 * a shift's worth of tickets reading «غير محدّد».
 */
export function ShiftBar() {
  const [shifts, setShifts] = useState<ActiveShift[]>([]);
  const [people, setPeople] = useState<ShiftCandidate[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([listActiveShifts(), listShiftCandidates("expediter")]);
      setShifts(s);
      setPeople(p);
    } catch {
      /* keep whatever we last knew */
    }
  }, []);

  useEffect(() => {
    const kick = setTimeout(() => void refresh(), 0);
    // a shift can be claimed from the expediter's own tablet, so re-read
    const poll = setInterval(() => void refresh(), 30_000);
    return () => {
      clearTimeout(kick);
      clearInterval(poll);
    };
  }, [refresh]);

  const current = shifts.find((s) => s.role === "expediter") ?? null;

  async function pick(employeeId: string) {
    setBusy(true);
    try {
      await openShift("expediter", employeeId);
      await refresh();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!current) return;
    setBusy(true);
    try {
      await closeShift(current.id);
      await refresh();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`touch-pos flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 p-3 ${
        current ? "border-primary bg-primary/5" : "border-destructive bg-destructive/5"
      }`}
    >
      <div className="flex items-center gap-2">
        {current ? <UserCheck className="size-5 text-primary" /> : <UserX className="size-5 text-destructive" />}
        <div>
          <p className="text-xs font-bold text-muted-foreground">المجهّز في الوردية</p>
          <p className={`text-lg font-black ${current ? "" : "text-destructive"}`}>
            {current ? current.employee_name : "لم يُحدَّد — ستُطبع التذاكر بلا اسم"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {current && (
          <button
            onClick={() => void clear()}
            disabled={busy}
            className="min-h-11 rounded-xl border-2 border-border px-3 text-sm font-bold hover:bg-secondary disabled:opacity-50"
          >
            إنهاء الوردية
          </button>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={busy}
          className="min-h-11 rounded-xl bg-primary px-4 font-black text-primary-foreground shadow-station hover:opacity-90 disabled:opacity-50"
        >
          {current ? "تغيير" : "اختيار المجهّز"}
        </button>
      </div>

      {open && (
        <div className="w-full">
          {people.length === 0 ? (
            <p className="rounded-xl border-2 border-dashed border-border p-4 text-center text-sm font-bold text-muted-foreground">
              لا يوجد موظفون بدور «مجهّز طلبات» — يضيفهم المدير من صفحة الموظفين.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {people.map((p) => (
                <button
                  key={p.id}
                  onClick={() => void pick(p.id)}
                  disabled={busy}
                  className={`min-h-14 rounded-xl border-2 px-3 font-black transition active:scale-95 disabled:opacity-50 ${
                    current?.employee_id === p.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:bg-secondary"
                  }`}
                >
                  {p.name_ar}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
