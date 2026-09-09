/**
 * شركة التوصيل تُعرف من اسمها أو من مفتاح المصدر على الطلب.
 *
 * صِرف، بلا خادم ولا عميل: تستعمله الشاشة للشعار، والخادم ليربط طلب توترز
 * القادم من جهازها بصفّ الشركة في delivery_partners.
 */
export type PartnerSlug = "toters" | "talabatey" | "zad";

const SLUGS: [RegExp, PartnerSlug][] = [
  [/toters|توترز/i, "toters"],
  [/talabat|طلبات/i, "talabatey"],
  [/\bzad\b|زاد/i, "zad"],
];

export function partnerSlug(nameOrSource: string | null | undefined): PartnerSlug | null {
  if (!nameOrSource) return null;
  return SLUGS.find(([re]) => re.test(nameOrSource))?.[1] ?? null;
}

/** مفتاح المصدر على الطلب (orders.order_source) لكل شركة */
export const SOURCE_OF_SLUG: Record<PartnerSlug, "toters" | "talabaty" | "zad"> = { toters: "toters", talabatey: "talabaty", zad: "zad" };
