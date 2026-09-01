"use server";

import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "./auth";

/**
 * Break-even and the recommendation engine.
 *
 * Everything here is only as good as two numbers the owner has to type: item
 * costs (/menu-admin) and monthly fixed costs (/expenses). Rather than guess
 * when they are missing, the whole feature reports `configured: false` and the
 * UI explains what is needed — a break-even tracker that claims success at zero
 * is worse than no tracker at all, because it gets believed.
 */

export type Bep = {
  fixed_cost: number;
  revenue: number;
  cogs: number;
  gross_profit: number;
  remaining: number;
  met: boolean;
  configured: boolean;
  orders_count: number;
};

export type Recommendation = {
  id: string;
  name_ar: string;
  category_name: string;
  price: number;
  margin: number;
  margin_pct: number;
  expiry_pressure: number | null;
  reason: string;
};

/**
 * الإدارة وحدها، وبمفتاح الخدمة.
 *
 * كان requireStaff وبجلسة المستخدم — أي أن الدالة كانت ممنوحة لـ`authenticated`،
 * فيستدعيها الكاشير من أدوات المطوّر ويقرأ الإيراد والكلفة والربح الإجمالي
 * مباشرة، دون المرور بأي شاشة. نقلُها إلى مفتاح الخدمة هو ما يسمح بسحب المنح
 * من `authenticated` نهائياً.
 */
export async function getBep(): Promise<Bep | null> {
  await requireAdmin();
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("bep_today");
  if (error) return null;
  return (data?.[0] as Bep | undefined) ?? null;
}

/** Admin view: names, margins and why each is being pushed. Margins are profit. */
export async function getRecommendations(limit = 6): Promise<Recommendation[]> {
  await requireAdmin();
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase.rpc("recommended_items", { p_limit: limit });
  return (data ?? []) as Recommendation[];
}

/** What the customer sees — never a margin, never a cost. */
export type ChefPick = { id: string; name_ar: string; category_name: string; price: number };

/**
 * «على ذوقكم» — the customer-facing combo.
 *
 * Built from the same ranking the staff screen uses, but stripped to name and
 * selling price. The customer is being shown the shop's most profitable and
 * most perishable items dressed as a chef's recommendation; showing them the
 * margin would rather give the game away.
 */
export async function getChefPicks(count = 3): Promise<ChefPick[]> {
  const supabase = await createSupabaseServerClient();
  // chef_picks, NOT recommended_items: this path runs with the customer's anon
  // key, and recommended_items returns margin. The narrow function is the
  // boundary — see 0041.
  //
  // Pull a wider slate than needed so the suggestion varies between customers
  // instead of every single person being offered the identical three items.
  const { data } = await supabase.rpc("chef_picks", { p_limit: Math.max(count * 3, 9) });
  const pool = (data ?? []) as ChefPick[];
  if (!pool.length) return [];

  const picked: ChefPick[] = [];
  const seenCategory = new Set<string>();
  // one item per category first — a "combo" of three burgers is not a combo
  for (const r of pool) {
    if (picked.length >= count) break;
    if (seenCategory.has(r.category_name)) continue;
    seenCategory.add(r.category_name);
    picked.push({ id: r.id, name_ar: r.name_ar, category_name: r.category_name, price: r.price });
  }
  // top up from whatever is left if the menu has fewer categories than `count`
  for (const r of pool) {
    if (picked.length >= count) break;
    if (picked.some((p) => p.id === r.id)) continue;
    picked.push({ id: r.id, name_ar: r.name_ar, category_name: r.category_name, price: r.price });
  }
  return picked;
}
