import type { MenuCategoryView, MenuItemView, MenuVariantView } from "./menu-data";
import type { CartLine } from "@/components/cafe/use-cart";

/**
 * سلة الزبون على هاتفه.
 *
 * كانت تفرغ بتحديث الصفحة أو سحبة رجوع — والزبون على الهاتف يخرج ليقرأ رسالة
 * ويعود. تُحفظ في localStorage وتُعاد عند الفتح، لكن **لا تُصدَّق**: ما حُفظ
 * أمس قد يكون صنفاً حُذف اليوم أو سعراً تغيّر، فكل سطر يُعاد بناؤه من المنيو
 * الحالي، وما لم يعد فيه يسقط. السعر دائماً من المنيو لا من المخزون.
 */
export const CART_KEY = "st-cart-v1";
const MAX_AGE_MS = 12 * 3_600_000;

/** المكان الوحيد الذي يقرّر مفتاح السطر واسمه وسعره — للإضافة والاسترجاع والمقترحات معاً. */
export function cartLine(
  it: MenuItemView,
  v: MenuVariantView | null,
  flavor: string | null,
  offers: Record<string, number>,
  qty = 1,
): CartLine {
  const base = offers[it.id] ?? it.price;
  // العرض يحلّ محلّ السعر الأساسي وأي حجم بسعره؛ الحجم الأغلى يحتفظ بسعره
  const unitPrice = v && v.price !== it.price ? v.price : base;
  return {
    key: `${it.id}|${v?.id ?? ""}|${flavor ?? ""}`,
    itemId: it.id,
    variantId: v?.id ?? null,
    flavor,
    name: it.name_ar + (v ? ` — ${v.name_ar}` : "") + (flavor ? ` (${flavor})` : ""),
    unitPrice,
    qty,
  };
}

export function restoreCart(
  raw: string | null,
  menu: MenuCategoryView[],
  offers: Record<string, number>,
  now = Date.now(),
): CartLine[] {
  if (!raw) return [];
  let saved: { at?: unknown; lines?: unknown };
  try {
    saved = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof saved?.at !== "number" || now - saved.at > MAX_AGE_MS || !Array.isArray(saved.lines)) return [];
  const byId = new Map(menu.flatMap((c) => c.items.map((i) => [i.id, i] as const)));
  const out: CartLine[] = [];
  for (const l of saved.lines as Partial<CartLine>[]) {
    const it = typeof l?.itemId === "string" ? byId.get(l.itemId) : undefined;
    if (!it) continue;
    const v = l.variantId ? it.variants.find((x) => x.id === l.variantId) : null;
    if (l.variantId && !v) continue;
    const flavor = typeof l.flavor === "string" && it.flavors.includes(l.flavor) ? l.flavor : null;
    const qty = Math.min(20, Math.floor(Number(l.qty) || 0));
    if (qty < 1) continue;
    out.push(cartLine(it, v ?? null, flavor, offers, qty));
  }
  return out;
}
