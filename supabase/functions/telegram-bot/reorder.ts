/**
 * «طلباتي السابقة»: طلب محفوظ (قيّمه صاحبه فوق ٨) → أسطر سلّة تُعرض للتأكيد.
 *
 * الأسعار من المنيو الحالي لا من الطلب القديم (السعر قد تغيّر)، والصنف أو
 * الحجم الذي لم يعد موجوداً يُسقط بصمت — ما يبقى يُطلب. نقي: بلا شبكة.
 */
import type { CartLine, Menu } from "./order-flow.ts";

export type SavedItem = { item_id: string | null; variant_id: string | null; name_ar: string; flavor_ar: string | null; qty: number; note: string | null };
export type SavedOrder = { id: string; order_seq: number; subtotal: number; created_at: string; items: SavedItem[] };

export function savedOrderToLines(order: SavedOrder, menu: Menu): CartLine[] {
  const out: CartLine[] = [];
  for (const it of order.items) {
    const item = menu.items.find((m) => m.id === it.item_id);
    if (!item) continue;
    const size = it.variant_id ? item.sizes.find((s) => s.id === it.variant_id) : null;
    if (it.variant_id && !size) continue;
    out.push({
      itemId: item.id,
      name: item.name,
      sizeName: size?.name ?? null,
      dough: it.flavor_ar && item.doughs.includes(it.flavor_ar) ? it.flavor_ar : (item.doughs[0] ?? null),
      qty: Math.min(20, Math.max(1, it.qty)),
      unitPrice: size ? size.price : item.price,
      note: it.note,
    });
  }
  return out;
}

/** سطر القائمة: «زنجر بوفالو ×2 + بيبسي — 12,000 د.ع» */
export function savedOrderLabel(order: SavedOrder): string {
  const names = order.items.map((i) => `${i.name_ar}${i.qty > 1 ? ` ×${i.qty}` : ""}`);
  const head = names.slice(0, 3).join(" + ") + (names.length > 3 ? ` +${names.length - 3}` : "");
  return `${head} — ${new Intl.NumberFormat("en-US").format(order.subtotal)} د.ع`;
}
