"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAdmin, requireStaff } from "./auth";

/**
 * شركات التوصيل — aggregator orders billed postpaid.
 *
 * The money rule that matters lives in the database, not here: an aggregator
 * order is stamped payment_method='partner', and session_report counts only
 * payment_method='cash' toward the drawer. So none of this can ever inflate a
 * cashier's expected float, no matter what this file does.
 *
 * Reads go through the SERVICE client because partner_balances carries order
 * totals and is revoked from `authenticated` — the requireAdmin/requireStaff
 * gates above each function are the boundary.
 */

export type Partner = {
  id: string;
  name_ar: string;
  phone: string | null;
  is_active: boolean;
};

export type PartnerBalance = Partner & {
  /** everything billed to them, cancelled orders excluded */
  billed: number;
  /** everything they have paid us */
  settled: number;
  /** what they still owe — the number management actually reads */
  balance: number;
  orders_count: number;
  last_order_at: string | null;
  last_settled_at: string | null;
};

/** The picker on the till. Active companies only — a disabled one stays in the
 *  reports but must not be taggable onto a new order. */
export async function listActivePartners(): Promise<Partner[]> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("delivery_partners")
    .select("id, name_ar, phone, is_active")
    .eq("is_active", true)
    .order("sort")
    .order("name_ar");
  return data ?? [];
}

/** Management view: every company, disabled ones included, with their balance. */
export async function listPartnerBalances(): Promise<PartnerBalance[]> {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { data } = await svc.from("partner_balances").select("*");
  return (data ?? []).sort((a, b) => b.balance - a.balance || a.name_ar.localeCompare(b.name_ar, "ar"));
}

export async function savePartner(input: {
  id?: string | null;
  name: string;
  phone?: string | null;
  active?: boolean;
  note?: string | null;
}) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_partner", {
    p_id: input.id ?? null,
    p_name: input.name,
    p_phone: input.phone ?? null,
    p_active: input.active ?? true,
    p_note: input.note ?? null,
  });
  if (error) return { ok: false as const, error: friendly(error.message) };
  revalidatePath("/partners");
  revalidatePath("/cashier");
  return { ok: true as const };
}

/**
 * «تسوية الحساب» — log money received.
 *
 * Deliberately NOT tied to specific orders. These companies transfer a lump
 * sum against a running account; pretending each transfer clears an itemised
 * list would be inventing a reconciliation they never send.
 */
export async function settlePartner(input: {
  partnerId: string;
  amount: number;
  method?: "cash" | "transfer" | "other";
  note?: string | null;
}) {
  await requireAdmin();
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false as const, error: "أدخل مبلغاً أكبر من صفر." };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("settle_partner", {
    p_partner: input.partnerId,
    p_amount: Math.round(input.amount),
    p_method: input.method ?? "transfer",
    p_note: input.note ?? null,
  });
  if (error) return { ok: false as const, error: friendly(error.message) };
  revalidatePath("/partners");
  return { ok: true as const, balance: (data as number | null) ?? 0 };
}

export type LedgerRow = {
  kind: "order" | "settlement";
  ref: string;
  at: string;
  label: string;
  /** positive = billed to them, negative = received from them */
  amount: number;
};

/** One company's statement. Both dates optional — omit for everything. */
export async function partnerLedger(partnerId: string, from?: string | null, to?: string | null): Promise<LedgerRow[]> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("partner_ledger", {
    p_partner: partnerId,
    p_from: from || null,
    p_to: to || null,
  });
  return (data ?? []) as LedgerRow[];
}

/** The lines of one aggregator order, for the expandable row. */
export async function partnerOrderItems(orderId: string) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("partner_order_items", { p_order: orderId });
  return data ?? [];
}

/** Postgres speaks its own language; the shop floor does not. */
function friendly(message: string): string {
  if (/duplicate key|unique/i.test(message)) return "هذا الاسم مسجّل مسبقاً.";
  if (/admin only/i.test(message)) return "هذه العملية للمدير فقط.";
  if (/name required/i.test(message)) return "اكتب اسم الشركة.";
  return "تعذّر الحفظ — حاول مجدداً.";
}
