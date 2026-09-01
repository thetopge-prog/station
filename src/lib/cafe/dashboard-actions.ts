"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "./auth";
import { businessDay } from "./time";

export type DaySummary = {
  day: string;
  sales: number;
  orders_count: number;
  profit: number;
  expenses: number;
  net: number;
};

/** Daily sales/profit/expenses rollup over a range. Admin only — reads profit,
 *  so it goes through the service client (range_summary is service-role-only). */
export async function getRangeSummary(from: string, to: string): Promise<DaySummary[]> {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc.rpc("range_summary", { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return (data ?? []) as DaySummary[];
}

/** Full sales/profit rollup for a single business day (Baghdad calendar day).
 *  `business_day` rolls at midnight, so after 12am «today» starts fresh — this
 *  lets the owner pull yesterday's (or any date's) closing total to reconcile
 *  the cash drawer. Admin only (reads profit → service client). */
export async function getDaySummary(day: string): Promise<DaySummary> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("تاريخ غير صالح");
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc.rpc("range_summary", { p_from: day, p_to: day });
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as DaySummary | undefined;
  return row ?? { day, sales: 0, orders_count: 0, profit: 0, expenses: 0, net: 0 };
}

// Baghdad is UTC+3 year-round (Iraq has no DST).
function baghdadDayStart(): string {
  return `${businessDay()}T00:00:00+03:00`;
}

/** «تصفير الحساب اليومي» — record a reset point for internal shift settlement.
 *  Non-destructive: no order is deleted; only the dashboard's TODAY view starts
 *  counting again from now. The Telegram bot is unaffected (full day). Admin only. */
export async function resetDailyAccount(): Promise<{ ok: true }> {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  await svc.from("daily_resets").insert({});
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Today's rollup counting only orders/expenses AFTER the latest reset (or day
 *  start if none). Drives the dashboard's TODAY card so a shift settlement zeros
 *  it. Admin only (reads profit → service client). */
export async function getTodaySinceReset(): Promise<DaySummary> {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const day = businessDay();
  const dayStart = baghdadDayStart();

  const { data: resets } = await svc
    .from("daily_resets")
    .select("reset_at")
    .gte("reset_at", dayStart)
    .order("reset_at", { ascending: false })
    .limit(1);
  const cutoff = resets?.[0]?.reset_at ?? dayStart;

  const { data: orders, error: ordErr } = await svc
    .from("orders")
    .select("subtotal, discount, extra, cost_total")
    .eq("status", "paid")
    .gte("paid_at", cutoff);
  if (ordErr) throw new Error(`تعذّر جلب طلبات اليوم: ${ordErr.message}`);
  // subtotal − discount + extra: the same expression range_summary,
  // session_report, bep_today, partner_balances and the daily count all use.
  // This card alone summed the raw subtotal, so every discount the shop granted
  // made the dashboard's «اليوم» disagree with the Z-report and the جرد sheet
  // by exactly that amount — two screens, two numbers, same day, no way to tell
  // which the cash should match.
  const money = (o: { subtotal: number | null; discount: number | null; extra: number | null }) =>
    (o.subtotal ?? 0) - (o.discount ?? 0) + (o.extra ?? 0);
  const sales = (orders ?? []).reduce((s, o) => s + money(o), 0);
  const cost = (orders ?? []).reduce((s, o) => s + (o.cost_total ?? 0), 0);
  const orders_count = (orders ?? []).length;

  const { data: exps, error: expErr } = await svc.from("expenses").select("amount").gte("created_at", cutoff);
  if (expErr) throw new Error(`تعذّر جلب مصاريف اليوم: ${expErr.message}`);
  const expenses = (exps ?? []).reduce((s, e) => s + (e.amount ?? 0), 0);

  const profit = sales - cost;
  return { day, sales, orders_count, profit, expenses, net: profit - expenses };
}

/** Estimated guest count over a range = total item quantity on paid orders
 *  (one item ≈ one guest). Aggregated server-side by the guest_estimate RPC so
 *  it isn't silently capped by PostgREST's 1000-row limit. Admin only. */
export async function getGuestEstimate(from: string, to: string): Promise<number> {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { data } = await svc.rpc("guest_estimate", { p_from: from, p_to: to });
  return Number(data) || 0;
}

export type RecentOrderItem = { name_ar: string; flavor_ar: string | null; qty: number; line_total: number };
export type RecentOrder = {
  id: string;
  order_seq: number;
  channel: string;
  status: string;
  subtotal: number;
  table_no: string | null;
  created_at: string;
  items: RecentOrderItem[];
};

/** Recent orders WITH their stored line items — every table order stays reviewable. */
export async function getRecentOrders(limit = 15): Promise<RecentOrder[]> {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { data: orders } = await svc
    .from("orders")
    .select("id, order_seq, channel, status, subtotal, table_no, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!orders?.length) return [];

  const ids = orders.map((o) => o.id);
  const { data: items } = await svc
    .from("order_items")
    .select("order_id, name_ar, flavor_ar, qty, line_total")
    .in("order_id", ids);
  const byOrder = new Map<string, RecentOrderItem[]>();
  for (const it of items ?? []) {
    const arr = byOrder.get(it.order_id) ?? [];
    arr.push({ name_ar: it.name_ar, flavor_ar: it.flavor_ar, qty: it.qty, line_total: it.line_total });
    byOrder.set(it.order_id, arr);
  }
  return orders.map((o) => ({ ...o, items: byOrder.get(o.id) ?? [] })) as RecentOrder[];
}
