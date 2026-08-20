"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "./auth";
import type { StaffRole } from "./roles";

/**
 * Who is working right now.
 *
 * This exists because of one printed line. The expediter assembly ticket has to
 * name the مجهّز, but it prints the instant the cashier takes payment — before
 * anybody has touched the order. Without a shift record there is simply nothing
 * to print, so accountability is a scheduling problem before it is a UI one.
 *
 * Two ways a shift opens, because real shops do both:
 *   · the expediter signs in on their own tablet  → claims the shift
 *   · everyone shares the till                    → the cashier picks the name
 */

export type ShiftRole = "cashier" | "expediter" | "chef" | "cleaner";

export type ActiveShift = {
  id: string;
  role: ShiftRole;
  employee_id: string;
  employee_name: string;
  station_id: string | null;
  station_name: string | null;
  opened_at: string;
};

export type ShiftCandidate = {
  id: string;
  name_ar: string;
  role: StaffRole | null;
  station_id: string | null;
};

export async function listActiveShifts(): Promise<ActiveShift[]> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("active_shifts")
    .select("id, role, employee_id, employee_name, station_id, station_name, opened_at");
  return (data ?? []) as ActiveShift[];
}

/** Staff who can hold a given role today — what the POS selector offers. */
export async function listShiftCandidates(role: ShiftRole): Promise<ShiftCandidate[]> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { data: roles } = await svc.from("roles").select("id, name_en");
  // the owner can stand in on any station, so admin is always offered
  const wanted = (roles ?? []).filter((r) => r.name_en === role || r.name_en === "admin").map((r) => r.id);
  if (!wanted.length) return [];

  const { data } = await svc
    .from("employees")
    .select("id, name_ar, role_id, station_id")
    .eq("is_active", true)
    .in("role_id", wanted)
    .order("name_ar", { ascending: true });

  const roleOf = new Map((roles ?? []).map((r) => [r.id, r.name_en as StaffRole]));
  return (data ?? []).map((e) => ({
    id: e.id,
    name_ar: e.name_ar,
    role: e.role_id ? roleOf.get(e.role_id) ?? null : null,
    station_id: e.station_id,
  }));
}

/**
 * Put someone on a station for this shift.
 *
 * `exclusive` (the default for cashier/expediter) closes whoever held the role
 * first, so exactly one name can ever be printed. Chefs and cleaners overlap
 * freely — two people on the grill is normal and neither name goes on paper.
 */
export async function openShift(role: ShiftRole, employeeId: string, stationId: string | null = null) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("open_shift", {
    p_role: role,
    p_employee: employeeId,
    p_station: stationId,
    p_exclusive: role === "cashier" || role === "expediter",
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/cashier");
  revalidatePath("/expediter");
  return { ok: true as const };
}

export async function closeShift(shiftId: string) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("close_shift", { p_shift: shiftId });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/cashier");
  revalidatePath("/expediter");
  return { ok: true as const };
}

/**
 * Called when an expediter opens their own screen: if nobody holds the station
 * they take it, and if someone else does we leave it alone rather than stealing
 * it out from under a colleague mid-order.
 */
export async function claimExpediterShift(employeeId: string) {
  await requireStaff();
  const open = await listActiveShifts();
  if (open.some((s) => s.role === "expediter")) return { ok: true as const, claimed: false };
  const res = await openShift("expediter", employeeId);
  return res.ok ? { ok: true as const, claimed: true } : res;
}

/** The name that will be printed on the next assembly ticket. */
export async function currentExpediterName(): Promise<string | null> {
  const open = await listActiveShifts();
  return open.find((s) => s.role === "expediter")?.employee_name ?? null;
}
