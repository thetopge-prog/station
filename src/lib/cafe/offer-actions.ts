"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "./auth";
import { businessDay } from "./time";
import { hubEnabled } from "@/lib/hub/store";
import { cloudReachable } from "@/lib/hub/net";

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
  revalidatePath("/offers");
  revalidatePath("/menu");
  return { ok: true as const };
}

export async function toggleOffer(id: string, active: boolean) {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  await svc.from("offers").update({ active }).eq("id", id);
  revalidatePath("/offers");
  revalidatePath("/menu");
  return { ok: true as const };
}

export async function deleteOffer(id: string) {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  await svc.from("offers").delete().eq("id", id);
  revalidatePath("/offers");
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

// ── per-item daily offers: one item, one day, one price ─────────────────────

export type ItemOffer = { item_id: string; name_ar: string; price: number; offer_price: number };

/** Today's per-item offers as { item_id: offer_price }. Public (menu reads it). */
export async function getActiveItemOffers(): Promise<Record<string, number>> {
  // The customer menu awaits this alongside the menu itself, so on a hub with
  // no line it is the call that decides how long a tablet shows a blank screen.
  // Today's offers are a nicety; the menu is the product.
  if (hubEnabled() && !(await cloudReachable())) return {};
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
  revalidatePath("/offers");
  revalidatePath("/menu");
  return { ok: true as const };
}

export async function clearItemOffer(itemId: string) {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  await svc.from("item_offers").delete().eq("item_id", itemId).eq("business_day", businessDay());
  revalidatePath("/offers");
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
