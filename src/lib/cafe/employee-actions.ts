"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAdminOrDeveloper } from "./auth";
import { businessDay } from "./time";
import { WAGE_PERIOD_AR, type WagePeriod } from "./wages";
import { type ShiftPeriod, type ShiftWindows } from "./work-shift";
import { getShiftWindows, saveShiftWindows } from "./shift-window";
import { forgetStaffCache } from "./auth";

export type EmployeeRow = {
  id: string;
  name_ar: string;
  is_active: boolean;
  wage_amount: number;
  wage_period: WagePeriod | null;
  has_login: boolean;
  /** null = بلا قيد وقت — وهو حال الحسابات المشتركة */
  shift_period: ShiftPeriod | null;
};

/** All employees (admin). Uses the service client — RLS only exposes self-rows. */
export async function listEmployees(): Promise<EmployeeRow[]> {
  await requireAdminOrDeveloper();
  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("employees")
    .select("id, name_ar, is_active, wage_amount, wage_period, auth_user_id, shift_period")
    .order("created_at", { ascending: true });
  return (data ?? []).map((e) => ({
    id: e.id,
    name_ar: e.name_ar,
    is_active: e.is_active,
    wage_amount: e.wage_amount ?? 0,
    wage_period: (e.wage_period ?? null) as WagePeriod | null,
    has_login: e.auth_user_id != null,
    shift_period: (e.shift_period ?? null) as ShiftPeriod | null,
  }));
}

export async function upsertEmployee(input: {
  id?: string;
  name_ar: string;
  wage_amount: number;
  wage_period: WagePeriod;
  /** غير مُرسَلة = لا تُمسّ؛ null صريحة = بلا قيد وقت */
  shiftPeriod?: ShiftPeriod | null;
}) {
  await requireAdminOrDeveloper();
  const name = input.name_ar.trim();
  if (!name) return { ok: false as const, error: "أدخل اسم الموظف." };
  const row = {
    name_ar: name,
    wage_amount: Math.max(0, Math.round(input.wage_amount || 0)),
    wage_period: input.wage_period,
    ...(input.shiftPeriod !== undefined ? { shift_period: input.shiftPeriod } : {}),
  };
  const svc = createSupabaseServiceClient();
  const { error } = input.id
    ? await svc.from("employees").update(row).eq("id", input.id)
    : await svc.from("employees").insert({ ...row, is_active: true });
  if (error) return { ok: false as const, error: error.message };
  // تغيير الوردية يجب أن يسري الآن لا بعد دقيقة من ذاكرة الجلسة
  if (input.shiftPeriod !== undefined) forgetStaffCache();
  revalidatePath("/employees");
  return { ok: true as const };
}

/** أوقات الورديتين — للوحة «أوقات الدوام» في شاشة الموظفين. */
export async function readShiftHours(): Promise<ShiftWindows> {
  await requireAdminOrDeveloper();
  return getShiftWindows();
}

/**
 * حفظ أوقات الورديتين من أربع خانات «HH:MM».
 *
 * التحويل هنا لا في المتصفح: الحدّ الذي يُبنى عليه المنع لا يُقرأ من نصّ
 * أرسله عميل. ونهاية ≤ بداية تعني عبور منتصف الليل، فتُخزَّن +١٤٤٠ — وهكذا
 * تبقى ٠٣:٠٠ رقماً أكبر من ١٨:٠٠ ويبقى الحساب طرحاً واحداً.
 */
export async function saveShiftHours(input: {
  morningStart: string; morningEnd: string; eveningStart: string; eveningEnd: string;
}) {
  await requireAdminOrDeveloper();
  const min = (hhmm: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
    if (!m) return null;
    const h = Number(m[1]), mm = Number(m[2]);
    if (h > 23 || mm > 59) return null;
    return h * 60 + mm;
  };
  const parts = [input.morningStart, input.morningEnd, input.eveningStart, input.eveningEnd].map(min);
  if (parts.some((p) => p == null)) return { ok: false as const, error: "اكتب الأوقات بصيغة ساعة:دقيقة." };
  const [ms, me0, es, ee0] = parts as number[];
  const wrap = (start: number, end: number) => (end <= start ? end + 1440 : end);
  const res = await saveShiftWindows({ morning: [ms, wrap(ms, me0)], evening: [es, wrap(es, ee0)] });
  if (!res.ok) return res;
  forgetStaffCache();
  revalidatePath("/employees");
  revalidatePath("/attendance");
  return { ok: true as const };
}

export async function toggleEmployee(id: string, is_active: boolean) {
  await requireAdminOrDeveloper();
  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("employees").update({ is_active }).eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/employees");
  return { ok: true as const };
}

/** Pay an employee's wage: records it as a «رواتب» expense so it hits today's net. */
export async function payWage(employeeId: string) {
  const admin = await requireAdminOrDeveloper();
  const svc = createSupabaseServiceClient();
  const { data: emp } = await svc
    .from("employees")
    .select("name_ar, wage_amount, wage_period")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp) return { ok: false as const, error: "الموظف غير موجود." };
  if (!emp.wage_amount || emp.wage_amount <= 0) return { ok: false as const, error: "حدّد أجر الموظف أولاً." };

  const periodAr = emp.wage_period ? WAGE_PERIOD_AR[emp.wage_period as WagePeriod] : "";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("expenses").insert({
    amount: emp.wage_amount,
    category: "رواتب",
    note: `أجر ${emp.name_ar}${periodAr ? ` (${periodAr})` : ""}`,
    business_day: businessDay(),
    created_by: admin.employeeId,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/employees");
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { ok: true as const, paid: emp.wage_amount, name: emp.name_ar };
}
