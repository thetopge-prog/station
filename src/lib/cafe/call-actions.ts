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
    .select("id, phone, customer_id, created_at")
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
    name: c?.name_ar ?? null,
    address: c?.address ?? null,
    points: c?.points ?? null,
  };
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
