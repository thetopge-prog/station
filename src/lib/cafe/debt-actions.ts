"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { openSessionIdFor } from "./session-of";
import { requireStaff } from "./auth";

export type Debtor = {
  customer_name: string;
  phone: string | null;
  total_debt: number;
  total_paid: number;
  balance: number;
  last_activity: string;
};
export type DebtEntry = { id: string; kind: "debit" | "credit"; amount: number; note: string | null; created_at: string };

/** Add one movement: kind='debit' (took on credit) or 'credit' (paid). */
export async function addDebtEntry(input: {
  customer_name: string;
  amount: number;
  kind: "debit" | "credit";
  note?: string;
  phone?: string;
}) {
  const staff = await requireStaff();
  const name = input.customer_name.trim();
  const amount = Math.max(0, Math.round(input.amount || 0));
  if (!name) return { ok: false as const, error: "أدخل اسم العميل." };
  if (amount <= 0) return { ok: false as const, error: "أدخل المبلغ." };
  const svc = createSupabaseServiceClient();
  const session_id = await openSessionIdFor(staff.employeeId);
  const { error } = await svc.from("debt_entries").insert({
    session_id,
    customer_name: name,
    kind: input.kind,
    amount,
    note: input.note?.trim() || null,
    phone: input.phone?.trim() || null,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/debts");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

/** All debtors with running balances, biggest owed first. */
export async function listDebtors(): Promise<Debtor[]> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { data } = await svc.from("debtor_balances").select("*").order("balance", { ascending: false });
  return (data ?? []) as Debtor[];
}

/** The movement history for one debtor. */
export async function listDebtEntries(name: string): Promise<DebtEntry[]> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("debt_entries")
    .select("id, kind, amount, note, created_at")
    .eq("customer_name", name)
    .order("created_at", { ascending: false });
  return (data ?? []) as DebtEntry[];
}

/** Total money still owed to the shop (sum of positive balances) — for the dashboard. */
export async function getTotalOutstanding(): Promise<number> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { data } = await svc.from("debtor_balances").select("balance");
  return (data ?? []).reduce((s, d) => s + Math.max(0, d.balance || 0), 0);
}
