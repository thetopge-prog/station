"use server";

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "./auth";

/**
 * The «who is calling» strip on the till.
 *
 * A call is only interesting for a minute or two: the phone rings, somebody
 * answers, the order is taken. Anything older is history nobody needs on a
 * working screen, so the window is deliberately short and the strip disappears
 * on its own rather than accumulating.
 */

/** how long a ringing call stays on screen before it stops being news */
const WINDOW_SECONDS = 180;

/** one line of the previous receipt, complete enough to re-order it */
export type LastLine = {
  itemId: string | null;
  variantId: string | null;
  flavor: string | null;
  name: string;
  qty: number;
  unitPrice: number;
};

/** what they ordered last time, so the cashier can say «نفس الطلب؟» */
export type LastOrder = { at: string; seq: number; total: number; lines: LastLine[] };

export type IncomingCall = {
  id: string;
  phone: string;
  at: string;
  /** filled when this number has ordered before — the whole point */
  name: string | null;
  address: string | null;
  points: number | null;
};

export async function latestCall(): Promise<IncomingCall | null> {
  await requireStaff();
  const svc = createSupabaseServiceClient();

  const since = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();
  const { data: call } = await svc
    .from("incoming_calls")
    .select("id, phone, customer_id, created_at, caller_name")
    .is("handled_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!call) return null;

  // Looked up now rather than trusted from insert time: the customer may have
  // been created, renamed or given an address in the seconds since the ring.
  const { data: c } = call.customer_id
    ? await svc.from("customers").select("name_ar, address, points").eq("id", call.customer_id).maybeSingle()
    : await svc.from("customers").select("name_ar, address, points").eq("phone", call.phone).maybeSingle();

  return {
    id: call.id,
    phone: call.phone,
    at: call.created_at,
    // a WhatsApp caller saved in the phone's contacts arrives as a name and
    // no number; showing it beats showing nothing
    name: c?.name_ar ?? call.caller_name ?? null,
    address: c?.address ?? null,
    points: c?.points ?? null,
  };
}

/**
 * The three orders worth offering — «نفس الطلب؟» asked properly.
 *
 * Called when the card OPENS, never from the four-second poll: a strip that
 * says whether the phone is ringing must stay one cheap query, and dragging a
 * receipt behind every tick was a slowdown I introduced myself.
 *
 * «Different» means different CONTENT, not a different date. A regular who
 * orders the same two burgers every Friday has one order, not eight, and
 * showing it three times would waste the whole panel. Orders are folded by a
 * signature of (item, quantity) so the three on screen are three real choices.
 *
 * Matched by customer OR by the phone on the order, because a delivery order
 * taken at the counter may never have been attached to a loyalty card — and to
 * the person on the phone it is still their last order.
 */
export async function recentDistinctOrders(phone: string, customerId?: string | null, want = 3): Promise<LastOrder[]> {
  await requireStaff();
  const svc = createSupabaseServiceClient();

  const q = svc
    .from("orders")
    .select("id, order_seq, subtotal, discount, extra, created_at")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    // deep enough that three DIFFERENT baskets exist even for somebody who
    // orders the same thing most weeks
    .limit(15);

  const { data: orders } = customerId ? await q.eq("customer_id", customerId) : await q.eq("customer_phone", phone.trim());
  if (!orders?.length) return [];

  const { data: allItems } = await svc
    .from("order_items")
    .select("order_id, item_id, variant_id, flavor_ar, name_ar, qty, unit_price")
    .in("order_id", orders.map((o) => o.id));

  const byOrder = new Map<string, LastLine[]>();
  for (const i of allItems ?? []) {
    const arr = byOrder.get(i.order_id) ?? [];
    arr.push({ itemId: i.item_id, variantId: i.variant_id, flavor: i.flavor_ar, name: i.name_ar, qty: i.qty, unitPrice: i.unit_price });
    byOrder.set(i.order_id, arr);
  }

  const seen = new Set<string>();
  const out: LastOrder[] = [];
  for (const o of orders) {
    const lines = byOrder.get(o.id) ?? [];
    if (!lines.length) continue;
    const signature = lines
      .map((l) => `${l.itemId ?? l.name}|${l.variantId ?? ""}|${l.qty}`)
      .sort()
      .join("~");
    if (seen.has(signature)) continue;
    seen.add(signature);
    out.push({
      at: o.created_at,
      seq: o.order_seq,
      total: +o.subtotal - +o.discount + +o.extra,
      lines,
    });
    if (out.length >= want) break;
  }
  return out;
}


/**
 * Name and address, saved on the CUSTOMER.
 *
 * This caller always orders delivery, and until now the address lived only on
 * whichever order happened to carry it. Saving it here is what turns the second
 * call into «نوصّلها لنفس العنوان؟» instead of the whole interrogation again.
 */
export async function saveCallerDetails(phone: string, name: string, address: string) {
  await requireStaff();
  const p = phone.trim();
  if (!p) return { ok: false as const, error: "لا يوجد رقم." };

  const patch: { name_ar?: string; address?: string } = {};
  if (name.trim()) patch.name_ar = name.trim();
  if (address.trim()) patch.address = address.trim();
  if (!Object.keys(patch).length) return { ok: false as const, error: "أدخل الاسم أو العنوان." };

  const svc = createSupabaseServiceClient();
  const { data: existing } = await svc.from("customers").select("id").eq("phone", p).maybeSingle();
  const { error } = existing
    ? await svc.from("customers").update(patch).eq("id", existing.id)
    : await svc.from("customers").insert({ phone: p, ...patch });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/**
 * Find or create the customer behind a ringing number, so the button on the
 * banner works for somebody who has never ordered before. Without this, «ابدأ
 * طلباً لهذا الرقم» did nothing at all for a new caller — which is every
 * caller, once.
 */
export async function customerForCall(phone: string): Promise<{ id: string; name_ar: string | null; points: number; serial: string } | null> {
  await requireStaff();
  const p = phone.trim();
  if (!p) return null;
  const svc = createSupabaseServiceClient();

  const { data: found } = await svc.from("customers").select("id, name_ar, points, card_serial").eq("phone", p).maybeSingle();
  if (found) return { id: found.id, name_ar: found.name_ar, points: found.points, serial: found.card_serial };

  const { data: created, error } = await svc
    .from("customers")
    .insert({ phone: p })
    .select("id, name_ar, points, card_serial")
    .maybeSingle();
  if (error || !created) return null;
  return { id: created.id, name_ar: created.name_ar, points: created.points, serial: created.card_serial };
}

/** The cashier acted on it (or dismissed it) — stop showing it. */
export async function markCallHandled(id: string) {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  await svc.from("incoming_calls").update({ handled_at: new Date().toISOString() }).eq("id", id);
  return { ok: true as const };
}

/**
 * Remember where this customer lives.
 *
 * Called after a delivery order, so the second order never asks again. The
 * address lives on the CUSTOMER; orders keep their own copy, because somebody
 * who moves house must not have last month's receipts rewritten.
 */
export async function rememberAddress(phone: string, address: string, name?: string | null) {
  await requireStaff();
  const p = phone.trim();
  const a = address.trim();
  if (!p || !a) return { ok: false as const, error: "الرقم والعنوان مطلوبان." };

  const svc = createSupabaseServiceClient();
  const { data: existing } = await svc.from("customers").select("id, name_ar").eq("phone", p).maybeSingle();
  if (existing) {
    await svc
      .from("customers")
      .update({ address: a, ...(name?.trim() && !existing.name_ar ? { name_ar: name.trim() } : {}) })
      .eq("id", existing.id);
    return { ok: true as const, customerId: existing.id };
  }

  const { data: created, error } = await svc
    .from("customers")
    .insert({ phone: p, address: a, name_ar: name?.trim() || null })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, customerId: created?.id ?? null };
}
