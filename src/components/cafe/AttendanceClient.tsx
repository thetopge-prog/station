"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, LogOut, ShieldCheck } from "lucide-react";
import { allowToday, closeAttendance, revokeToday, type AttendanceRow } from "@/lib/cafe/attendance-actions";
import { SHIFT_AR, type ShiftPeriod } from "@/lib/cafe/work-shift";
import { sinceLabel } from "@/lib/cafe/time";

type ShiftStaff = { id: string; name_ar: string; shift: ShiftPeriod; allowedToday: boolean };

const clock = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Baghdad", hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(iso),
  );

export function AttendanceClient({ rows, staff, day }: { rows: AttendanceRow[]; staff: ShiftStaff[]; day: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(id: string, fn: () => Promise<{ ok: boolean }>) {
    setBusy(id);
    await fn();
    setBusy(null);
    router.refresh();
  }

  const inside = rows.filter((r) => !r.ended_at).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">الدخول والانصراف</h1>
          <p className="text-sm font-bold text-muted-foreground">
            يوم الدوام {day} — الوردية المسائية تُحسب على يوم بدايتها حتى بعد منتصف الليل.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold">
          <CalendarDays className="size-4" />
          <input
            type="date"
            defaultValue={day}
            onChange={(e) => router.push(`/attendance?day=${e.target.value}`)}
            className="min-h-11 rounded-lg border border-input bg-background px-2"
          />
        </label>
      </header>

      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-2 font-black">
          الحضور <span className="text-sm font-bold text-muted-foreground">— {inside} ما زالوا بالداخل</span>
        </h2>
        {rows.length === 0 ? (
          <p className="py-6 text-center font-bold text-muted-foreground">لا حضور مسجَّل في هذا اليوم.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-xs font-black text-muted-foreground">
                  <th className="py-1">الموظف</th>
                  <th>الوردية</th>
                  <th>دخل</th>
                  <th>انصرف</th>
                  <th>المدّة</th>
                  <th>التأخير</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-2 font-bold">{r.name_ar}</td>
                    <td>{r.shift ? SHIFT_AR[r.shift] : "—"}</td>
                    <td className="tabular-nums" dir="ltr">{clock(r.started_at)}</td>
                    <td className="tabular-nums" dir="ltr">
                      {r.ended_at ? clock(r.ended_at) : <span className="font-black text-primary">بالداخل</span>}
                      {/* الوسم يمنع قراءة إقفالٍ آليّ كانصرافٍ حقيقي */}
                      {r.auto_closed && <span className="mr-1 text-[11px] font-bold text-muted-foreground">(آلي)</span>}
                    </td>
                    <td className="tabular-nums">{sinceLabel(r.minutes)}</td>
                    <td className="tabular-nums">
                      {r.late_minutes === null ? (
                        "—"
                      ) : r.late_minutes > 5 ? (
                        <span className="font-black text-destructive">{sinceLabel(r.late_minutes)}</span>
                      ) : (
                        <span className="text-muted-foreground">في وقته</span>
                      )}
                      {r.outside && <span className="mr-1 text-[11px] font-black text-amber-700">خارج ورديته</span>}
                    </td>
                    <td>
                      {!r.ended_at && (
                        <button
                          disabled={busy === r.id}
                          onClick={() => void run(r.id, () => closeAttendance(r.employee_id))}
                          className="touch-pos flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-bold hover:bg-secondary disabled:opacity-50"
                        >
                          <LogOut className="size-3.5" />
                          أنهِ
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {staff.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-1 flex items-center gap-2 font-black">
            <ShieldCheck className="size-5" />
            استثناء اليوم
          </h2>
          <p className="mb-3 text-xs font-bold text-muted-foreground">
            يفتح الوقت لموظف ليوم واحد فقط — لمن يغطّي وردية زميله. ينتهي وحده مع اليوم.
          </p>
          <div className="flex flex-wrap gap-2">
            {staff.map((s) => (
              <button
                key={s.id}
                disabled={busy === s.id}
                onClick={() => void run(s.id, () => (s.allowedToday ? revokeToday(s.id) : allowToday(s.id)))}
                className={`touch-pos min-h-11 rounded-xl border-2 px-3 text-sm font-bold transition disabled:opacity-50 ${
                  s.allowedToday ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary"
                }`}
              >
                {s.name_ar}
                <span className="mr-1 text-xs opacity-70">{SHIFT_AR[s.shift]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
