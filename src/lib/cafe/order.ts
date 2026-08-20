/**
 * Pure cart/order math for client-side display. The server (place_order rpc) is
 * the authority — it recomputes every price from the DB — so these are for the
 * live cart total only, never trusted for billing.
 */

export type CartLine = { unitPrice: number; qty: number };

export function lineTotal(unitPrice: number, qty: number): number {
  return Math.max(0, Math.round(unitPrice)) * Math.max(0, Math.floor(qty));
}

export function orderSubtotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + lineTotal(l.unitPrice, l.qty), 0);
}

/** Subtotal minus a discount, floored at zero. */
export function orderTotal(lines: CartLine[], discount = 0): number {
  return Math.max(0, orderSubtotal(lines) - Math.max(0, Math.round(discount)));
}
