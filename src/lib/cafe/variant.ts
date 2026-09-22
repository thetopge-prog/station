import type { MenuVariantView } from "./menu-data";

/**
 * الحجم المختار سلفاً: الأرخص لا أوّل صفّ.
 *
 * ترتيب الأحجام في القاعدة ليس مضموناً (خمسة أصناف كان sort=0 فيها)، وأوّلها
 * كان «وجبة» فيُسجَّل سعر أعلى بلا أن يطلبه الزبون. وهو هنا لا في menu-data:
 * ذاك ملفّ خادم (يفتح قاعدة البيانات) وشاشات الزبون والكاشير تعمل في المتصفح.
 */
export function cheapestVariant(item: { variants: MenuVariantView[] }): MenuVariantView | null {
  if (!item.variants.length) return null;
  return item.variants.reduce((a, b) => (b.price < a.price ? b : a));
}
