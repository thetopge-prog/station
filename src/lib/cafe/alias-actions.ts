"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "./auth";
import { foldArabic } from "./external-order";

/**
 * أسماء الأصناف عند شركة التوصيل — الإدارة تربطها مرّة واحدة.
 *
 * «سندويش زنجر» عند توترز = «كلاسيك زنجر · وجبة» عندنا. الجدول يُقرأ من مسار
 * الطلبات الخارجية عند كل شاشة، ويُكتب من هنا. المفتاح مطويّ (foldArabic)
 * فتتطابق «صلصة جبنة» و«صلصه جبنه».
 */

export type AliasSource = "toters" | "talabaty" | "zad";
export type Alias = { id: string; alias: string; item_id: string; variant_id: string | null; flavor: string | null };

export async function listAliases(source: AliasSource): Promise<Alias[]> {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { data } = await svc.from("partner_item_aliases").select("id, alias, item_id, variant_id, flavor").eq("source", source).order("alias");
  return data ?? [];
}

/** أسماء وصلت من الشاشة ولم تُعرف — آخر سبعة أيام، بلا تكرار */
export async function unknownAliases(source: AliasSource): Promise<string[]> {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("external_order_alerts")
    .select("unknown_items")
    // التنبيهات تعرف توترز وطلباتي؛ ما عداهما (زاد) يصل باسم «other»
    .eq("source", source === "zad" ? "other" : source)
    .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
    .not("unknown_items", "is", null);
  const seen = new Set<string>();
  for (const r of data ?? []) for (const u of r.unknown_items ?? []) seen.add(u);
  return [...seen].sort((a, b) => a.localeCompare(b, "ar"));
}

export async function saveAlias(input: { source: AliasSource; alias: string; item_id: string; variant_id?: string | null; flavor?: string | null }) {
  await requireAdmin();
  const alias = input.alias.trim();
  if (!alias) return { ok: false as const, error: "أدخل الاسم كما يظهر عند الشركة." };
  if (!input.item_id) return { ok: false as const, error: "اختر الصنف عندنا." };
  const svc = createSupabaseServiceClient();
  const row = { source: input.source, alias, alias_key: foldArabic(alias), item_id: input.item_id, variant_id: input.variant_id || null, flavor: input.flavor?.trim() || null };
  const { error } = await svc.from("partner_item_aliases").upsert(row, { onConflict: "source,alias_key" });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/partners");
  return { ok: true as const };
}

export async function deleteAlias(id: string) {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("partner_item_aliases").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/partners");
  return { ok: true as const };
}
