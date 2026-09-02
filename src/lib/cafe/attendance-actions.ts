"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { forgetStaffCache, requireAdmin, requireStaff } from "./auth";
import { inShift, workDay, type ShiftPeriod } from "./work-shift";

/**
 * جدول الدخول والانصراف.
 *
 * الحضور يُسجَّل تلقائياً في requireStaff — أول طلب بعد الدخول يفتح السطر — فلا
 * شيء هنا يفتح حضوراً. هذه الصفحة تقرأ وتُقفل وتستثني.
 */

export type AttendanceRow = {
  id: string;
  employee_id: string;
  name_ar: string;
  shift: ShiftPeriod | null;
  started_at: string;
  ended_at: string | null;
  auto_closed: boolean;
  /** دقائق العمل — محسوبة إلى الآن إن كان ما زال بالداخل */
  minutes: number;
  /** بدأ بعد بداية ورديته بكم دقيقة؟ سالبها تبكير. null لمن بلا وردية */
  late_minutes: number | null;
  /** عمل خارج نافذة ورديته بلا مهلة */
  outside: boolean;
};

const SHIFT_START: Record<ShiftPeriod, number> = { morning: 9 * 60, evening: 15 * 60 };

export async function listAttendance(day = workDay()): Promise<AttendanceRow[]> {
  await requireAdmin();
  const svc = createSupabaseServiceClient();

  // يُقفل المنسيّ أولاً، وإلا ظهر من انصرف أمس وكأنه ما زال يعمل ثلاثين ساعة
  await svc.rpc("attendance_autoclose");

  const { data, error } = await svc
    .from("attendance")
    .select("id, employee_id, shift, started_at, ended_at, auto_closed, employees(name_ar)")
    .eq("work_day", day)
    .order("started_at");
  if (error) throw new Error(`تعذّر جلب الحضور: ${error.message}`);

  const rows = (data ?? []) as unknown as (Omit<AttendanceRow, "name_ar" | "minutes" | "late_minutes" | "outside"> & {
    employees: { name_ar: string } | null;
  })[];

  return rows.map((r) => {
    const from = new Date(r.started_at);
    const to = r.ended_at ? new Date(r.ended_at) : new Date();
    const minutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
    let late: number | null = null;
    if (r.shift) {
      const hhmm = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Baghdad",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(from);
      const [h, m] = hhmm.split(":").map(Number);
      late = h * 60 + m - SHIFT_START[r.shift];
    }
    return {
      ...r,
      name_ar: r.employees?.name_ar ?? "—",
      minutes,
      late_minutes: late,
      // بلا مهلة هنا: هذا تقرير لا بوّابة. المهلة تمنع إيقاف البيع، ولا تُخفي
      // أن أحدهم عمل خارج وقته.
      outside: r.shift ? !inShift(r.shift, from, 0) : false,
    };
  });
}

/** يُقفل حضور من نسي — بيد الإدارة، لا انتظاراً لأربع عشرة ساعة. */
export async function closeAttendance(employeeId: string) {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { error } = await svc.rpc("attendance_close", { p_employee: employeeId });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/attendance");
  return { ok: true as const };
}

/**
 * استثناء ليوم واحد — المخرج الذي يمنع المنعَ من إيقاف البيع.
 *
 * ليوم بعينه لا للأبد: من غطّى وردية زميله الليلة لا ينبغي أن يبقى مفتوحاً له
 * الوقت كله إلى الأبد لأن أحداً نسي أن يُلغي الاستثناء.
 */
export async function allowToday(employeeId: string, reason?: string) {
  const admin = await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("shift_exceptions").upsert({
    employee_id: employeeId,
    work_day: workDay(),
    reason: reason?.trim() || null,
    by_employee: admin.employeeId,
  });
  if (error) return { ok: false as const, error: error.message };
  // وإلا انتظر الموظف دقيقةً كاملة أمام شاشة مقفلة بسبب ذاكرة الجلسة
  forgetStaffCache();
  revalidatePath("/attendance");
  return { ok: true as const };
}

export async function revokeToday(employeeId: string) {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { error } = await svc
    .from("shift_exceptions")
    .delete()
    .eq("employee_id", employeeId)
    .eq("work_day", workDay());
  if (error) return { ok: false as const, error: error.message };
  forgetStaffCache();
  revalidatePath("/attendance");
  return { ok: true as const };
}

/** الموظفون ذوو الوردية، ومن استُثني منهم اليوم — لصفّ الاستثناءات. */
export async function listShiftStaff() {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const [{ data: emps }, { data: passes }] = await Promise.all([
    svc.from("employees").select("id, name_ar, shift_period").eq("is_active", true).not("shift_period", "is", null),
    svc.from("shift_exceptions").select("employee_id").eq("work_day", workDay()),
  ]);
  const allowed = new Set((passes ?? []).map((p) => p.employee_id));
  return (emps ?? []).map((e) => ({
    id: e.id,
    name_ar: e.name_ar,
    shift: e.shift_period as ShiftPeriod,
    allowedToday: allowed.has(e.id),
  }));
}

/** انصراف — يُنادى عند تسجيل الخروج. */
export async function clockOutSelf() {
  const staff = await requireStaff();
  const svc = createSupabaseServiceClient();
  await svc.rpc("attendance_close", { p_employee: staff.employeeId });
  return { ok: true as const };
}
