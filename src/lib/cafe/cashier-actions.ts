"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/types";
import { requireStaff } from "./auth";
import { openSessionIdFor } from "./session-of";
import { loyaltyConfig } from "./config";
import { earnPoints } from "./points";
import type { OrderLineInput } from "./order-actions";

/** How the counter was settled. "partner" = billed to a delivery company and
 *  collected later, so it never reaches the drawer. */
export type PayMethod = "cash" | "card" | "partner";

export type PendingItem = { name_ar: string; flavor_ar: string | null; qty: number; unit_price: number; line_total: number };
export type PendingOrder = {
  id: string;
  order_seq: number;
  channel: string;
  subtotal: number;
  table_no: string | null;
  note: string | null;
  created_at: string;
  items: PendingItem[];
};

/** Self-orders (qr/kiosk) awaiting the counter, oldest first. */
export async function listPendingOrders(): Promise<PendingOrder[]> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_seq, channel, subtotal, table_no, note, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (!orders?.length) return [];

  const ids = orders.map((o) => o.id);
  const { data: items } = await supabase
    .from("order_items")
    .select("order_id, name_ar, flavor_ar, qty, unit_price, line_total")
    .in("order_id", ids);

  const byOrder = new Map<string, PendingItem[]>();
  for (const it of items ?? []) {
    const arr = byOrder.get(it.order_id) ?? [];
    arr.push({ name_ar: it.name_ar, flavor_ar: it.flavor_ar, qty: it.qty, unit_price: it.unit_price, line_total: it.line_total });
    byOrder.set(it.order_id, arr);
  }
  return orders.map((o) => ({
    id: o.id,
    order_seq: o.order_seq,
    channel: o.channel,
    subtotal: o.subtotal,
    table_no: o.table_no,
    note: o.note,
    created_at: o.created_at,
    items: byOrder.get(o.id) ?? [],
  }));
}

async function payOrder(
  supabase: SupabaseClient<Database>,
  orderId: string,
  discount: number,
  customerId: string | null,
  extra = 0,
  extraNote: string | null = null,
): Promise<{ ok: true; total: number; awarded: number } | { ok: false; error: string }> {
  const { data: ord } = await supabase.from("orders").select("subtotal, customer_id").eq("id", orderId).maybeSingle();
  const subtotal = ord?.subtotal ?? 0;
  const disc = Math.max(0, Math.round(discount));
  const ext = Math.max(0, Math.round(extra));
  const net = Math.max(0, subtotal - disc + ext);
  const cfg = loyaltyConfig();
  // award points to whoever the order belongs to — the customer attached at the
  // counter OR the one the self-order already carries (phone entered on the menu)
  const beneficiary = customerId ?? ord?.customer_id ?? null;
  const award = beneficiary ? earnPoints(net, cfg.pointsPerIqd) : 0;
  const { error } = await supabase.rpc("mark_order_paid", {
    p_order: orderId,
    p_discount: disc,
    p_customer: customerId,
    p_award_points: award,
    p_extra: ext,
    p_extra_note: extraNote?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, total: net, awarded: award };
}

export type CheckoutResult =
  // orderId is what the POS feeds to buildOrderJobs for the 5-printer split
  | {
      ok: true;
      orderId: string;
      orderNumber: string;
      total: number;
      awarded: number;
      pickupCode: string | null;
      /** the sale went through but could not be attributed to a shift */
      warning?: string;
    }
  | { ok: false; error: string };

/** Cashier: create an order and mark it paid in one step (pay at counter).
 *  A table number means dine-in — it feeds the live tables screen. */

/**
 * The three facts that turn a paid order into an accountable one.
 *
 * Written with the SERVICE client, not the caller's. `orders` grants
 * `authenticated` SELECT and nothing else — there is no update grant and no
 * update policy anywhere in the schema — so the direct table update that lived
 * here was refused every single time, silently, because nobody read the error.
 *
 * Every paid order in the shop carried payment_method NULL and session_id NULL.
 * The Z-report keys on session_id, so it counted nothing; expected cash was
 * computed without the takings, and the cashier was shown a SURPLUS the size of
 * everything they had sold. The delivery-partner ledger keys on partner_id, so
 * it was empty too.
 *
 * The gate is requireStaff() in the callers, which is the same boundary
 * expense-actions.ts relies on for the same reason.
 *
 * A failure here does not undo a sale that already happened — the money is in
 * the drawer either way — but it is never swallowed again.
 */
async function stampPayment(
  orderId: string,
  employeeId: string,
  payMethod: PayMethod,
  partnerId: string | null,
): Promise<string | null> {
  const svc = createSupabaseServiceClient();
  const { error } = await svc
    .from("orders")
    .update({
      payment_method: payMethod,
      // The order belongs to the shift that took it — a partner order shows in
      // the shift's count, never in its cash.
      session_id: await openSessionIdFor(employeeId),
      partner_id: payMethod === "partner" ? partnerId : null,
    })
    .eq("id", orderId);
  if (error) {
    console.error("stampPayment failed", { orderId, message: error.message });
    return error.message;
  }
  return null;
}

export async function cashierCheckout(input: {
  lines: OrderLineInput[];
  discount?: number;
  extra?: number;
  extraNote?: string | null;
  customerId?: string | null;
  table?: string | null;
  note?: string | null;
  /** cash, Qi card, or billed to a delivery company — recorded, not just used
   *  to decide the drawer kick */
  payMethod?: PayMethod;
  /** required when payMethod is "partner": which company is being billed */
  partnerId?: string | null;
}): Promise<CheckoutResult> {
  const staff = await requireStaff();
  if (!input.lines?.length) return { ok: false, error: "لا توجد أصناف في الطلب." };
  // A partner sale with no partner is an untraceable receivable: revenue booked,
  // nobody to invoice. Refuse it here rather than discover it at settlement.
  if (input.payMethod === "partner" && !input.partnerId) {
    return { ok: false, error: "اختر شركة التوصيل." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: placed, error } = await supabase.rpc("place_order", {
    p_channel: "cashier",
    p_lines: input.lines as unknown as Json,
    p_customer: input.customerId ?? null,
    p_table: input.table?.trim() || null,
    p_note: input.note?.trim() || null,
  });
  if (error || !placed?.[0]) return { ok: false, error: error?.message ?? "تعذّر إنشاء الطلب." };

  const paid = await payOrder(supabase, placed[0].order_id, input.discount ?? 0, input.customerId ?? null, input.extra ?? 0, input.extraNote ?? null);
  if (!paid.ok) return paid;

  // Stamp the money facts AFTER payment succeeds — see stampPayment.
  const stampErr = await stampPayment(
    placed[0].order_id,
    staff.employeeId,
    input.payMethod ?? "cash",
    input.partnerId ?? null,
  );

  revalidatePath("/cashier");
  revalidatePath("/dashboard");
  return {
    ok: true,
    // The sale stands; the attribution may not. Surfaced rather than hidden,
    // because an unattributed sale becomes a shortage on somebody's shift.
    warning: stampErr ? "الطلب مدفوع لكنه لم يُنسب للوردية — راجع المطوّر." : undefined,
    orderId: placed[0].order_id,
    orderNumber: String(placed[0].order_seq).padStart(3, "0"),
    // the 3-character code the customer quotes at handover (0043)
    pickupCode: placed[0].pickup_code ?? null,
    total: paid.total,
    awarded: paid.awarded,
  };
}

/**
 * Accept & pay an existing pending self-order from the queue.
 *
 * Stamps the same two money facts cashierCheckout does. It did not before, so
 * a self-order paid at the counter counted toward NO payment method and NO
 * session: its cash was invisible to the Z-report, and the drawer expected
 * less than it held. A shortage hiding inside a surplus is still a shortage.
 */
export async function payPendingOrder(
  orderId: string,
  discount = 0,
  customerId: string | null = null,
  payMethod: PayMethod = "cash",
  partnerId: string | null = null,
) {
  const staff = await requireStaff();
  if (payMethod === "partner" && !partnerId) return { ok: false as const, error: "اختر شركة التوصيل." };
  const supabase = await createSupabaseServerClient();
  const paid = await payOrder(supabase, orderId, discount, customerId);
  if (!paid.ok) return paid;
  const stampErr = await stampPayment(orderId, staff.employeeId, payMethod, partnerId);
  revalidatePath("/cashier");
  revalidatePath("/dashboard");
  return {
    ok: true as const,
    awarded: paid.awarded,
    warning: stampErr ? "الطلب مدفوع لكنه لم يُنسب للوردية — راجع المطوّر." : undefined,
  };
}

export async function cancelOrder(orderId: string) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_order", { p_order: orderId });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/cashier");
  return { ok: true as const };
}
