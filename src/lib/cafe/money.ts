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
