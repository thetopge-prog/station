"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireRole, requireStaff } from "./auth";

/**
 * The kitchen side of an order: what the chefs cook, what the expediter
 * assembles, and what the cleaning crew clears.
 *
 * Everything here moves `orders.prep_status` and never `orders.status` — money
 * state stays exclusively with the cashier flow (see 0023/0024).
 */

export type PrepItem = {
  id: string;
  name_ar: string;
  flavor_ar: string | null;
  qty: number;
  /** null when the item's category has no station (sauces, drinks) */
  station_id: string | null;
  station_name: string | null;
  category_name: string | null;
};

export type PrepOrder = {
  id: string;
  order_seq: number;
  pickup_code: string | null;
  prep_status: "new" | "preparing" | "ready" | "handed";
  status: string;
  channel: string;
  table_no: string | null;
  note: string | null;
  eta_minutes: number | null;
  created_at: string;
  cashier_name: string | null;
  expediter_name: string | null;
  /** curbside/delivery only — the runner messages or calls this */
  customer_phone: string | null;
  customer_name: string | null;
  /** set once «أبلِغ الزبون» has been used, so nobody is messaged twice */
  notified_at: string | null;
  items: PrepItem[];
};

/**
 * Orders still in the kitchen, oldest first.
 *
 * `stationId` filters to one station's work — that is the chef KDS. Passing
 * null returns everything, which is what the expediter needs.
 *
 * Uses the SERVICE client on purpose: this joins order_items → menu_items →
 * categories → stations to resolve routing, and menu_items is revoked from
 * `authenticated` at the column level. requireRole above is the gate.
 */
export async function listPrepOrders(stationId: string | null = null): Promise<PrepOrder[]> {
  await requireRole("chef", "expediter", "cashier");
  const svc = createSupabaseServiceClient();

  const { data: orders } = await svc
    .from("orders")
    .select("id, order_seq, pickup_code, prep_status, status, channel, table_no, note, eta_minutes, created_at, cashier_id, expediter_id, customer_phone, customer_name, notified_at")
    .in("prep_status", ["new", "preparing", "ready"])
    .neq("status", "cancelled")
    .order("created_at", { ascending: true })
    .limit(60);
  if (!orders?.length) return [];

  const ids = orders.map((o) => o.id);
  const { data: rawItems } = await svc
    .from("order_items")
    .select("id, order_id, name_ar, flavor_ar, qty, item_id")
    .in("order_id", ids);

  // resolve item → category → station in two small lookups rather than a join
  // per row; the menu is a few dozen rows, so this is cheaper than it looks.
  const itemIds = [...new Set((rawItems ?? []).map((i) => i.item_id).filter(Boolean))] as string[];
  const { data: menu } = itemIds.length
    ? await svc.from("menu_items").select("id, category_id").in("id", itemIds)
    : { data: [] };
  const { data: cats } = await svc.from("categories").select("id, name_ar, station_id");
  const { data: stations } = await svc.from("stations").select("id, name_ar");

  const catOfItem = new Map((menu ?? []).map((m) => [m.id, m.category_id]));
  const cat = new Map((cats ?? []).map((c) => [c.id, c]));
  const stationName = new Map((stations ?? []).map((s) => [s.id, s.name_ar]));

  const empIds = [...new Set(orders.flatMap((o) => [o.cashier_id, o.expediter_id]).filter(Boolean))] as string[];
  const { data: emps } = empIds.length
    ? await svc.from("employees").select("id, name_ar").in("id", empIds)
    : { data: [] };
  const empName = new Map((emps ?? []).map((e) => [e.id, e.name_ar]));

  const byOrder = new Map<string, PrepItem[]>();
  for (const it of rawItems ?? []) {
    const categoryId = it.item_id ? catOfItem.get(it.item_id) ?? null : null;
    const c = categoryId ? cat.get(categoryId) ?? null : null;
    const sid = c?.station_id ?? null;
    const arr = byOrder.get(it.order_id) ?? [];
    arr.push({
      id: it.id,
      name_ar: it.name_ar,
      flavor_ar: it.flavor_ar,
      qty: it.qty,
      station_id: sid,
      station_name: sid ? stationName.get(sid) ?? null : null,
      category_name: c?.name_ar ?? null,
    });
    byOrder.set(it.order_id, arr);
  }

  return orders
    .map((o) => {
      const all = byOrder.get(o.id) ?? [];
      // a chef sees only their station's items — and only orders that have any
      const items = stationId ? all.filter((i) => i.station_id === stationId) : all;
      return {
        id: o.id,
        order_seq: o.order_seq,
        pickup_code: o.pickup_code,
        prep_status: o.prep_status,
        status: o.status,
        channel: o.channel,
        table_no: o.table_no,
        note: o.note,
        eta_minutes: o.eta_minutes,
        created_at: o.created_at,
        cashier_name: o.cashier_id ? empName.get(o.cashier_id) ?? null : null,
        expediter_name: o.expediter_id ? empName.get(o.expediter_id) ?? null : null,
        customer_phone: o.customer_phone,
        customer_name: o.customer_name,
        notified_at: o.notified_at,
        items,
      };
    })
    .filter((o) => o.items.length > 0);
}

async function rpc(fn: "claim_expediter" | "confirm_assembled", orderId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(fn, { p_order: orderId });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/queue");
  revalidatePath("/expediter");
  revalidatePath("/kds");
  return { ok: true as const };
}

/** Expediter picks up an order — stamps their name and moves it to «قيد التجهيز». */
export async function claimOrder(orderId: string) {
  await requireRole("expediter", "cashier");
  return rpc("claim_expediter", orderId);
}

/**
 * «إعادة استلام / تأكيد» — the expediter confirms the bag is complete.
 *
 * This is the accountability event, not just a status flip: confirm_assembled
 * stamps whoever confirmed (falling back to the shift holder for a shared
 * tablet) and only then does the order move to «جاهز» on the customer display.
 */
export async function confirmAssembled(orderId: string) {
  await requireRole("expediter", "cashier");
  return rpc("confirm_assembled", orderId);
}

/** Handed to the customer — drops off every screen. */
export async function markOrderHanded(orderId: string) {
  await requireRole("expediter", "cashier");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_prep_status", { p_order: orderId, p_status: "handed" });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/queue");
  revalidatePath("/expediter");
  return { ok: true as const };
}

/**
 * Record that the customer has been messaged about a curbside order.
 *
 * The WhatsApp message itself is sent from the staff phone — this only stamps
 * the order so the button greys out. Separating the two means a failed or
 * abandoned send never leaves the order looking handled.
 */
export async function markNotified(orderId: string) {
  await requireRole("expediter", "cashier");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_notified", { p_order: orderId });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/expediter");
  return { ok: true as const };
}

/** Chef marks their station's part of an order as cooking. */
export async function startCooking(orderId: string) {
  await requireRole("chef", "expediter", "cashier");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_prep_status", { p_order: orderId, p_status: "preparing" });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/kds");
  revalidatePath("/queue");
  return { ok: true as const };
}

/* ── table cleaning ──────────────────────────────────────────────────────── */

export type CleaningTable = {
  name: string;
  kind: string;
  clean_status: "clean" | "dirty";
  cleaned_at: string | null;
};

export async function listCleaningTables(): Promise<CleaningTable[]> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("cafe_tables")
    .select("name, kind, clean_status, cleaned_at")
    .eq("active", true)
    .order("sort", { ascending: true });
  return (data ?? []) as CleaningTable[];
}

export async function markTableClean(name: string) {
  await requireRole("cleaner", "cashier");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_table_clean", { p_name: name });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/clean");
  revalidatePath("/tables");
  return { ok: true as const };
}

export async function markTableDirty(name: string) {
  await requireRole("cleaner", "cashier");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_table_dirty", { p_name: name });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/clean");
  return { ok: true as const };
}

/**
 * Table names as they appear in the QR/NFC payloads that /qr already prints.
 * The cleaning crew scans a sticker, this turns the scanned text into a table.
 */
export async function resolveScannedTable(scanned: string): Promise<string | null> {
  await requireStaff();
  const raw = scanned.trim();
  // stickers encode a URL like https://…/menu?t=5 — pull the t param out
  const fromUrl = /[?&]t=([^&#\s]+)/.exec(raw)?.[1];
  const candidate = decodeURIComponent(fromUrl ?? raw);

  const svc = createSupabaseServiceClient();
  const { data } = await svc.from("cafe_tables").select("name").eq("active", true);
  const match = (data ?? []).find((t) => t.name === candidate);
  return match?.name ?? null;
}
