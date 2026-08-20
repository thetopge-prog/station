"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "./auth";
import { businessDay } from "./time";

export type BatchState = "fresh" | "soon" | "expired";
export type PastryBatch = {
  id: string;
  item_name: string;
  quantity: number;
  deposited_on: string;
  shelf_days: number;
  note: string | null;
  days_remaining: number;
  state: BatchState;
};

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** whole days from today (Baghdad) until the given date; negative = past */
function daysUntil(dateStr: string): number {
  const target = new Date(`${dateStr}T00:00:00Z`).getTime();
  const today = new Date(`${businessDay()}T00:00:00Z`).getTime();
  return Math.round((target - today) / 86_400_000);
}
function withState(b: { id: string; item_name: string; quantity: number; deposited_on: string; shelf_days: number; note: string | null }): PastryBatch {
  const remaining = daysUntil(addDays(b.deposited_on, b.shelf_days));
  return { ...b, days_remaining: remaining, state: remaining < 0 ? "expired" : remaining <= 1 ? "soon" : "fresh" };
}

// ── pastry inventory ────────────────────────────────────────────────────────

export async function addPastryBatch(input: { item_name: string; quantity: number; deposited_on?: string; note?: string }) {
  await requireStaff();
  const name = input.item_name.trim();
  if (!name) return { ok: false as const, error: "أدخل نوع المعجّن." };
  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("pastry_batches").insert({
    item_name: name,
    quantity: Math.max(0, Math.round(input.quantity || 0)),
    deposited_on: input.deposited_on?.trim() || businessDay(),
    note: input.note?.trim() || null,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/pastries");
  return { ok: true as const };
}

export async function listPastryBatches(): Promise<PastryBatch[]> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("pastry_batches")
    .select("id, item_name, quantity, deposited_on, shelf_days, note")
    .eq("active", true)
    .order("deposited_on", { ascending: true });
  return (data ?? []).map(withState);
}

/** Count of active batches that are expiring (≤1 day) or expired — the alert. */
export async function getPastryAlertCount(): Promise<number> {
  await requireStaff();
  const batches = await listPastryBatches();
  return batches.filter((b) => b.state !== "fresh").length;
}

export async function retireBatch(id: string) {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  await svc.from("pastry_batches").update({ active: false }).eq("id", id);
  revalidatePath("/pastries");
  return { ok: true as const };
}

// ── offers ──────────────────────────────────────────────────────────────────

export type Offer = { id: string; title: string; description: string | null; active: boolean; auto: boolean; ends_on: string | null };

export async function listOffers(): Promise<Offer[]> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { data } = await svc.from("offers").select("id, title, description, active, auto, ends_on").order("created_at", { ascending: false });
  return (data ?? []) as Offer[];
}

export async function addOffer(input: { title: string; description?: string; ends_on?: string }) {
  await requireStaff();
  const title = input.title.trim();
  if (!title) return { ok: false as const, error: "أدخل عنوان العرض." };
  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("offers").insert({
    title,
    description: input.description?.trim() || null,
    ends_on: input.ends_on?.trim() || null,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/pastries");
  revalidatePath("/menu");
  return { ok: true as const };
}

/** One-tap «عرض اليوم» from an expiring batch (offer ends the day it expires). */
export async function createOfferFromBatch(batchId: string) {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { data: b } = await svc.from("pastry_batches").select("item_name, deposited_on, shelf_days").eq("id", batchId).maybeSingle();
  if (!b) return { ok: false as const, error: "الدفعة غير موجودة." };
  const { error } = await svc.from("offers").insert({
    title: `🎁 عرض اليوم — ${b.item_name}`,
    description: `${b.item_name} بسعر خاص اليوم (كمية محدودة).`,
    auto: true,
    batch_id: batchId,
    ends_on: addDays(b.deposited_on, b.shelf_days),
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/pastries");
  revalidatePath("/menu");
  return { ok: true as const };
}

export async function toggleOffer(id: string, active: boolean) {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  await svc.from("offers").update({ active }).eq("id", id);
  revalidatePath("/pastries");
  revalidatePath("/menu");
  return { ok: true as const };
}

export async function deleteOffer(id: string) {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  await svc.from("offers").delete().eq("id", id);
  revalidatePath("/pastries");
  revalidatePath("/menu");
  return { ok: true as const };
}

// ── public: active offers for the customer menu ─────────────────────────────

export type PublicOffer = { id: string; title: string; description: string | null };

/** Currently-active offers for the menu. Public (anon reads the active_offers view). */
export async function getActiveOffers(): Promise<PublicOffer[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("active_offers").select("id, title, description");
  return (data ?? []) as PublicOffer[];
}

// ── per-item daily offers (hot-drink pastry cross-sell) ─────────────────────

export type ItemOffer = { item_id: string; name_ar: string; price: number; offer_price: number };

/** Today's per-item offers as { item_id: offer_price }. Public (menu reads it). */
export async function getActiveItemOffers(): Promise<Record<string, number>> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("active_item_offers").select("item_id, offer_price");
  const map: Record<string, number> = {};
  for (const r of data ?? []) map[r.item_id] = r.offer_price;
  return map;
}

/** Set today's offer price for an item (0 = مجاناً). Staff only. */
export async function setItemOffer(itemId: string, offerPrice: number) {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { error } = await svc
    .from("item_offers")
    .upsert({ item_id: itemId, offer_price: Math.max(0, Math.round(offerPrice)), business_day: businessDay() }, { onConflict: "item_id,business_day" });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/pastries");
  revalidatePath("/menu");
  return { ok: true as const };
}

export async function clearItemOffer(itemId: string) {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  await svc.from("item_offers").delete().eq("item_id", itemId).eq("business_day", businessDay());
  revalidatePath("/pastries");
  revalidatePath("/menu");
  return { ok: true as const };
}

/** Today's item offers with the item's name + base price (admin list). */
export async function listTodayItemOffers(): Promise<ItemOffer[]> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { data } = await svc.from("item_offers").select("item_id, offer_price").eq("business_day", businessDay());
  if (!data?.length) return [];
  const ids = data.map((d) => d.item_id);
  const { data: items } = await svc.from("menu_items").select("id, name_ar, price").in("id", ids);
  const byId = new Map((items ?? []).map((i) => [i.id, i]));
  return data.map((d) => ({ item_id: d.item_id, name_ar: byId.get(d.item_id)?.name_ar ?? "؟", price: byId.get(d.item_id)?.price ?? 0, offer_price: d.offer_price }));
}
