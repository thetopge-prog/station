"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "./auth";
import { businessDay } from "./time";

/**
 * «مجهّزو اليوم» — who was actually on the pass.
 *
 * The expediter screen runs on one shared account that several people take
 * turns at, so the system records the ACCOUNT that marked an order ready, not
 * the person. By the end of a week nobody can say who worked which day.
 *
 * The cashier can say. They stand two metres away and watch them all evening.
 * So the cashier ticks them once at the start of the day and the answer is
 * kept — which is the whole feature: not a new login for each person, not a
 * clock-in ritual, one tick.
 *
 * More than one per day is the normal case, not the exception.
 */

export type DutyPerson = { id: string; name_ar: string; onDuty: boolean };

/**
 * Who could be on the pass today, and who is ticked.
 *
 * Candidates are expediters AND cashiers: in a shop this size the person
 * bagging orders at eight is often the one on the till at four, and a list
 * that cannot express that would be worked around rather than used.
 */
export async function dutyRoster(day = businessDay()): Promise<DutyPerson[]> {
  await requireStaff();
  const svc = createSupabaseServiceClient();

  const [{ data: roles }, { data: onDuty }] = await Promise.all([
    svc.from("roles").select("id, name_en").in("name_en", ["expediter", "cashier"]),
    svc.from("duty_expediters").select("employee_id").eq("business_day", day),
  ]);

  const roleIds = (roles ?? []).map((r) => r.id);
  if (!roleIds.length) return [];

  const { data: emps } = await svc
    .from("employees")
    .select("id, name_ar")
    .in("role_id", roleIds)
    .eq("is_active", true)
    .order("name_ar");

  const ticked = new Set((onDuty ?? []).map((d) => d.employee_id));
  return (emps ?? []).map((e) => ({ id: e.id, name_ar: e.name_ar, onDuty: ticked.has(e.id) }));
}

/**
 * Replace the day's list with exactly these people.
 *
 * Replace, not add: the cashier corrects the list when somebody leaves early
 * or a second person comes on, and a control that only ever adds leaves a name
 * nobody can take off.
 */
export async function setDutyExpediters(ids: string[], day = businessDay()) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_duty_expediters", { p_day: day, p_ids: ids });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/cashier");
  return { ok: true as const };
}
