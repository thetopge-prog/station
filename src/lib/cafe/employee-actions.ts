"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "./auth";
import { businessDay } from "./time";
import { WAGE_PERIOD_AR, type WagePeriod } from "./wages";

export type EmployeeRow = {
  id: string;
  name_ar: string;
  is_active: boolean;
  wage_amount: number;
  wage_period: WagePeriod | null;
  has_login: boolean;
};

/** All employees (admin). Uses the service client — RLS only exposes self-rows. */
export async function listEmployees(): Promise<EmployeeRow[]> {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("employees")
    .select("id, name_ar, is_active, wage_amount, wage_period, auth_user_id")
    .order("created_at", { ascending: true });
  return (data ?? []).map((e) => ({
    id: e.id,
    name_ar: e.name_ar,
    is_active: e.is_active,
    wage_amount: e.wage_amount ?? 0,
    wage_period: (e.wage_period ?? null) as WagePeriod | null,
    has_login: e.auth_user_id != null,
  }));
}

export async function upsertEmployee(input: {
  id?: string;
  name_ar: string;
  wage_amount: number;
  wage_period: WagePeriod;
}) {
  await requireAdmin();
  const name = input.name_ar.trim();
  if (!name) return { ok: false as const, error: "أدخل اسم الموظف." };
  const row = {
    name_ar: name,
    wage_amount: Math.max(0, Math.round(input.wage_amount || 0)),
    wage_period: input.wage_period,
  };
  const svc = createSupabaseServiceClient();
  const { error } = input.id
    ? await svc.from("employees").update(row).eq("id", input.id)
    : await svc.from("employees").insert({ ...row, is_active: true });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/employees");
  return { ok: true as const };
}

export async function toggleEmployee(id: string, is_active: boolean) {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("employees").update({ is_active }).eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/employees");
  return { ok: true as const };
}

/** Pay an employee's wage: records it as a «رواتب» expense so it hits today's net. */
export async function payWage(employeeId: string) {
  const admin = await requireAdmin();
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
