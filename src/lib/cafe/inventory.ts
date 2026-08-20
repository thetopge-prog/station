import { businessDay } from "./time";

/**
 * Pure inventory helpers and shapes.
 *
 * Separate from inventory-actions.ts because that file is "use server", and a
 * server-action module may only export async functions — a sync helper there is
 * a build error, not a lint warning.
 */

export type StockState = "ok" | "low" | "out";

export type StockRow = {
  id: string;
  name_ar: string;
  unit: string;
  category: string | null;
  min_qty: number;
  on_hand: number;
  avg_unit_cost: number;
  nearest_expiry: string | null;
  stock_state: StockState;
};

/** Days until a batch is unusable. Negative = already expired, null = no date. */
export function daysUntil(date: string | null, today: string = businessDay()): number | null {
  if (!date) return null;
  return Math.round((new Date(date).getTime() - new Date(today).getTime()) / 86_400_000);
}

/**
 * How urgently a row needs a human. Lower sorts first.
 *
 * Expiry outranks running out: an empty bin costs a sale, a spoiled one costs
 * the stock AND can reach a customer.
 */
export function urgency(row: StockRow, today: string = businessDay()): number {
  const d = daysUntil(row.nearest_expiry, today);
  if (d !== null && d < 0) return 0;
  if (d !== null && d <= 3) return 1;
  if (row.stock_state === "out") return 2;
  if (row.stock_state === "low") return 3;
  return 4;
}
