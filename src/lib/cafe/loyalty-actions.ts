"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff, requireAdmin } from "./auth";
import { loyaltyConfig } from "./config";
import { earnPoints } from "./points";

export type Card = { id: string; name_ar: string | null; points: number };
export type FoundCard = Card & { serial: string };

/** Look up a card by its serial (scanned QR / manual entry) OR by the
 *  customer's phone number — all-digit queries are treated as phones. */
export async function findCard(query: string): Promise<FoundCard | null> {
  await requireStaff();
  const q = query.trim().replace(/\s/g, "");
  if (!q) return null;
  if (/^\d{6,}$/.test(q)) {
    // phone path: customers has no authenticated grants → service client after the staff gate
    const svc = createSupabaseServiceClient();
    const { data } = await svc.from("customers").select("id, name_ar, points, card_serial").eq("phone", q).limit(1);
    const c = data?.[0];
    return c ? { id: c.id, name_ar: c.name_ar, points: c.points, serial: c.card_serial } : null;
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("get_card", { p_serial: q });
  return data?.[0] ? { ...data[0], serial: q } : null;
}

/** Card count — no PII, visible to every staff member. */
export async function countCustomers(): Promise<number> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { count } = await svc.from("customers").select("id", { count: "exact", head: true });
  return count ?? 0;
}

/** Create (or return existing by phone) a loyalty card; returns its serial. */
export async function createCard(input: { phone?: string; name?: string }): Promise<{ ok: true; serial: string } | { ok: false; error: string }> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_card", {
    p_phone: input.phone?.trim() || null,
    p_name: input.name?.trim() || null,
  });
  if (error || !data) return { ok: false, error: error?.message ?? "تعذّر إنشاء البطاقة." };
  revalidatePath("/loyalty");
  return { ok: true, serial: data };
}

/** Manually add/subtract points (goodwill). */
export async function adjustPoints(customerId: string, delta: number, reason = "manual_adjust") {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("adjust_points", {
    p_customer: customerId,
    p_delta: Math.round(delta),
    p_reason: reason,
    p_key: crypto.randomUUID(),
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/loyalty");
  return { ok: true as const, balance: data as number };
}

/** Award points for a purchase amount — floor(amount / pointsPerIqd). Lets the
 *  cashier grant loyalty points by entering what the customer spent. */
export async function awardForSpend(customerId: string, amountIqd: number) {
  const cfg = loyaltyConfig();
  const pts = earnPoints(Math.max(0, Math.round(amountIqd)), cfg.pointsPerIqd);
  if (pts <= 0) return { ok: false as const, error: "المبلغ صغير على منح نقطة." };
  return adjustPoints(customerId, pts);
}

/** Redeem one reward: deducts pointsPerReward, returns the discount value to apply. */
export async function redeemReward(customerId: string, orderTotal: number): Promise<{ ok: true; balance: number; discount: number } | { ok: false; error: string }> {
  await requireStaff();
  const cfg = loyaltyConfig();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("redeem_points", {
    p_customer: customerId,
    p_cost: cfg.pointsPerReward,
    p_key: crypto.randomUUID(),
  });
  if (error) return { ok: false, error: error.message };
  const discount = Math.min(cfg.rewardValueIqd, Math.max(0, Math.round(orderTotal)));
  revalidatePath("/loyalty");
  return { ok: true, balance: data as number, discount };
}

export type CustomerRow = { id: string; card_serial: string; name_ar: string | null; phone: string | null; points: number; created_at: string };

/** Admin customer list (includes phone PII → admin only, via service client). */
export async function listCustomers(limit = 100): Promise<CustomerRow[]> {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("customers")
    .select("id, card_serial, name_ar, phone, points, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as CustomerRow[];
}

/** Public card lookup for /card/[serial] — no auth (anon rpc). */
export async function getCardPublic(serial: string): Promise<Card | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("get_card", { p_serial: serial.trim() });
  return data?.[0] ?? null;
}
