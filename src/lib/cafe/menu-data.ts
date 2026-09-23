import { isDemoServer } from "./demo";
import { DEMO_MENU } from "./demo-menu";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cacheMenu, cachedMenu } from "@/lib/hub/snapshot";
import { hubEnabled } from "@/lib/hub/store";
import { cloudReachable } from "@/lib/hub/net";

export type MenuVariantView = { id: string; name_ar: string; name_en?: string | null; price: number };
export type MenuItemView = {
  id: string;
  name_ar: string;
  /** غائب أو null = لا ترجمة بعد؛ المنيو الإنكليزي يعرض العربي بدل الفراغ.
   *  واختياريٌّ لا مطلوب: لقطة المنيو المحفوظة على جهاز المحل (hub) كُتبت
   *  قبل هذا العمود، وهي تُقرأ كما هي حين ينقطع الإنترنت. */
  name_en?: string | null;
  description: string | null;
  description_en?: string | null;
  image_url: string | null;
  price: number;
  flavors: string[];
  variants: MenuVariantView[];
};
export type MenuCategoryView = {
  name_ar: string;
  name_en?: string | null;
  image_url: string | null;
  /** يغلق 02:00 فجراً (0092) — المنيو يعدّ تنازلياً ويمنع الطلب حتى 09:00 */
  lateCutoff?: boolean;
  items: MenuItemView[];
};

// The menu is identical for every (anon) visitor and changes rarely, yet every
// page open re-hit the DB (pages are force-dynamic). Memoize the result per warm
// server instance for 30s so repeated opens skip the round-trip — admin edits
// still show within 30s. ponytail: in-memory TTL, no cross-instance cache; a
// cold serverless start pays one fetch. Bump/clear by redeploy if needed.
let _menuCache: { at: number; data: MenuCategoryView[] } | null = null;
const MENU_TTL_MS = 30_000;

/** the cashier just created an item and wants it on the grid now, not in 30 s */
export function bustMenuCache(): void {
  _menuCache = null;
}

/** The public menu (active items only). Demo → local seed; real → cost-free DB views. */
export async function getPublicMenu(): Promise<MenuCategoryView[]> {
  if (isDemoServer()) return DEMO_MENU;
  if (_menuCache && Date.now() - _menuCache.at < MENU_TTL_MS) return _menuCache.data;

  // Ask the shop's own copy first when the line is known to be down. Not just
  // an optimisation: an ISP that drops packets silently makes a fetch hang for
  // as long as it likes, and a customer staring at a spinner has already
  // decided about us. The probe is bounded at 1.5s and cached.
  if (hubEnabled() && !(await cloudReachable())) {
    const offline = await cachedMenu();
    if (offline?.length) return offline;
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: rows }, { data: vars }] = await Promise.all([
    supabase.from("menu_public").select("*").order("category_sort").order("sort"),
    supabase.from("variant_public").select("*").order("sort"),
  ]);

  const varsByItem = new Map<string, MenuVariantView[]>();
  for (const v of vars ?? []) {
    const arr = varsByItem.get(v.item_id) ?? [];
    arr.push({ id: v.id, name_ar: v.name_ar, name_en: v.name_en, price: v.price });
    varsByItem.set(v.item_id, arr);
  }

  const cats = new Map<string, MenuCategoryView>();
  for (const r of rows ?? []) {
    let c = cats.get(r.category_name);
    if (!c) {
      c = { name_ar: r.category_name, name_en: r.category_name_en, image_url: r.category_image, lateCutoff: !!r.category_late_cutoff, items: [] };
      cats.set(r.category_name, c);
    }
    c.items.push({
      id: r.id,
      name_ar: r.name_ar,
      name_en: r.name_en,
      description: r.description_ar,
      description_en: r.description_en,
      image_url: r.image_url,
      price: r.price,
      flavors: r.flavors ?? [],
      variants: varsByItem.get(r.id) ?? [],
    });
  }
  const result = [...cats.values()];
  // only cache a real menu — never a transient empty/failed fetch
  if (result.length > 0) {
    _menuCache = { at: Date.now(), data: result };
    void cacheMenu(result);
    return result;
  }
  // Empty means the fetch failed (the menu is never actually empty). On the
  // shop hub that is an outage, and a tablet showing an empty menu is a
  // customer who leaves — serve the last menu we saw instead.
  return (hubEnabled() ? await cachedMenu() : null) ?? result;
}
