"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAdmin, requireStaff } from "./auth";
import { businessDay } from "./time";
import { daysUntil, type StockRow } from "./inventory";

export type { StockRow, StockState } from "./inventory";

/**
 * Raw materials, batches and expiry.
 *
 * On-hand is always derived from `stock_status`, never cached in the app: the
 * one number a kitchen must be able to trust is how much is actually left, and
 * a cached total is wrong the moment anyone edits history.
 */

export async function listStock(): Promise<StockRow[]> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("stock_status")
    .select("id, name_ar, unit, category, min_qty, on_hand, avg_unit_cost, nearest_expiry, stock_state");
  return (data ?? []) as StockRow[];
}

export type BatchRow = {
  id: string;
  ingredient_id: string;
  qty_remaining: number;
  unit_cost: number;
  received_on: string;
  expiry_date: string | null;
  supplier: string | null;
};

/** Open batches, nearest expiry first — the order they must be used in. */
export async function listBatches(ingredientId?: string): Promise<BatchRow[]> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  let qb = svc
    .from("inventory_batches")
    .select("id, ingredient_id, qty_remaining, unit_cost, received_on, expiry_date, supplier")
    .gt("qty_remaining", 0)
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .limit(200);
  if (ingredientId) qb = qb.eq("ingredient_id", ingredientId);
  const { data } = await qb;
  return (data ?? []) as BatchRow[];
}

export async function receiveStock(input: {
  ingredientId: string;
  qty: number;
  unitCost?: number;
  expiry?: string | null;
  supplier?: string | null;
  note?: string | null;
}) {
  await requireStaff();
  if (!(input.qty > 0)) return { ok: false as const, error: "أدخل كمية صحيحة." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("receive_stock", {
    p_ingredient: input.ingredientId,
    p_qty: input.qty,
    p_unit_cost: Math.max(0, Math.round(input.unitCost ?? 0)),
    p_expiry: input.expiry || null,
    p_supplier: input.supplier?.trim() || null,
    p_note: input.note?.trim() || null,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/inventory");
  return { ok: true as const };
}

/**
 * Take stock out — cooking, waste, or a correction after a physical count.
 *
 * Returns the shortfall when there was not enough on hand. The kitchen has
 * already used the food by the time anyone types this, so refusing would only
 * make the books wrong; recording the negative keeps them honest.
 */
export async function consumeStock(input: {
  ingredientId: string;
  qty: number;
  reason: "consume" | "waste" | "expired" | "adjust";
  note?: string | null;
}) {
  await requireStaff();
  if (!(input.qty > 0)) return { ok: false as const, error: "أدخل كمية صحيحة." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("consume_stock", {
    p_ingredient: input.ingredientId,
    p_qty: input.qty,
    p_reason: input.reason,
    p_note: input.note?.trim() || null,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/inventory");
  return { ok: true as const, shortfall: Number(data ?? 0) };
}

export async function saveIngredient(input: {
  id?: string;
  name_ar: string;
  unit: string;
  category?: string | null;
  min_qty: number;
  default_shelf_days?: number | null;
  is_active?: boolean;
}) {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const row = {
    name_ar: input.name_ar.trim(),
    unit: input.unit,
    category: input.category?.trim() || null,
    min_qty: Math.max(0, input.min_qty || 0),
    default_shelf_days: input.default_shelf_days ?? null,
    is_active: input.is_active ?? true,
  };
  if (!row.name_ar) return { ok: false as const, error: "أدخل اسم المادة." };
  const { error } = input.id
    ? await svc.from("ingredients").update(row).eq("id", input.id)
    : await svc.from("ingredients").insert(row);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/inventory");
  return { ok: true as const };
}

/* ── shortage purchase order ─────────────────────────────────────────────── */

export type PoLine = {
  name_ar: string;
  unit: string;
  on_hand: number;
  min_qty: number;
  qty: number;
  est_unit_cost: number;
};
export type PurchaseOrder = { id: string; business_day: string; created_at: string; lines: PoLine[]; total: number };

/** فاتورة النواقص — everything at or below its reorder point. */
export async function createShortagePo(note?: string) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("generate_shortage_po", { p_note: note?.trim() || null });
  if (error) return { ok: false as const, error: error.message };
  if (!data) return { ok: false as const, error: "لا توجد نواقص — كل المواد فوق حد الطلب." };
  revalidatePath("/inventory");
  return { ok: true as const, poId: data as unknown as string };
}

export async function getPurchaseOrder(poId: string): Promise<PurchaseOrder | null> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { data: po } = await svc
    .from("purchase_orders")
    .select("id, business_day, created_at")
    .eq("id", poId)
    .maybeSingle();
  if (!po) return null;

  const { data: rawLines } = await svc
    .from("purchase_order_lines")
    .select("ingredient_id, on_hand, min_qty, qty, est_unit_cost")
    .eq("po_id", poId);

  const ids = (rawLines ?? []).map((l) => l.ingredient_id);
  const { data: ings } = ids.length
    ? await svc.from("ingredients").select("id, name_ar, unit").in("id", ids)
    : { data: [] };
  const info = new Map((ings ?? []).map((i) => [i.id, i]));

  const lines: PoLine[] = (rawLines ?? []).map((l) => ({
    name_ar: info.get(l.ingredient_id)?.name_ar ?? "—",
    unit: info.get(l.ingredient_id)?.unit ?? "",
    on_hand: Number(l.on_hand),
    min_qty: Number(l.min_qty),
    qty: Number(l.qty),
    est_unit_cost: l.est_unit_cost,
  }));

  return {
    ...po,
    lines,
    total: lines.reduce((s, l) => s + l.qty * l.est_unit_cost, 0),
  };
}

/** Dashboard badge: what needs attention right now. */
export async function inventoryAlerts(): Promise<{ low: number; expiringSoon: number; expired: number }> {
  await requireStaff();
  const rows = await listStock();
  const today = businessDay();
  let expiringSoon = 0;
  let expired = 0;
  for (const r of rows) {
    const d = daysUntil(r.nearest_expiry, today);
    if (d === null) continue;
    if (d < 0) expired++;
    else if (d <= 3) expiringSoon++;
  }
  return { low: rows.filter((r) => r.stock_state !== "ok").length, expiringSoon, expired };
}
