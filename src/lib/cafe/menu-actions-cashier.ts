"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireRole } from "./auth";
import { bustMenuCache } from "./menu-data";

/**
 * الكاشير يصنع صنفاً من صنف — على الكاونتر، أثناء الطلب.
 *
 * الزبون يريد «كنتاكي ٨ قطع» وليس في المنيو إلا ٣ قطع. بدل أن يُكتب في الملاحظة
 * ويُحسب بالسعر الخطأ، يُنسخ الصنف باسم وسعر جديدين ويبقى في المنيو ليُطلب
 * ثانية. وإن كان الاسم موجوداً في القسم نفسه — ولو كان الأصل — يُحدَّث سعره:
 * هذا هو «تعديل الأسعار من الكاشير» الذي طلبه صاحب المحل، لا خطأ فيه.
 *
 * صلاحية الكاشير (والمدير يمرّ). عميل الخدمة لأن menu_items مسحوب من authenticated.
 */
export async function cloneMenuItem(input: { fromItemId: string; name_ar: string; price: number }) {
  await requireRole("cashier");
  const name = input.name_ar.trim();
  const price = Math.max(0, Math.round(input.price || 0));
  if (!name) return { ok: false as const, error: "أدخل اسم الصنف." };

  const svc = createSupabaseServiceClient();
  const { data: src } = await svc
    .from("menu_items")
    .select("id, category_id, flavors, image_url, cost, sort, description_ar")
    .eq("id", input.fromItemId)
    .maybeSingle();
  if (!src) return { ok: false as const, error: "الصنف الأصلي غير موجود." };

  // no unique index on item names — the match is done here, by category and name
  const { data: match } = await svc
    .from("menu_items")
    .select("id, name_ar, flavors")
    .eq("category_id", src.category_id)
    .eq("is_active", true)
    .ilike("name_ar", name.replace(/[%_]/g, "\\$&"))
    .limit(1)
    .maybeSingle();

  let id: string;
  let flavors: string[];
  if (match) {
    const { error } = await svc.from("menu_items").update({ price }).eq("id", match.id);
    if (error) return { ok: false as const, error: error.message };
    id = match.id;
    flavors = match.flavors ?? [];
  } else {
    const { data: created, error } = await svc
      .from("menu_items")
      .insert({
        category_id: src.category_id,
        name_ar: name,
        description_ar: src.description_ar,
        image_url: src.image_url,
        price,
        cost: src.cost,
        flavors: src.flavors ?? [],
        is_active: true,
        // right after its parent on the grid
        sort: (src.sort ?? 0) + 1,
      })
      .select("id, flavors")
      .maybeSingle();
    if (error || !created) return { ok: false as const, error: error?.message ?? "تعذّر إنشاء الصنف." };
    id = created.id;
    flavors = created.flavors ?? [];
  }

  bustMenuCache();
  for (const p of ["/menu-admin", "/menu", "/kiosk", "/cashier"]) revalidatePath(p);
  return { ok: true as const, item: { id, name_ar: match?.name_ar ?? name, price, flavors, category_id: src.category_id } };
}
