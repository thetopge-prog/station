/** Money helpers. All amounts are whole IQD (no minor unit). */

export const CURRENCY_LABEL_AR = "د.ع";

/** Format an integer IQD amount with thousands separators (Western digits, no decimals). */
export function formatIqd(amount: number): string {
  const n = Math.round(Number.isFinite(amount) ? amount : 0);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

/** Format with the Arabic currency label, e.g. "2,500 د.ع". */
export function formatIqdLabel(amount: number): string {
  return `${formatIqd(amount)} ${CURRENCY_LABEL_AR}`;
}

/**
 * زاد («مخصّص»): ما دفعه المندوب وما ذهب أجرةَ توصيل.
 *
 * فارغ = الافتراضي: الإجمالي ناقص أجرة الشركة (مناطق التوصيل المجاني، نحن
 * ندفعها). حيث يدفع الزبون للمندوب يكتب الكاشير الإجمالي كاملاً فتصير صفراً.
 * الرقم مقيَّد بين صفر والإجمالي: لا يدفع المندوب أكثر مما بيع.
 */
export function customSplit(total: number, fee: number, typed: number | null): { paid: number; commission: number } {
  const t = Math.max(0, Math.round(total));
  const paid = typed == null ? Math.max(0, t - Math.max(0, Math.round(fee))) : Math.min(t, Math.max(0, Math.round(typed)));
  return { paid, commission: t - paid };
}
