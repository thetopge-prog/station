"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { openSessionIdFor } from "./session-of";
import { requireStaff, requireAdmin } from "./auth";
import { businessDay } from "./time";

export type ExpenseRow = {
  id: string;
  business_day: string;
  amount: number;
  category: string | null;
  note: string | null;
};

/** Any staff member records expenses (the cashier pays for ice, milk, …).
 *  Service client behind the staff gate — expenses has admin-only RLS. */
export async function addExpense(input: { amount: number; category?: string; note?: string }) {
  const staff = await requireStaff();
  const amount = Math.max(0, Math.round(input.amount));
  if (amount <= 0) return { ok: false as const, error: "أدخل مبلغاً صحيحاً." };

  const svc = createSupabaseServiceClient();
  // attribute it to whichever drawer is open — this is what makes the
  // Z-report subtract the right expenses from the right cashier
  const session_id = await openSessionIdFor(staff.employeeId);
  const { error } = await svc.from("expenses").insert({
    amount,
    session_id,
    category: input.category?.trim() || null,
    note: input.note?.trim() || null,
    business_day: businessDay(),
    created_by: staff.employeeId,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

/** Admin sees the full history; the cashier sees today's expenses only. */
export async function listExpenses(limit = 60): Promise<ExpenseRow[]> {
  const staff = await requireStaff();
  const svc = createSupabaseServiceClient();
  let q = svc
    .from("expenses")
    .select("id, business_day, amount, category, note")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (staff.role !== "admin") q = q.eq("business_day", businessDay());
  const { data } = await q;
  return (data ?? []) as ExpenseRow[];
}

// ── daily register closure (إغلاق الصندوق) ──────────────────────────────────

export type RegisterClosure = { business_day: string; remaining: number; note: string | null };

/** Record how much cash stays in the drawer at close (upsert — re-saving
 *  the same day just updates the amount). */
export async function saveRegisterClosure(input: { remaining: number; note?: string }) {
  const staff = await requireStaff();
  const remaining = Math.max(0, Math.round(input.remaining));
  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("register_closures").upsert(
    {
      business_day: businessDay(),
      remaining,
      note: input.note?.trim() || null,
      closed_by: staff.name,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_day" },
  );
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/expenses");
  return { ok: true as const };
}

// ── fixed monthly costs (الإيجار/الكهرباء/المولد/المياه) ────────────────────

export type MonthlyCost = { category: string; amount: number };

/** The fixed monthly-cost baseline. Any staff can view (feeds the summary). */
export async function getMonthlyCosts(): Promise<MonthlyCost[]> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { data } = await svc.from("monthly_costs").select("category, amount");
  return (data ?? []) as MonthlyCost[];
}

/** Set the fixed monthly amounts (admin only — it changes the profit math). */
export async function saveMonthlyCosts(items: MonthlyCost[]) {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const rows = items.map((i) => ({ category: i.category, amount: Math.max(0, Math.round(i.amount || 0)), updated_at: new Date().toISOString() }));
  const { error } = await svc.from("monthly_costs").upsert(rows, { onConflict: "category" });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

/** Today's saved closure (if any) + the most recent previous one. */
export async function getRegisterClosures(): Promise<{ today: RegisterClosure | null; previous: RegisterClosure | null }> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("register_closures")
    .select("business_day, remaining, note")
    .order("business_day", { ascending: false })
    .limit(2);
  const rows = (data ?? []) as RegisterClosure[];
  const day = businessDay();
  const today = rows.find((r) => r.business_day === day) ?? null;
  const previous = rows.find((r) => r.business_day !== day) ?? null;
  return { today, previous };
}
