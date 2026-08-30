"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "./auth";
import { foldShortages, type ShortageRow } from "./shortage";

/**
 * The till's side of «صنف نفد».
 *
 * The expediter marks a line unavailable and walks on with the bag. Somebody
 * still has to ring the customer, and that somebody is at the counter — so the
 * alert is derived here rather than pushed: an order carrying an unavailable
 * line that nobody has acknowledged IS the alert, and it survives a reload, a
 * different device, and a cashier who wandered off mid-shift.
 */

export type Shortage = {
  orderId: string;
  orderSeq: number;
  items: string[];
  phone: string | null;
  customerName: string | null;
  newTotal: number;
  /** already paid in full, so this much has to physically go back */
  refundDue: number;
};

/** how far back to look — older than this and the customer has long gone */
const WINDOW_HOURS = 6;

export async function pendingShortage(): Promise<Shortage | null> {
  await requireStaff();
  const svc = createSupabaseServiceClient();

  const since = new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString();
  const { data: orders } = await svc
    .from("orders")
    .select("id, order_seq, subtotal, discount, extra, status, customer_phone, customer_name")
    .is("shortage_ack_at", null)
    .neq("status", "cancelled")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  if (!orders?.length) return null;

  // one query for the missing lines across every candidate, rather than one
  // per order — the till polls this and the database is not next door
  const { data: gone } = await svc
    .from("order_items")
    .select("order_id, name_ar, qty, unit_price")
    .in("order_id", orders.map((o) => o.id))
    .not("unavailable_at", "is", null);
  if (!gone?.length) return null;

  const first = orders.find((o) => gone.some((g) => g.order_id === o.id));
  if (!first) return null;

  const lines = gone.filter((g) => g.order_id === first.id);
  const newTotal = +first.subtotal - +first.discount + +first.extra;
  const lost = lines.reduce((sum, l) => sum + l.unit_price * l.qty, 0);

  return {
    orderId: first.id,
    orderSeq: first.order_seq,
    items: lines.map((l) => (l.qty > 1 ? `${l.qty}× ${l.name_ar}` : l.name_ar)),
    phone: first.customer_phone,
    customerName: first.customer_name,
    newTotal,
    // money already taken for something that never left the kitchen
    refundDue: first.status === "paid" ? lost : 0,
  };
}

/** The cashier rang the customer. Stop shouting. */
export async function ackShortage(orderId: string) {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("orders").update({ shortage_ack_at: new Date().toISOString() }).eq("id", orderId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/cashier");
  return { ok: true as const };
}

/**
 * «الأصناف التي نفدت» — the report that decides what to buy more of.
 *
 * Every 🚫 the expediter presses is a sale that walked out of the door, and
 * until now that fact lived in one row nobody ever read again.
 *
 * `lost` is the money the shop did NOT take — the sharpest number here, because
 * «نفد ثلاث مرات» sounds small next to «نفد ثلاث مرات وكلّفنا ٤٥٬٠٠٠».
 */
export async function shortageReport(days: number): Promise<ShortageRow[]> {
  await requireStaff();
  const svc = createSupabaseServiceClient();

  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await svc
    .from("order_items")
    .select("name_ar, qty, unit_price, unavailable_at")
    .not("unavailable_at", "is", null)
    .gte("unavailable_at", since)
    // newest first — foldShortages reads «آخر مرة» off the first sighting
    .order("unavailable_at", { ascending: false })
    .limit(500);
  return foldShortages(data ?? []);
}
