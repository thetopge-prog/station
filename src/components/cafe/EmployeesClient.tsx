"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeDollarSign, Pencil, X } from "lucide-react";
import { payWage, saveShiftHours, toggleEmployee, upsertEmployee, type EmployeeRow } from "@/lib/cafe/employee-actions";
import { SHIFT_AR, shiftHours, type ShiftPeriod, type ShiftWindows } from "@/lib/cafe/work-shift";
import { WAGE_PERIOD_AR, type WagePeriod } from "@/lib/cafe/wages";
import { formatIqdLabel } from "@/lib/cafe/money";

const PERIODS: WagePeriod[] = ["daily", "weekly", "monthly"];
const SHIFTS: ShiftPeriod[] = ["morning", "evening"];

/** دقيقة من منتصف الليل ← HH:MM لخانة الوقت، ولو جاوزت اليوم. */
const toTime = (m: number) =>
  `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function EmployeesClient({ employees, windows }: { employees: EmployeeRow[]; windows: ShiftWindows }) {
  const router = useRouter();
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState<WagePeriod>("daily");
  const [shift, setShift] = useState<ShiftPeriod | "">("");
  // أوقات الورديتين — أربع خانات وقت للمدير
  const [hours, setHours] = useState({
    morningStart: toTime(windows.morning[0]),
    morningEnd: toTime(windows.morning[1]),
    eveningStart: toTime(windows.evening[0]),
    eveningEnd: toTime(windows.evening[1]),
  });
  const [hoursBusy, setHoursBusy] = useState(false);
  const [hoursMsg, setHoursMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function startEdit(e: EmployeeRow) {
    setEditing(e);
    setName(e.name_ar);
    setAmount(String(e.wage_amount || ""));
    setPeriod(e.wage_period ?? "daily");
    setShift(e.shift_period ?? "");
    setMsg(null);
  }
  function resetForm() {
    setEditing(null);
    setName("");
    setAmount("");
    setPeriod("daily");
    setShift("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await upsertEmployee({
      id: editing?.id,
      name_ar: name,
      wage_amount: Number(amount) || 0,
      wage_period: period,
      shiftPeriod: shift === "" ? null : shift,
    });
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    resetForm();
    router.refresh();
  }

  async function onPay(emp: EmployeeRow) {
    if (!window.confirm(`دفع أجر ${emp.name_ar} — ${formatIqdLabel(emp.wage_amount)}؟\nسيُسجَّل كمصروف «رواتب» اليوم.`)) return;
    setMsg(null);
    const res = await payWage(emp.id);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    setMsg(`تم دفع ${formatIqdLabel(res.paid)} لـ${res.name} وتسجيله في المصروفات ✅`);
    router.refresh();
  }

  async function onToggle(emp: EmployeeRow) {
    await toggleEmployee(emp.id, !emp.is_active);
    router.refresh();
  }

  async function saveHours() {
    setHoursBusy(true);
    setHoursMsg(null);
    const res = await saveShiftHours(hours);
    setHoursBusy(false);
    setHoursMsg(res.ok ? "حُفظت أوقات الدوام ✅" : res.error);
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">الموظفون</h1>

      {/* أوقات الدوام — كانت في الشيفرة فصارت هنا، لأن المحل يغيّرها بقرار */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 font-black">🕒 أوقات الدوام</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          {SHIFTS.map((p) => (
            <div key={p} className="flex items-end gap-2">
              <span className="pb-2 text-sm font-bold text-muted-foreground">{SHIFT_AR[p]}</span>
              <label className="text-xs">
                <span className="text-muted-foreground">من</span>
                <input
                  type="time"
                  value={p === "morning" ? hours.morningStart : hours.eveningStart}
                  onChange={(ev) => setHours((h) => ({ ...h, [p === "morning" ? "morningStart" : "eveningStart"]: ev.target.value }))}
                  className="mt-1 block rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="text-muted-foreground">إلى</span>
                <input
                  type="time"
                  value={p === "morning" ? hours.morningEnd : hours.eveningEnd}
                  onChange={(ev) => setHours((h) => ({ ...h, [p === "morning" ? "morningEnd" : "eveningEnd"]: ev.target.value }))}
                  className="mt-1 block rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
                />
              </label>
            </div>
          ))}
          <button
            onClick={() => void saveHours()}
            disabled={hoursBusy}
            className="self-end rounded-lg bg-primary px-5 py-2 font-bold text-primary-foreground disabled:opacity-50"
          >
            {hoursBusy ? "…" : "حفظ الأوقات"}
          </button>
        </div>
        <p className="mt-2 text-xs font-bold text-muted-foreground">
          المسائية تعبر منتصف الليل، فنهايتها ٠٣:٠٠ تعني فجر اليوم التالي. التغيير يسري على كل جهاز خلال دقيقة. ومهلة ساعة قبل الوردية وبعدها تبقى دائماً كي لا يتوقّف البيع عند التسليم.
        </p>
        {hoursMsg && <p className="mt-1 text-sm font-bold text-muted-foreground">{hoursMsg}</p>}
      </div>

      {/* add / edit */}
      <form onSubmit={save} className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_140px_130px_150px_auto_auto]">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{editing ? `تعديل: ${editing.name_ar}` : "اسم الموظف"}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الأجر (د.ع)</span>
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            dir="ltr"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الدورية</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as WagePeriod)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {WAGE_PERIOD_AR[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الوردية</span>
          <select
            value={shift}
            onChange={(e) => setShift(e.target.value as ShiftPeriod | "")}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
          >
            {/* الفارغ أولاً: من لا وردية له لا يُمنع في أي ساعة */}
            <option value="">بلا قيد وقت</option>
            {SHIFTS.map((p) => (
              <option key={p} value={p}>
                {SHIFT_AR[p]} — {shiftHours(p, windows)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="self-end rounded-lg bg-primary px-5 py-2 font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "…" : editing ? "حفظ" : "إضافة"}
        </button>
        {editing && (
          <button type="button" onClick={resetForm} className="flex items-center gap-1 self-end rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary">
            <X className="size-4" />
            إلغاء
          </button>
        )}
        {msg && <p className="col-span-full text-sm text-muted-foreground">{msg}</p>}
      </form>

      {/* list */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-right text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">الموظف</th>
              <th className="px-4 py-2.5 font-medium">الأجر</th>
              <th className="px-4 py-2.5 font-medium">الدورية</th>
              <th className="px-4 py-2.5 font-medium">الوردية</th>
              <th className="px-4 py-2.5 font-medium">الحالة</th>
              <th className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  لا يوجد موظفون بعد — أضف أول موظف من الأعلى.
                </td>
              </tr>
            )}
            {employees.map((e) => (
              <tr key={e.id} className={`border-b border-border/60 last:border-0 ${e.is_active ? "" : "opacity-50"}`}>
                <td className="px-4 py-2.5 font-medium">
                  {e.name_ar}
                  {e.has_login && <span className="mr-2 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">حساب دخول</span>}
                </td>
                <td className="px-4 py-2.5 font-semibold">{e.wage_amount ? formatIqdLabel(e.wage_amount) : "—"}</td>
                <td className="px-4 py-2.5">{e.wage_period ? WAGE_PERIOD_AR[e.wage_period] : "—"}</td>
                <td className="px-4 py-2.5">
                  {e.shift_period ? (
                    <span className="whitespace-nowrap">
                      {SHIFT_AR[e.shift_period]} <span className="text-xs text-muted-foreground">{shiftHours(e.shift_period, windows)}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">بلا قيد</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => onToggle(e)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition ${
                      e.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {e.is_active ? "يعمل" : "موقوف"}
                  </button>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={() => onPay(e)}
                      disabled={!e.wage_amount}
                      className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
                    >
                      <BadgeDollarSign className="size-3.5" />
                      دفع الأجر
                    </button>
                    <button onClick={() => startEdit(e)} aria-label="تعديل" className="rounded-lg border border-border p-1.5 hover:bg-secondary">
                      <Pencil className="size-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-muted-foreground">
        💡 كل «دفع أجر» يُسجَّل تلقائياً كمصروف «رواتب» بتاريخ اليوم، فيظهر في المصروفات ويُخصم من صافي اليوم — وسجل الدفعات كاملاً في صفحة المصروفات.
      </p>
    </div>
  );
}
